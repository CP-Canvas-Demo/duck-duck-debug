import assert from "node:assert/strict";
import test from "node:test";
import { minimalRaceResults } from "./result.mjs";

test("race results contain only studs used and time taken", () => {
    const result = minimalRaceResults([
        {
            id: "a",
            model: "test-model",
            note: "A design note",
            studsUsed: 3,
            timeTakenMs: 1250,
        },
        null,
    ]);

    assert.deepEqual(result, {
        boards: [{ studsUsed: 3, timeTakenMs: 1250 }],
    });
    assert.deepEqual(Object.keys(result.boards[0]).sort(), [
        "studsUsed",
        "timeTakenMs",
    ]);
});
