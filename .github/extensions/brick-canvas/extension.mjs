import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
    CanvasError,
    createCanvas,
    joinSession,
} from "@github/copilot-sdk/extension";
import { createDuckRaceFactory } from "./factory.mjs";
import { listModels } from "./models.mjs";
import { renderHtml } from "./ui.mjs";
import {
    applyVariant,
    COLOR_OPTIONS,
    eraseStud,
    failVariant,
    finishRun,
    InputError,
    lockPaintedStuds,
    markVariant,
    paintStuds,
    presentBuild,
    readBuild,
    resetBuild,
    setSlots,
    SLOT_IDS,
    startRun,
    writeBuild,
} from "./state.mjs";

const buildPath = resolve(
    tmpdir(),
    `copilot-brick-canvas-${process.env.COPILOT_SESSION_ID ?? "default"}.json`,
);
const servers = new Map();
let mutationQueue = Promise.resolve();
let modelCache = null;

function message(error) {
    return error instanceof Error ? error.message : String(error);
}

function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
    });
    response.end(`${JSON.stringify(body)}\n`);
}

async function readJson(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 64 * 1024) {
            throw new InputError("Request body exceeds 64 KB.");
        }
        chunks.push(chunk);
    }
    try {
        return chunks.length === 0
            ? {}
            : JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
        throw new InputError(`Request body is not valid JSON: ${message(error)}`);
    }
}

async function snapshot() {
    await mutationQueue;
    return presentBuild(await readBuild(buildPath));
}

function mutate(change) {
    const operation = mutationQueue.then(async () => {
        const build = await readBuild(buildPath);
        const details = change(build);
        if (details === SKIP) {
            return { details: undefined, snapshot: presentBuild(build) };
        }
        await writeBuild(buildPath, build);
        return { details, snapshot: presentBuild(build) };
    });
    mutationQueue = operation.catch(() => undefined);
    return operation;
}

// A race writes board results over time, but the extension can be reloaded
// mid-race. The old process keeps its own currentRunId, so once a newer run
// owns the file its stale hooks stop writing instead of clobbering boards that
// belong to the new race.
let currentRunId = null;

// Returned by a fenced change to mean "this run no longer owns the board".
const SKIP = Symbol("skip");

function fenced(change) {
    return (build) => {
        if (build.run?.id !== currentRunId) return SKIP;
        return change(build);
    };
}

async function run(action) {
    try {
        return await action();
    } catch (error) {
        throw new CanvasError("brick_canvas_error", message(error));
    }
}

const duckRace = createDuckRaceFactory({
    readGrid: async () => (await snapshot()).build.grid,
    onStart: async (slotId) => {
        await mutate(fenced((build) => markVariant(build, slotId, "running")));
    },
    onResult: async (slotId, studs, note) => {
        const result = await mutate(
            fenced((build) => applyVariant(build, slotId, studs, note)),
        );
        return result.details;
    },
    onFailure: async (slotId, error) => {
        await mutate(fenced((build) => failVariant(build, slotId, error)));
    },
    onFinish: async (error) => {
        await mutate(fenced((build) => finishRun(build, error ?? null)));
    },
});

function handoffPrompt() {
    return `The human pressed "Ask Copilot to finish" in the Duck, Duck, Debug canvas.
First call the brick-canvas get_build action, then finish the rubber duck.
Every locked stud is the human's contribution: do not change or erase it.
Use canvas actions only; do not edit the board file directly or reset the build.
If the human's tiles make a recognizable duck impossible, leave them unchanged
and suggest the smallest edits that would make a duck possible.`;
}

async function startRace(session) {
    const current = await snapshot();
    if (!current.handoff.ready) {
        throw new InputError(current.handoff.instruction);
    }
    const enabled = current.slots.filter((slot) => slot.enabled);
    if (enabled.length === 0) {
        throw new InputError("Enable at least one board before racing.");
    }

    const runId = randomUUID();
    currentRunId = runId;
    await mutate((build) => {
        lockPaintedStuds(build);
        startRun(build, runId);
    });

    const racing = session.factory
        .run(duckRace, {
            args: { slots: enabled.map(({ id, model }) => ({ id, model })) },
        })
        .then(async (result) => {
            if (result?.status !== "completed") {
                await mutate(
                    fenced((build) =>
                        finishRun(build, result?.failure?.message ?? result?.error ?? `The race ended as ${result?.status ?? "unknown"}.`),
                    ),
                );
            }
        })
        .catch(async (error) => {
            // A host without extension factories still deserves a finished duck,
            // so fall back to the single-model handoff on the current session.
            if (currentRunId !== runId) return;
            await mutate(
                fenced((build) =>
                    finishRun(
                        build,
                        `${message(error)} Falling back to the current session model.`,
                    ),
                ),
            );
            await session.send({ prompt: handoffPrompt() }).catch(() => undefined);
        });
    // The canvas polls for progress, so the HTTP response must not wait for the race.
    void racing;

    return { accepted: true, boards: enabled.length };
}

