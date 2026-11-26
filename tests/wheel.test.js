/**
 * Rueda de armas de punta a punta: el script de index.js con LiquidFun real y gamepad simulado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLUID } from "../src/combat/weapons.js";
import { TAP_MAX } from "../src/input/Input.js";
import { loadGame } from "./helpers/game.js";

async function start() {
    const game = await loadGame();
    const player = game.state.players[0];
    player.tanks.set(FLUID.ACID, 100);
    player.tanks.set(FLUID.HONEY, 100);
    game.setPad(0);
    game.setPad(1);
    game.frames(60);
    return { game, player };
}

const holdFrames = Math.ceil((TAP_MAX + 0.1) * 60);

test("LB mantenido, stick a un sector y soltar equipa el arma del sector", async () => {
    const { game, player } = await start();
    assert.equal(player.weapon, FLUID.WATER);
    game.setPad(0, { buttons: [4] });
    game.frames(holdFrames);
    game.setPad(0, { buttons: [4], axes: [0, 0, 1, 0] });
    game.frames(3);
    assert.equal(player.weapon, FLUID.WATER, "mientras está abierta no cambia");
    game.setPad(0, { axes: [0, 0, 1, 0] });
    game.frames(1);
    assert.equal(player.weapon, FLUID.ACID, "derecha: medio del segundo sector de tres");

    game.setPad(0, { buttons: [4] });
    game.frames(holdFrames);
    game.setPad(0, { buttons: [4], axes: [-1, 0, 0, 0] });
    game.frames(3);
    game.setPad(0, { axes: [-1, 0, 0, 0] });
    game.frames(1);
    assert.equal(game.state.players[0].weapon, FLUID.ACID, "el stick izquierdo (movimiento) no elige sector");
    game.setPad(0);
    game.frames(2);
    const turned = () => game.state.players[0];

    game.setPad(0, { buttons: [4] });
    game.frames(holdFrames);
    game.setPad(0, { buttons: [4], axes: [0, 0, -1, 0] });
    game.frames(3);
    game.setPad(0, { axes: [0, 0, -1, 0] });
    game.frames(1);
    assert.equal(turned().weapon, FLUID.HONEY, "izquierda: tercer sector de tres");
});

test("soltar con el stick al centro no cambia el arma y el toque corto de LB es arma anterior", async () => {
    const { game, player } = await start();
    game.setPad(0, { buttons: [5] });
    game.frames(3);
    game.setPad(0);
    game.frames(3);
    assert.equal(player.weapon, FLUID.ACID, "RB");

    game.setPad(0, { buttons: [4] });
    game.frames(holdFrames);
    game.setPad(0, { buttons: [4], axes: [0, 0, 0.2, 0] });
    game.frames(3);
    game.setPad(0);
    game.frames(3);
    assert.equal(player.weapon, FLUID.ACID, "sin apuntar nunca, no cambia");

    game.setPad(0, { buttons: [4] });
    game.frames(holdFrames);
    game.setPad(0, { buttons: [4], axes: [0, 0, -1, 0] });
    game.frames(3);
    game.setPad(0, { buttons: [4] });
    game.frames(3);
    game.setPad(0);
    game.frames(3);
    assert.equal(player.weapon, FLUID.HONEY, "el stick vuelve al centro antes de soltar LB: elige el último sector apuntado");

    game.setPad(0, { buttons: [4] });
    game.frames(3);
    game.setPad(0);
    game.frames(3);

    game.setPad(0, { buttons: [4] });
    game.frames(3);
    game.setPad(0);
    game.frames(3);
    assert.equal(player.weapon, FLUID.WATER, "toque corto: arma anterior");
});

test("con la rueda abierta la mira conserva la dirección y el juego sigue corriendo", async () => {
    const { game, player } = await start();
    game.setPad(0, { axes: [0, 0, 1, 0] });
    game.frames(5);
    const before = { ...player.aimDir };
    game.setPad(0, { buttons: [4] });
    game.frames(holdFrames);
    const time = game.state.match.roundTime;
    game.setPad(0, { buttons: [4], axes: [0, 0, 0, -1] });
    game.frames(10);
    assert.deepEqual(game.state.players[0].aimDir, before);
    assert.ok(game.state.match.roundTime > time, "la ronda sigue corriendo");
    game.setPad(0, { axes: [0, 0, 0, -1] });
    game.frames(1);
    assert.deepEqual(game.state.players[0].aimDir, before, "tampoco al soltar");
});
