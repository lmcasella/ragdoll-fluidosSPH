// Agua como arma inicial (#18): J1 moja a J2 con el chorro y J2 pierde 3 de vida por segundo
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { LEVEL } from "../js/level.js";

const A = 0;

// Los dos robots en el suelo de la isla izquierda, a 7,5 m, para que el chorro llegue sin tocar los datos reales
// del nivel. A menos distancia el salpicado del rival vuelve a J1 pasada la gracia de 0,4 s y también lo moja
async function start() {
    const real = LEVEL.spawns;
    LEVEL.spawns = [{ x: 1, flipX: false }, { x: 8.5, flipX: true }];
    let game;
    try {
        game = await loadGame();
    } finally {
        LEVEL.spawns = real;
    }
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

test("el agua de J1 moja a J2, le baja ~3/s y J1 no se moja", async () => {
    const game = await start();
    const { players, match } = game.state;
    const [p1, p2] = players;
    assert.ok(match.roundTime < 60, "antes de la inundación");
    assert.equal(p1.weapon, 4);
    assert.equal(p1.tanks.get(4), 150);
    assert.equal(p2.hp, 100);
    game.setPad(0, { buttons: [A], axes: [0, 0, 1, 0] });
    game.frames(30);
    assert.ok(p2.wet, "J2 ya está mojado a los 0,5 s");
    const hpMid = p2.hp;
    game.frames(30);
    game.setPad(0);
    const rate = (hpMid - p2.hp) / 0.5;
    console.log(`J2 mojado=${p2.wet}, vida ${hpMid.toFixed(2)} -> ${p2.hp.toFixed(2)} en 0,5 s (${rate.toFixed(2)}/s), J1 mojado=${p1.wet}, tanque J1=${p1.tanks.get(4)}, tanque J2=${p2.tanks.get(4)}, roundTime=${match.roundTime.toFixed(1)}`);
    assert.ok(Math.abs(rate - 3) <= 0.4, `ritmo ${rate}/s`);
    assert.ok(!p1.wet, "J1 no se moja");
    assert.ok(Math.abs(p1.tanks.get(4) - 100) <= 3, `tanque ${p1.tanks.get(4)}`);
    assert.equal(p2.tanks.get(4), 150, "J2 no disparó");
});

test("tras reiniciar la ronda y en la revancha los dos arrancan con agua y 150", async () => {
    const game = await start();
    const { players, match } = game.state;
    const finishRound = () => {
        game.state.players[1].hp = 0;
        game.frames(1);
        game.frames(190);
    };
    game.setPad(0, { buttons: [A], axes: [0, 0, 1, 0] });
    game.frames(20);
    game.setPad(0);
    assert.ok(players[0].tanks.get(4) < 150);
    finishRound();
    assert.equal(match.round, 2);
    for (const p of game.state.players) assert.deepEqual([p.weapon, p.tanks.get(4)], [4, 150]);
    finishRound();
    assert.equal(match.state, "matchOver");
    game.setPad(0, { buttons: [A] });
    game.frames(1);
    assert.equal(match.state, "playing");
    for (const p of game.state.players) assert.deepEqual([p.weapon, p.tanks.get(4)], [4, 150]);
});
