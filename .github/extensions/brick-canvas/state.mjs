import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_MODELS } from "./models.mjs";

export const GRID_SIZE = 12;
export const SLOT_IDS = ["a", "b", "c"];
export const STATE_VERSION = 2;
export const COLOR_OPTIONS = [
    { id: "yellow", label: "Yellow", fallback: "#ffd500" },
    { id: "orange", label: "Orange", fallback: "#f47b20" },
    { id: "blue", label: "Blue", fallback: "#006db7" },
    { id: "red", label: "Red", fallback: "#da291c" },
    { id: "green", label: "Green", fallback: "#00a651" },
    { id: "white", label: "White", fallback: "#f6f7f8" },
    { id: "black", label: "Black", fallback: "#24292f" },
    { id: "pink", label: "Pink", fallback: "#ef77a8" },
];

const VARIANT_STATUSES = new Set([
    "idle",
    "queued",
    "running",
    "done",
    "failed",
    "skipped",
]);
const RUN_STATUSES = new Set(["idle", "running", "done", "error"]);
const colors = new Set(COLOR_OPTIONS.map((color) => color.id));

export class InputError extends Error {}

function matrix(value) {
    return Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => value),
    );
}

function copyGrid(grid) {
    return grid.map((row) => [...row]);
}

function assertCoordinate(row, column) {
    if (
        !Number.isInteger(row) ||
        !Number.isInteger(column) ||
        row < 1 ||
        row > GRID_SIZE ||
        column < 1 ||
        column > GRID_SIZE
    ) {
        throw new InputError(`Use rows and columns from 1 to ${GRID_SIZE}.`);
    }
}

function assertMatrix(value, name, validCell) {
    if (
        !Array.isArray(value) ||
        value.length !== GRID_SIZE ||
        value.some(
            (row) =>
                !Array.isArray(row) ||
                row.length !== GRID_SIZE ||
                row.some((cell) => !validCell(cell)),
        )
    ) {
        throw new Error(`${name} must be a ${GRID_SIZE} by ${GRID_SIZE} matrix.`);
    }
}

function createSlot(id, index) {
    return { id, model: DEFAULT_MODELS[index] ?? DEFAULT_MODELS[0], enabled: true };
}

function createVariant(id, grid) {
    return {
        id,
        model: null,
        status: "idle",
        grid: grid ? copyGrid(grid) : matrix(null),
        note: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        addedStuds: 0,
    };
}

export function createInitialBuild() {
    return {
        version: STATE_VERSION,
        grid: matrix(null),
        locked: matrix(false),
        slots: SLOT_IDS.map(createSlot),
        run: {
            id: null,
            status: "idle",
            startedAt: null,
            finishedAt: null,
            error: null,
        },
        variants: SLOT_IDS.map((id) => createVariant(id)),
    };
}

export function migrateBuild(build) {
    if (!build || typeof build !== "object" || Array.isArray(build)) {
        throw new Error("Build state must be a JSON object.");
    }
    if (build.version === STATE_VERSION) {
        return build;
    }

    const fresh = createInitialBuild();
    return {
        ...fresh,
        grid: Array.isArray(build.grid) ? build.grid : fresh.grid,
        locked: Array.isArray(build.locked) ? build.locked : fresh.locked,
    };
}

