import { test } from "node:test";
import assert from "node:assert/strict";
import { startDuel, run } from "./helpers/duel.js";

test("#240: caminar con el stick izquierdo al lado contrario no mueve la mira ni da vuelta al robot", async () => {
    const game = await startDuel(3);
    const flipAtStart = game.state.players[0].flipX;
    const aims = [];
    run(
        game,
        90,
        () => game.setPad(0, { buttons: [], axes: [flipAtStart ? 1 : -1, 0, 0, 0] }),
        () => aims.push({ x: game.state.players[0].aimDir.x, flip: game.state.players[0].flipX }),
    );
    assert.ok(aims.every((a) => a.flip === flipAtStart));
    assert.ok(aims.every((a) => Math.sign(a.x) === (flipAtStart ? -1 : 1)));
});
