export const MODEL_CATALOG = [
    { id: "claude-opus-5", label: "Claude Opus 5", family: "Claude" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", family: "Claude" },
    { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", family: "Claude" },
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", family: "GPT" },
    { id: "gpt-5.5", label: "GPT-5.5", family: "GPT" },
    { id: "gpt-5-mini", label: "GPT-5 mini", family: "GPT" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", family: "Gemini" },
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", family: "Gemini" },
    { id: "grok-4.5", label: "Grok 4.5", family: "Grok" },
];

export const DEFAULT_MODELS = ["claude-opus-5", "gpt-5.6-sol", "gemini-3.5-flash"];

function familyOf(id) {
    if (id === "auto") return "Auto";
    if (id.startsWith("claude")) return "Claude";
    if (id.startsWith("gpt")) return "GPT";
    if (id.startsWith("gemini")) return "Gemini";
    if (id.startsWith("grok")) return "Grok";
    return "Other";
}

function normalize(entry) {
    const id = typeof entry === "string" ? entry : entry?.id;
    if (typeof id !== "string" || id.trim() === "") {
        return null;
    }
    const known = MODEL_CATALOG.find((model) => model.id === id);
    return {
        id,
        label: entry?.name ?? entry?.label ?? known?.label ?? id,
        family: known?.family ?? familyOf(id),
    };
}

function merge(entries) {
    const byId = new Map();
    for (const entry of [...entries, ...MODEL_CATALOG]) {
        const model = normalize(entry);
        if (model && !byId.has(model.id)) {
            byId.set(model.id, model);
        }
    }
    return [...byId.values()];
}

/**
 * Best-effort model discovery. The extension session has no public `listModels`,
 * so this reaches for the runtime request and falls back to the curated catalog.
 */
export async function listModels(session) {
    try {
        const connection = session?.connection;
        const response = await connection?.sendRequest?.("models.list", {});
        const models = response?.models ?? response?.list;
        if (Array.isArray(models) && models.length > 0) {
            return { models: merge(models), source: "runtime" };
        }
    } catch {
        // The runtime request is optional; the curated catalog is the contract.
    }
    return { models: merge([]), source: "catalog" };
}
