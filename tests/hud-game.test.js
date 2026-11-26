import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { LEVEL } from "../src/level/level.js";

/** Botón B del mapeo "standard": golpe. */
const B = 1;

async function start(gap) {
    const real = LEVEL.spawns;
    LEVEL.spawns = [{ x: 1, flipX: false }, { x: 1 + gap, flipX: true }];
    let game;
    try {
        game = await loadGame();
    } finally {
        LEVEL.spawns = real;
    }
    game.setPad(0);
    game.setPad(1);
    game.frames(60);
    return game;
}

test("J2 golpea a J1: el HUD muestra el número flotante, la barrita y la barra del panel baja", async () => {
    const game = await start(1.2);
    const [p1, p2] = game.state.players;
    const hud = game.state.hud;
    assert.equal(hud.panels[0].fill.style.width, "100.0%");
    assert.ok(hud.floaters.every((f) => f.el.hidden));
    game.setPad(1, { buttons: [B], axes: [0, 0, -1, 0] });
    game.frames(1);
    game.setPad(1, { axes: [0, 0, -1, 0] });
    let floater = null;
    for (let i = 0; i < 40 && !floater; i++) {
        game.frames(1);
        floater = hud.floaters.find((f) => !f.el.hidden);
    }
    assert.ok(p1.hp < 100, `J1 perdió vida (${p1.hp})`);
    assert.ok(floater, "aparece el número flotante");
    assert.match(floater.n.textContent, /^−\d+$/);
    assert.equal(floater.victim, 0);
    assert.equal(hud.panels[0].fill.style.width, `${p1.hp.toFixed(1)}%`);
    assert.ok(Number.parseFloat(hud.panels[0].fill.style.width) < 100);
    assert.equal(hud.panels[0].num.textContent, String(Math.ceil(p1.hp)));
    assert.equal(hud.headbars[0].el.hidden, false, "barrita sobre la cabeza");
    assert.ok(Number.parseInt(floater.el.style.left, 10) > 0 && Number.isFinite(Number.parseInt(floater.el.style.top, 10)));
    assert.equal(hud.panels[1].fill.style.width, "100.0%");
    assert.ok(p2.hp === 100);
});