export function validateBuild(build) {
    if (!build || typeof build !== "object" || Array.isArray(build)) {
        throw new Error("Build state must be a JSON object.");
    }
    if (build.version !== STATE_VERSION) {
        throw new Error(`Build state must be version ${STATE_VERSION}.`);
    }
    assertMatrix(build.grid, "grid", (cell) => cell === null || colors.has(cell));
    assertMatrix(build.locked, "locked", (cell) => typeof cell === "boolean");

    for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let column = 0; column < GRID_SIZE; column += 1) {
            if (build.locked[row][column] && build.grid[row][column] === null) {
                throw new Error("Locked studs must be painted.");
            }
        }
    }

    if (
        !Array.isArray(build.slots) ||
        build.slots.length !== SLOT_IDS.length ||
        build.slots.some(
            (slot, index) =>
                slot?.id !== SLOT_IDS[index] ||
                typeof slot.model !== "string" ||
                typeof slot.enabled !== "boolean",
        )
    ) {
        throw new Error("Slots must be one entry per board with a model and a toggle.");
    }

    if (
        !Array.isArray(build.variants) ||
        build.variants.length !== SLOT_IDS.length ||
        build.variants.some((variant, index) => variant?.id !== SLOT_IDS[index])
    ) {
        throw new Error("Variants must be one entry per board.");
    }
    for (const variant of build.variants) {
        assertMatrix(variant.grid, `variant ${variant.id} grid`, (cell) =>
            cell === null || colors.has(cell),
        );
        if (!VARIANT_STATUSES.has(variant.status)) {
            throw new Error(`Unknown variant status "${String(variant.status)}".`);
        }
    }

    if (
        !build.run ||
        typeof build.run !== "object" ||
        !RUN_STATUSES.has(build.run.status)
    ) {
        throw new Error("Run state must carry a known status.");
    }
    return build;
}

export async function readBuild(filePath) {
    let raw;
    try {
        raw = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
        if (error?.code !== "ENOENT") {
            throw error;
        }
        const build = createInitialBuild();
        await writeBuild(filePath, build);
        return build;
    }

    const build = validateBuild(migrateBuild(raw));
    if (raw?.version !== STATE_VERSION) {
        await writeBuild(filePath, build);
    }
    return build;
}

export async function writeBuild(filePath, build) {
    validateBuild(build);
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(build, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
    return build;
}

function boardGrid(build, board) {
    if (board === undefined || board === null || board === "human") {
        return build.grid;
    }
    const variant = build.variants.find((candidate) => candidate.id === board);
    if (!variant) {
        throw new InputError(`Unknown board "${String(board)}".`);
    }
    return variant.grid;
}

export function paintStuds(build, studs, options = {}) {
    if (!Array.isArray(studs) || studs.length < 1 || studs.length > 144) {
        throw new InputError("Paint between 1 and 144 studs at a time.");
    }
    const grid = boardGrid(build, options.board);

    const applied = [];
    const skippedLocked = [];
    for (const stud of studs) {
        assertCoordinate(stud?.row, stud?.column);
        if (!colors.has(stud?.color)) {
            throw new InputError(`Unknown color "${String(stud?.color)}".`);
        }

        const row = stud.row - 1;
        const column = stud.column - 1;
        if (build.locked[row][column] && grid[row][column] !== stud.color) {
            skippedLocked.push({ row: stud.row, column: stud.column });
            continue;
        }
        if (grid[row][column] !== stud.color) {
            grid[row][column] = stud.color;
            applied.push(stud);
        }
    }
    return { applied, skippedLocked };
}

export function eraseStud(build, row, column) {
    assertCoordinate(row, column);
    const rowIndex = row - 1;
    const columnIndex = column - 1;
    if (build.locked[rowIndex][columnIndex]) {
        throw new InputError("Protected human tiles cannot be removed.");
    }
    build.grid[rowIndex][columnIndex] = null;
}

export function lockPaintedStuds(build) {
    for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let column = 0; column < GRID_SIZE; column += 1) {
            if (build.grid[row][column] !== null) {
                build.locked[row][column] = true;
            }
        }
    }
}

export function setSlots(build, slots) {
    if (!Array.isArray(slots) || slots.length !== SLOT_IDS.length) {
        throw new InputError(`Send exactly ${SLOT_IDS.length} slots.`);
    }
    const next = SLOT_IDS.map((id, index) => {
        const slot = slots.find((candidate) => candidate?.id === id) ?? slots[index];
        const model = typeof slot?.model === "string" ? slot.model.trim() : "";
        if (model === "") {
            throw new InputError(`Board ${id.toUpperCase()} needs a model id.`);
        }
        return { id, model, enabled: slot?.enabled !== false };
    });
    if (!next.some((slot) => slot.enabled)) {
        throw new InputError("Enable at least one board.");
    }
    build.slots = next;
    return { slots: next };
}

