/**
 * Remapeo del gamepad de punta a punta: el script de index.html con LiquidFun real y gamepad simulado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { WEAPONS } from "../js/weapons.js";
import { loadGame } from "./helpers/game.js";

async function start() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(60);
    return game;
}

const peakRise = (game, pad, frames = 40) => {
    const player = game.state.players[0];
    const y0 = player.torso.GetPosition().get_y();
    let peak = 0;
    game.setPad(0, pad);
    for (let i = 0; i < frames; i++) {
        game.frame();
        game.setPad(0);
        peak = Math.max(peak, player.torso.GetPosition().get_y() - y0);
    }
    return peak;
};

test("A salta y el stick arriba no salta", async () => {
    const jump = await peakRise(await start(), { buttons: [0] });
    const stick = await peakRise(await start(), { axes: [0, -1, 0, 0] });
    console.log(`subida con A ${jump.toFixed(2)} m, con stick arriba ${stick.toFixed(2)} m`);
    assert.ok(jump > 0.5, `A: ${jump}`);
    assert.ok(stick < 0.1, `stick: ${stick}`);
});

test("abajo fuerte + A (drop) cuenta como salto mientras no hay plataformas atravesables", async () => {
    const rise = await peakRise(await start(), { buttons: [0], axes: [0, 0.8, 0, 0] });
    assert.ok(rise > 0.5, `${rise}`);
});

test("RT baja el tanque y A no", async () => {
    const game = await start();
    const player = game.state.players[0];
    const full = player.tanks.get(player.weapon);
    game.setPad(0, { buttons: [0] });
    game.frames(30);
    assert.equal(player.tanks.get(player.weapon), full);
    game.setPad(0, { buttons: [7] });
    game.frames(30);
    assert.ok(player.tanks.get(player.weapon) < full);
});

test("LB corto y RB cambian de arma y la cruceta elige por posición", async () => {
    const game = await start();
    const player = game.state.players[0];
    const tap = (...buttons) => {
        game.setPad(0, { buttons });
        game.frames(3);
        game.setPad(0);
        game.frames(3);
    };
    const start0 = player.weapon;
    tap(5);
    assert.notEqual(player.weapon, start0, "RB");
    tap(4);
    assert.equal(player.weapon, start0, "LB corto");
    for (const [button, position] of [[12, 1], [15, 2], [13, 3], [14, 4]]) {
        tap(button);
        assert.equal(player.weapon, WEAPONS[position - 1].id, `cruceta ${position}`);
    }
});