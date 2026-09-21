import assert from "node:assert/strict";
import test from "node:test";
import {
    applyVariant,
    createInitialBuild,
    eraseStud,
    failVariant,
    finishRun,
    GRID_SIZE,
    InputError,
    lockPaintedStuds,
    markVariant,
    migrateBuild,
    paintStuds,
    presentBuild,
    resetBuild,
    setSlots,
    startRun,
    validateBuild,
} from "./state.mjs";
import { buildPrompt, decodeRows, encodeGrid, isUnknownAgent } from "./duck.mjs";

function race(build) {
    lockPaintedStuds(build);
    startRun(build, "run-1");
}

test("the human must paint before racing", () => {
    const build = createInitialBuild();
    assert.equal(presentBuild(build).handoff.ready, false);

    paintStuds(build, [{ row: 4, column: 5, color: "yellow" }]);
    assert.equal(presentBuild(build).handoff.ready, true);
});

test("every variant board starts from the human board", () => {
    const build = createInitialBuild();
    paintStuds(build, [{ row: 4, column: 5, color: "yellow" }]);
    race(build);

    for (const variant of build.variants) {
        assert.equal(variant.grid[3][4], "yellow");
        assert.equal(variant.status, "queued");
    }
});

test("a race preserves every human stud on every board", () => {
    const build = createInitialBuild();
    paintStuds(build, [{ row: 4, column: 5, color: "yellow" }]);
    race(build);

    const result = applyVariant(build, "a", [
        { row: 4, column: 5, color: "blue" },
        { row: 6, column: 6, color: "red" },
    ]);
    assert.deepEqual(result.skippedLocked, [{ row: 4, column: 5 }]);
    assert.equal(build.variants[0].grid[3][4], "yellow");
    assert.equal(build.variants[0].grid[5][5], "red");
});

test("boards do not leak into each other", () => {
    const build = createInitialBuild();
    paintStuds(build, [{ row: 1, column: 1, color: "yellow" }]);
    race(build);

    applyVariant(build, "a", [{ row: 8, column: 8, color: "blue" }], "blue duck");
    assert.equal(build.variants[0].grid[7][7], "blue");
    assert.equal(build.variants[1].grid[7][7], null);
    assert.equal(build.grid[7][7], null);
    assert.equal(build.variants[0].note, "blue duck");
    assert.equal(build.variants[0].addedStuds, 1);
});

test("a disabled slot is skipped rather than raced", () => {
    const build = createInitialBuild();
    setSlots(build, [
        { id: "a", model: "model-a", enabled: true },
        { id: "b", model: "model-b", enabled: false },
        { id: "c", model: "model-c", enabled: true },
    ]);
    paintStuds(build, [{ row: 1, column: 1, color: "yellow" }]);
    race(build);

    assert.deepEqual(
        build.variants.map((variant) => variant.status),
        ["queued", "skipped", "queued"],
    );
    assert.equal(build.variants[0].model, "model-a");
});

test("slots reject an empty model and an all-off race", () => {
    const build = createInitialBuild();
    assert.throws(
        () =>
            setSlots(build, [
                { id: "a", model: "  ", enabled: true },
                { id: "b", model: "model-b", enabled: true },
                { id: "c", model: "model-c", enabled: true },
            ]),
        InputError,
    );
    assert.throws(
        () =>
            setSlots(build, [
                { id: "a", model: "model-a", enabled: false },
                { id: "b", model: "model-b", enabled: false },
                { id: "c", model: "model-c", enabled: false },
            ]),
        InputError,
    );
});

test("one failed board does not end the others", () => {
    const build = createInitialBuild();
    paintStuds(build, [{ row: 1, column: 1, color: "yellow" }]);
    race(build);

    markVariant(build, "a", "running");
    failVariant(build, "a", "model unavailable");
    applyVariant(build, "b", [{ row: 9, column: 9, color: "green" }]);

    assert.equal(build.variants[0].status, "failed");
    assert.equal(build.variants[0].error, "model unavailable");
    assert.equal(build.variants[1].status, "done");
});

