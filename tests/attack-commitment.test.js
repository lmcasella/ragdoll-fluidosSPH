import { test } from "node:test";
import assert from "node:assert/strict";
import { BUTTON, AIM_RIGHT, startDuel, run } from "./helpers/duel.js";

const COMBO_FRAMES = [0, 15, 39];

test("#230: ningún golpe del combo aplica velocidad al atacante", async () => {
    const game = await startDuel(0.8);
    const [p1] = game.state.players;
    let calls = 0;
    const original = p1.setVelocity.bind(p1);
    p1.setVelocity = (...args) => {
        if (p1.attack !== null) calls++;
        return original(...args);
    };
    run(game, 140, (f) => game.setPad(0, { buttons: COMBO_FRAMES.includes(f) ? [BUTTON.B] : [], axes: AIM_RIGHT }));
    assert.equal(calls, 0);
});

test("#225: en medio de un golpe el stick al lado contrario no gira al robot, y gira al terminar", async () => {
    const game = await startDuel(3);
    const [p1] = game.state.players;
    const facingAtStart = p1.facing;
    const during = [];
    let turnedAfter = null;
    run(
        game,
        60,
        (f) => game.setPad(0, { buttons: f === 0 ? [BUTTON.B] : [], axes: [-1, 0, 1, 0] }),
        () => {
            if (p1.attack !== null) during.push(p1.facing);
            else if (turnedAfter === null && during.length > 0) turnedAfter = p1.facing;
        },
    );
    assert.ok(during.length > 0);
    assert.ok(during.every((facing) => facing === facingAtStart));
    assert.equal(turnedAfter, -facingAtStart);
});
