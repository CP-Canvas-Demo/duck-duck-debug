import { COLOR_OPTIONS, GRID_SIZE } from "./state.mjs";

export const COLOR_IDS = COLOR_OPTIONS.map((color) => color.id);
export const MAX_STUDS = 144;
export const EMPTY_CODE = ".";

// One character per stud keeps a full board near 150 output tokens instead of
// the ~2000 a list of {row, column, color} objects costs. The models answer far
// faster, and a picture-shaped answer is easier for them to get right.
export const CODE_BY_COLOR = {
    yellow: "Y",
    orange: "O",
    blue: "B",
    red: "R",
    green: "G",
    white: "W",
    black: "K",
    pink: "P",
};
export const COLOR_BY_CODE = Object.fromEntries(
    Object.entries(CODE_BY_COLOR).map(([color, code]) => [code, color]),
);

export const duckSchema = {
    type: "object",
    required: ["rows"],
    properties: {
        rows: { type: "array", items: { type: "string" } },
        note: { type: "string" },
    },
};

export function encodeGrid(grid) {
    return grid.map((row) =>
        row.map((cell) => (cell ? CODE_BY_COLOR[cell] : EMPTY_CODE)).join(""),
    );
}

export function buildPrompt(grid) {
    const legend = Object.entries(CODE_BY_COLOR)
        .map(([color, code]) => `${code}=${color}`)
        .join(" ");
    return `Finish this ${GRID_SIZE}x${GRID_SIZE} brick mosaic of a rubber duck.

The human started it. One character per stud, "${EMPTY_CODE}" is empty:

${encodeGrid(grid).join("\n")}

Legend: ${legend} ${EMPTY_CODE}=empty

Reply with "rows": ${GRID_SIZE} strings of exactly ${GRID_SIZE} characters, the finished board.
Keep every character the human already placed exactly where and as it is.
Fill the rest so the board reads as a duck at a glance: rounded body, head,
one eye, a beak. Work quickly; a clear duck beats a clever one.
Add a short "note" naming your design choice.
Answer with a single JSON object and nothing else. No prose, no code fence,
no explanation before or after.`;
}

export function decodeRows(result) {
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const studs = [];
    for (let row = 0; row < Math.min(rows.length, GRID_SIZE); row += 1) {
        const line = typeof rows[row] === "string" ? rows[row] : "";
        for (let column = 0; column < Math.min(line.length, GRID_SIZE); column += 1) {
            const color = COLOR_BY_CODE[line[column].toUpperCase()];
            if (color) {
                studs.push({ row: row + 1, column: column + 1, color });
            }
        }
    }
    return {
        studs: studs.slice(0, MAX_STUDS),
        note: typeof result?.note === "string" ? result.note : null,
    };
}

// Only an unresolvable agent name is worth a second attempt. Anything else
// (rate limits, cancellation, model errors) must surface as a failed board, so
// the race never quietly pays for two agents to fill one square.
export function isUnknownAgent(error, agentName) {
    const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (!agentName || !text.includes(agentName.toLowerCase())) return false;
    return ["unknown", "not found", "no such", "unrecognized", "invalid"].some((hint) =>
        text.includes(hint),
    );
}
