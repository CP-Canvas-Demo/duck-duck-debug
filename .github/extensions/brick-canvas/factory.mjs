import { defineFactory } from "@github/copilot-sdk/extension";
import { buildPrompt, decodeRows, duckSchema, isUnknownAgent } from "./duck.mjs";
import { minimalRaceResults } from "./result.mjs";

// A tool-free agent and low reasoning effort keep each board to one short
// round trip, which is what makes a three-model race demo-fast.
const ARTIST_AGENT = "duck-artist";
const REASONING_EFFORT = "low";

/**
 * @param {{
 *   readGrid: () => Promise<Array<Array<string | null>>>,
 *   onStart: (slotId: string) => Promise<void>,
 *   onResult: (slotId: string, studs: object[], note: string | null) => Promise<{ applied?: object[] } | undefined>,
 *   onFailure: (slotId: string, error: string) => Promise<void>,
 *   onFinish: (error?: string | null) => Promise<void>,
 * }} hooks
 */
export function createDuckRaceFactory(hooks) {
    return defineFactory({
        meta: {
            name: "duck-race",
            description:
                "Finish the same rubber duck on up to three brick boards, one model per board. " +
                "args: { slots: { id: string, model: string }[] } — the boards to race.",
            phases: [{ title: "Race", detail: "Each model finishes its own board" }],
            argsSchema: {
                type: "object",
                required: ["slots"],
                properties: {
                    slots: {
                        type: "array",
                        items: {
                            type: "object",
                            required: ["id", "model"],
                            properties: {
                                id: { type: "string" },
                                model: { type: "string" },
                            },
                        },
                    },
                },
            },
        },
        run: async (ctx) => {
            const slots = Array.isArray(ctx.args?.slots) ? ctx.args.slots : [];
            if (slots.length === 0) {
                await hooks.onFinish("No boards were enabled for this race.");
                return { boards: [] };
            }

            ctx.phase("Race");
            const prompt = buildPrompt(await hooks.readGrid());
            let failure = null;
            let artistAvailable = true;

            // The tool-free agent is an optimization, not a requirement. If the
            // host cannot resolve it the board retries on the default agent, but
            // only then: retrying a weak-but-valid answer would buy a second
            // full-price agent and double the board's time, which is exactly the
            // slowness this race is trying to avoid.
            const ask = async (slot) => {
                // The model comes first so it stays visible in the Insights tab even
                // when every board shares the same "duck-artist" custom agent type.
                const base = {
                    label: `${slot.model} — board ${slot.id.toUpperCase()}`,
                    model: slot.model,
                    reasoningEffort: REASONING_EFFORT,
                    schema: duckSchema,
                };
                if (!artistAvailable) {
                    return ctx.agent(prompt, base);
                }
                let raw;
                try {
                    raw = await ctx.agent(prompt, {
                        ...base,
                        label: `${base.label} (duck-artist)`,
                        agent: ARTIST_AGENT,
                    });
                } catch (error) {
                    if (!isUnknownAgent(error, ARTIST_AGENT)) throw error;
                    artistAvailable = false;
                    ctx.log(
                        `The ${ARTIST_AGENT} agent is unavailable, so boards run on the default agent instead.`,
                    );
                    return ctx.agent(prompt, base);
                }
                // Some hosts resolve an unknown custom agent to an empty result
                // instead of throwing. Treat that the same as an unknown-agent
                // error: fall back to the default agent rather than reporting a
                // board failure that has nothing to do with the model itself.
                if (decodeRows(raw).studs.length === 0) {
                    artistAvailable = false;
                    ctx.log(
                        `The ${ARTIST_AGENT} agent returned no usable studs, so boards run on the default agent instead.`,
                    );
                    return ctx.agent(prompt, base);
                }
                return raw;
            };

            try {
                const boards = await ctx.parallel(
                    slots.map((slot) => async () => {
                        await hooks.onStart(slot.id);
                        const startedAt = Date.now();
                        let raw;
                        try {
                            // A unique label keeps identical prompts from collapsing
                            // into one memoized subagent.
                            raw = await ask(slot);
                        } catch (error) {
                            await hooks.onFailure(
                                slot.id,
                                error instanceof Error ? error.message : String(error),
                            );
                            throw error;
                        }

                        const { studs, note } = decodeRows(raw);
                        if (studs.length === 0) {
                            await hooks.onFailure(
                                slot.id,
                                `${slot.model} did not return any usable studs.`,
                            );
                            return {
                                id: slot.id,
                                model: slot.model,
                                studsUsed: 0,
                                timeTakenMs: Date.now() - startedAt,
                            };
                        }
                        const applied = await hooks.onResult(slot.id, studs, note);
                        const timeTakenMs = Date.now() - startedAt;
                        return {
                            studsUsed: applied?.applied?.length ?? 0,
                            timeTakenMs,
                        };
                    }),
                );
                return minimalRaceResults(boards);
            } catch (error) {
                failure = error instanceof Error ? error.message : String(error);
                throw error;
            } finally {
                await hooks.onFinish(failure);
            }
        },
    });
}
