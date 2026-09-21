export function minimalRaceResults(boards) {
    return {
        boards: boards
            .filter((board) => board !== null)
            .map(({ studsUsed, timeTakenMs }) => ({
                studsUsed,
                timeTakenMs,
            })),
    };
}
