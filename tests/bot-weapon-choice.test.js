/**
 * Elección de arma del bot (#193) sobre la escena real con LiquidFun: equipa enseguida el arma recién recogida y, con el
 * tanque equipado vacío, elige al azar (con la semilla) entre las cargadas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { WEAPONS, FLUID } = await import("../js/weapons.js");

const tankOf = (id) => WEAPONS.find((w) => w.id === id).tank;

test("un bot con agua que recoge ácido lo equipa en menos de 0,5 s", async () => {
    globalThis.location = { search: "?bot=1,2&seed=1" };
    const game = await loadGame();
    const me = game.state.players[0];
    me.tanks.clear();
    me.tanks.set(FLUID.WATER, tankOf(FLUID.WATER));
    me.weapon = FLUID.WATER;
    game.frames(10);
    assert.equal(me.weapon, FLUID.WATER);
    me.tanks.set(FLUID.ACID, tankOf(FLUID.ACID));
    let frames = 0;
    while (me.weapon !== FLUID.ACID && frames < 60) {
        game.frame();
        frames++;
    }
    globalThis.location = { search: "" };
    assert.equal(me.weapon, FLUID.ACID);
    assert.ok(frames / 60 < 0.5, `tardó ${frames / 60} s`);
});

test("con el tanque equipado vacío elige entre las cargadas y en 20 semillas aparecen las dos", async () => {
    const chosen = new Set();
    for (let seed = 1; seed <= 20; seed++) {
        globalThis.location = { search: `?bot=1,2&seed=${seed}` };
        const game = await loadGame();
        const me = game.state.players[0];
        me.tanks.clear();
        me.tanks.set(FLUID.WATER, 0);
        me.tanks.set(FLUID.ACID, tankOf(FLUID.ACID));
        me.tanks.set(FLUID.LAVA, tankOf(FLUID.LAVA));
        me.weapon = FLUID.WATER;
        game.frames(30);
        assert.ok(me.weapon === FLUID.ACID || me.weapon === FLUID.LAVA, `semilla ${seed}: ${me.weapon}`);
        chosen.add(me.weapon);
    }
    globalThis.location = { search: "" };
    assert.deepEqual([...chosen].sort(), [FLUID.ACID, FLUID.LAVA].sort());
});