test("finishing a run settles boards that never returned", () => {
    const build = createInitialBuild();
    paintStuds(build, [{ row: 1, column: 1, color: "yellow" }]);
    race(build);
    markVariant(build, "a", "running");

    finishRun(build, "the run was cancelled");
    assert.equal(build.run.status, "error");
    assert.equal(build.variants[0].status, "failed");
    assert.equal(build.variants[0].error, "the run was cancelled");
});

test("racing blocks a second race until reset", () => {
    const build = createInitialBuild();
    paintStuds(build, [{ row: 1, column: 1, color: "yellow" }]);
    race(build);

    const racing = presentBuild(build);
    assert.equal(racing.handoff.racing, true);
    assert.equal(racing.handoff.ready, false);
    assert.equal(racing.handoff.editable, false);
});

test("a finished race can be re-run on the same build without a reset", () => {
    const build = createInitialBuild();
    paintStuds(build, [{ row: 1, column: 1, color: "yellow" }]);
    race(build);
    applyVariant(build, "a", [{ row: 2, column: 2, color: "blue" }]);
    applyVariant(build, "b", [{ row: 3, column: 3, color: "red" }]);
    applyVariant(build, "c", [{ row: 4, column: 4, color: "green" }]);
    finishRun(build, null);

    const finished = presentBuild(build);
    assert.equal(finished.handoff.racing, false);
    assert.equal(finished.handoff.ready, true);
    // The board stays locked so the initial human tiles aren't repainted.
    assert.equal(finished.handoff.editable, false);

    setSlots(build, [
        { id: "a", model: "model-a-2", enabled: true },
        { id: "b", model: "model-b", enabled: true },
        { id: "c", model: "model-c", enabled: true },
    ]);
    race(build);
    assert.equal(build.grid[0][0], "yellow");
    assert.equal(build.variants[0].model, "model-a-2");
    assert.equal(build.variants[0].status, "queued");
});

test("reset clears the boards but keeps the chosen models", () => {
    const build = createInitialBuild();
    setSlots(build, [
        { id: "a", model: "model-a", enabled: true },
        { id: "b", model: "model-b", enabled: false },
        { id: "c", model: "model-c", enabled: true },
    ]);
    paintStuds(build, [{ row: 4, column: 5, color: "yellow" }]);
    race(build);
    applyVariant(build, "a", [{ row: 9, column: 9, color: "green" }]);

    resetBuild(build);
    assert.equal(build.grid[3][4], null);
    assert.equal(build.locked[3][4], false);
    assert.equal(build.variants[0].grid[8][8], null);
    assert.equal(build.run.status, "idle");
    assert.equal(build.slots[1].model, "model-b");
    assert.equal(build.slots[1].enabled, false);
});

test("the human can remove a tile before racing", () => {
    const build = createInitialBuild();
    paintStuds(build, [{ row: 4, column: 5, color: "yellow" }]);

    eraseStud(build, 4, 5);
    assert.equal(build.grid[3][4], null);
});

test("a version 1 board migrates forward without losing tiles", () => {
    const legacy = createInitialBuild();
    paintStuds(legacy, [{ row: 2, column: 3, color: "orange" }]);
    lockPaintedStuds(legacy);
    const onDisk = { grid: legacy.grid, locked: legacy.locked };

    const migrated = validateBuild(migrateBuild(onDisk));
    assert.equal(migrated.version, 2);
    assert.equal(migrated.grid[1][2], "orange");
    assert.equal(migrated.locked[1][2], true);
    assert.equal(migrated.variants.length, 3);
    assert.equal(migrated.run.status, "idle");
});

