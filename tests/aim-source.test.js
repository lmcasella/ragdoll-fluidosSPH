import { test } from "node:test";
import assert from "node:assert/strict";
import { AIM_RIGHT, AIM_LEFT, startDuel, run } from "./helpers/duel.js";

test("#279: sin stick derecho ni mouse, caminar a la izquierda gira al robot a la izquierda y a la derecha, a la derecha", async () => {
    const game = await startDuel(3);
    assert.equal(game.state.players[0].flipX, false);
    game.setPad(0, { buttons: [], axes: [-1, 0, 0, 0] });
    game.frames(30);
    assert.equal(game.state.players[0].flipX, true);
    assert.ok(game.state.players[0].aimDir.x < 0);
    game.setPad(0, { buttons: [], axes: [1, 0, 0, 0] });
    game.frames(30);
    assert.equal(game.state.players[0].flipX, false);
    assert.ok(game.state.players[0].aimDir.x > 0);
});

test("#240: con el stick derecho apuntando a un lado, caminar al otro no gira al robot ni mueve la mira", async () => {
    for (const [aim, walk] of [[AIM_RIGHT, -1], [AIM_LEFT, 1]]) {
        const game = await startDuel(3);
        const flipAtStart = game.state.players[0].flipX;
        run(game, 5, () => game.setPad(0, { buttons: [], axes: aim }));
        const expected = aim[2] < 0;
        const seen = [];
        run(
            game,
            60,
            () => game.setPad(0, { buttons: [], axes: [walk, 0, aim[2], 0] }),
            () => seen.push({ x: game.state.players[0].aimDir.x, flip: game.state.players[0].flipX }),
        );
        assert.notEqual(flipAtStart === undefined, true);
        assert.ok(seen.every((s) => s.flip === expected));
        assert.ok(seen.every((s) => Math.sign(s.x) === Math.sign(aim[2])));
    }
});