async function askCopilot(session) {
    const current = await snapshot();
    if (!current.handoff.ready) {
        throw new InputError(current.handoff.instruction);
    }
    await mutate(lockPaintedStuds);
    await session.send({ prompt: handoffPrompt() });
    return { accepted: true };
}

async function handleRequest(session, request, response) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, {
            "Cache-Control": "no-store",
            "Content-Security-Policy":
                "default-src 'self'; connect-src 'self'; img-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
            "Content-Type": "text/html; charset=utf-8",
        });
        response.end(renderHtml());
        return;
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
        sendJson(response, 200, await snapshot());
        return;
    }
    if (request.method === "GET" && url.pathname === "/api/models") {
        modelCache ??= await listModels(session);
        sendJson(response, 200, modelCache);
        return;
    }
    if (request.method !== "POST") {
        sendJson(response, 404, { error: "Not found." });
        return;
    }

    const input = await readJson(request);
    if (url.pathname === "/api/slots") {
        const current = await snapshot();
        if (current.handoff.racing) {
            throw new InputError("Wait for the current race to finish.");
        }
        sendJson(response, 200, await mutate((build) => setSlots(build, input.slots)));
        return;
    }
    if (url.pathname === "/api/race") {
        if (input.confirm !== true) {
            throw new InputError("Racing requires confirm=true.");
        }
        sendJson(response, 202, await startRace(session));
        return;
    }
    if (url.pathname === "/api/handoff") {
        if (input.confirm !== true) {
            throw new InputError("Handoff requires confirm=true.");
        }
        sendJson(response, 202, await askCopilot(session));
        return;
    }
    if (url.pathname === "/api/reset") {
        if (input.confirm !== true) {
            throw new InputError("Reset requires confirm=true.");
        }
        sendJson(response, 200, await mutate(resetBuild));
        return;
    }
    if (url.pathname === "/api/paint") {
        const current = await snapshot();
        if (!current.handoff.editable) {
            throw new InputError("Reset the board to start a new duck.");
        }
        sendJson(
            response,
            200,
            await mutate((build) =>
                paintStuds(build, [
                    {
                        row: input.row,
                        column: input.column,
                        color: input.color,
                    },
                ]),
            ),
        );
        return;
    }
    if (url.pathname === "/api/erase") {
        const current = await snapshot();
        if (!current.handoff.editable) {
            throw new InputError("Reset the board to start a new duck.");
        }
        sendJson(
            response,
            200,
            await mutate((build) => eraseStud(build, input.row, input.column)),
        );
        return;
    }
    sendJson(response, 404, { error: "Not found." });
}

async function startServer(session, instanceId) {
    const server = createServer((request, response) => {
        void handleRequest(session, request, response).catch((error) => {
            if (!response.headersSent) {
                sendJson(response, error instanceof InputError ? 400 : 500, {
                    error: message(error),
                });
            } else {
                response.end();
            }
        });
    });
    await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(0, "127.0.0.1", () => {
            server.removeListener("error", rejectListen);
            resolveListen();
        });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Canvas server did not receive a loopback port.");
    }
    const entry = { server, url: `http://127.0.0.1:${address.port}/` };
    servers.set(instanceId, entry);
    return entry;
}

const session = await joinSession({
    factories: [duckRace],
    canvases: [
        createCanvas({
            id: "brick-canvas",
            displayName: "Duck, Duck, Debug",
            description:
                "Start a rubber duck, then compare up to three models as they finish it without changing your tiles.",
            actions: [
                {
                    name: "get_build",
                    description:
                        "Read the human board, every model board, and protected human studs. Coordinates are 1-based.",
                    handler: async () => run(snapshot),
                },
                {
                    name: "paint_studs",
                    description:
                        "Paint one or more studs without changing protected human studs. Target the human board or one model board.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            board: {
                                type: "string",
                                enum: ["human", ...SLOT_IDS],
                                description:
                                    'Board to paint. Defaults to "human", the board the person edits.',
                            },
                            studs: {
                                type: "array",
                                minItems: 1,
                                maxItems: 144,
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        row: { type: "integer", minimum: 1, maximum: 12 },
                                        column: { type: "integer", minimum: 1, maximum: 12 },
                                        color: {
                                            type: "string",
                                            enum: COLOR_OPTIONS.map((color) => color.id),
                                        },
                                    },
                                    required: ["row", "column", "color"],
                                },
                            },
                        },
                        required: ["studs"],
                    },
                    handler: async (context) =>
                        run(() =>
                            mutate((build) =>
                                paintStuds(build, context.input.studs, {
                                    board: context.input.board,
                                }),
                            ),
                        ),
                },
            ],
            open: async (context) => {
                const entry =
                    servers.get(context.instanceId) ??
                    (await startServer(session, context.instanceId));
                return {
                    title: "Duck, Duck, Debug",
                    status: "Human starts, models finish in parallel",
                    url: entry.url,
                };
            },
            onClose: async (context) => {
                const entry = servers.get(context.instanceId);
                if (!entry) {
                    return;
                }
                servers.delete(context.instanceId);
                await new Promise((resolveClose) =>
                    entry.server.close(() => resolveClose()),
                );
            },
        }),
    ],
});