export function startRun(build, runId) {
    build.run = {
        id: runId ?? null,
        status: "running",
        startedAt: Date.now(),
        finishedAt: null,
        error: null,
    };
    build.variants = build.slots.map((slot) => ({
        ...createVariant(slot.id, build.grid),
        model: slot.model,
        status: slot.enabled ? "queued" : "skipped",
    }));
    return { run: build.run };
}

function requireVariant(build, id) {
    const variant = build.variants.find((candidate) => candidate.id === id);
    if (!variant) {
        throw new InputError(`Unknown board "${String(id)}".`);
    }
    return variant;
}

export function markVariant(build, id, status) {
    if (!VARIANT_STATUSES.has(status)) {
        throw new InputError(`Unknown variant status "${String(status)}".`);
    }
    const variant = requireVariant(build, id);
    variant.status = status;
    if (status === "running") {
        variant.startedAt = Date.now();
    }
    return { variant: variant.id, status };
}

export function applyVariant(build, id, studs, note) {
    const variant = requireVariant(build, id);
    const result = paintStuds(build, studs, { board: id });
    variant.status = "done";
    variant.note = typeof note === "string" && note.trim() !== "" ? note.trim() : null;
    variant.finishedAt = Date.now();
    variant.addedStuds = result.applied.length;
    return result;
}

export function failVariant(build, id, error) {
    const variant = requireVariant(build, id);
    variant.status = "failed";
    variant.finishedAt = Date.now();
    variant.error =
        typeof error === "string" && error.trim() !== ""
            ? error.trim()
            : "The model did not return a usable board.";
    return { variant: variant.id };
}

export function finishRun(build, error) {
    build.run = {
        ...build.run,
        status: error ? "error" : "done",
        finishedAt: Date.now(),
        error: error ?? null,
    };
    for (const variant of build.variants) {
        if (variant.status === "queued" || variant.status === "running") {
            variant.status = "failed";
            variant.finishedAt = Date.now();
            variant.error = error ?? "The race ended before this board finished.";
        }
    }
    return { run: build.run };
}

export function resetBuild(build) {
    const slots = Array.isArray(build.slots)
        ? build.slots.map((slot) => ({ ...slot }))
        : null;
    for (const key of Object.keys(build)) {
        delete build[key];
    }
    Object.assign(build, createInitialBuild());
    if (slots) {
        build.slots = slots;
    }
}

export function presentBuild(build) {
    const paintedStuds = build.grid.flat().filter(Boolean).length;
    const handedOff = build.locked.flat().some(Boolean);
    const racing = build.run.status === "running";
    return {
        build,
        palette: COLOR_OPTIONS,
        slots: build.slots,
        run: build.run,
        variants: build.variants.map((variant) => ({
            ...variant,
            elapsedMs: variant.startedAt
                ? (variant.finishedAt ?? Date.now()) - variant.startedAt
                : null,
        })),
        handoff: {
            editable: !handedOff,
            // Once handed off the initial tiles stay locked for fairness, but the
            // human can still change models and run again on that same build.
            ready: paintedStuds > 0 && !racing,
            racing,
            label: handedOff ? "Run again" : "Compare models",
            instruction: racing
                ? "The models are building their ducks in parallel."
                : handedOff
                  ? "Each board below is one model's output. Change the models above and run again on the same tiles, or reset to start another duck."
                  : paintedStuds > 0
                    ? "Every model keeps your painted studs and finishes the duck its own way for side-by-side comparison."
                    : "Paint at least one stud to begin your duck.",
        },
    };
}