test("a compact row answer decodes into studs", () => {
    const { studs, note } = decodeRows({
        note: "a duck",
        rows: ["Y.O", "..K"],
    });
    assert.deepEqual(studs, [
        { row: 1, column: 1, color: "yellow" },
        { row: 1, column: 3, color: "orange" },
        { row: 2, column: 3, color: "black" },
    ]);
    assert.equal(note, "a duck");
});

test("decoding ignores unknown characters and overlong answers", () => {
    const longRow = "Y".repeat(GRID_SIZE + 4);
    const { studs } = decodeRows({
        rows: [...Array(GRID_SIZE + 3).fill(longRow)],
    });
    assert.equal(studs.length, GRID_SIZE * GRID_SIZE);
    assert.deepEqual(decodeRows({ rows: ["z?#"] }).studs, []);
    assert.deepEqual(decodeRows({ rows: "not an array" }).studs, []);
    assert.deepEqual(decodeRows(null).studs, []);
});

test("lowercase codes still decode", () => {
    assert.deepEqual(decodeRows({ rows: ["y"] }).studs, [
        { row: 1, column: 1, color: "yellow" },
    ]);
});

test("a board round-trips through the compact encoding", () => {
    const build = createInitialBuild();
    paintStuds(build, [
        { row: 1, column: 1, color: "yellow" },
        { row: 12, column: 12, color: "black" },
    ]);

    const rows = encodeGrid(build.grid);
    assert.equal(rows.length, GRID_SIZE);
    assert.ok(rows.every((row) => row.length === GRID_SIZE));
    assert.deepEqual(decodeRows({ rows }).studs, [
        { row: 1, column: 1, color: "yellow" },
        { row: 12, column: 12, color: "black" },
    ]);
});

test("the prompt shows the human board compactly", () => {
    const build = createInitialBuild();
    paintStuds(build, [{ row: 1, column: 1, color: "yellow" }]);

    const prompt = buildPrompt(build.grid);
    assert.match(prompt, /^Y\.{11}$/m);
    assert.match(prompt, /Y=yellow/);
    assert.match(prompt, /single JSON object/);
});

test("an unresolvable artist agent is worth one retry", () => {
    assert.equal(
        isUnknownAgent(new Error('Unknown agent "duck-artist"'), "duck-artist"),
        true,
    );
    assert.equal(
        isUnknownAgent("agent duck-artist was not found", "duck-artist"),
        true,
    );
});

test("ordinary failures never trigger a second paid agent", () => {
    // A retry here would silently double the cost and latency of a board.
    assert.equal(isUnknownAgent(new Error("rate limit exceeded"), "duck-artist"), false);
    assert.equal(isUnknownAgent(new Error("The run was cancelled"), "duck-artist"), false);
    assert.equal(
        isUnknownAgent(new Error("duck-artist hit a network timeout"), "duck-artist"),
        false,
    );
    assert.equal(isUnknownAgent(new Error("unknown model"), "duck-artist"), false);
});

test("a run carries its id so stale writers can be fenced out", () => {
    const build = createInitialBuild();
    setSlots(build, [
        { id: "a", model: "model-one", enabled: true },
        { id: "b", model: "model-two", enabled: true },
        { id: "c", model: "model-three", enabled: true },
    ]);
    startRun(build, "run-1");
    assert.equal(build.run.id, "run-1");
    // Each variant is stamped with the model that this run actually used, so a
    // later run cannot leave a board labelled with the previous model.
    assert.deepEqual(
        build.variants.map((variant) => variant.model),
        ["model-one", "model-two", "model-three"],
    );

    setSlots(build, [
        { id: "a", model: "model-four", enabled: true },
        { id: "b", model: "model-five", enabled: true },
        { id: "c", model: "model-six", enabled: true },
    ]);
    startRun(build, "run-2");
    assert.equal(build.run.id, "run-2");
    assert.deepEqual(
        build.variants.map((variant) => variant.model),
        ["model-four", "model-five", "model-six"],
    );
});
