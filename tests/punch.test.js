import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { LEVEL } from "../js/level.js";

/** Botón X del mapeo "standard": golpe. */
const X = 2;

/**
 * Carga el juego con los dos robots enfrentados a corta distancia en la isla izquierda, sin tocar los datos reales.
 * @param {number} gap Distancia horizontal entre los dos robots, m.
 */
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

test("el golpe reproduce su clip, pega al rival cercano y lo aturde (reloj de simulación)", async () => {
    const game = await start(1.2);
    const [p1, p2] = game.state.players;
    const hp0 = p2.hp;
    game.setPad(0, { buttons: [X], axes: [0, 0, 1, 0] });
    game.frames(1);
    game.setPad(0, { axes: [0, 0, 1, 0] });
    let clipSeen = false;
    let stunned = false;
    for (let i = 0; i < 40; i++) {
        game.frames(1);
        if (p1.clipState === "punch") clipSeen = true;
        if (p2.isStunned()) stunned = true;
    }
    assert.ok(clipSeen, "el clip punch se reproduce");
    assert.ok(p2.hp < hp0, `el rival pierde vida (${hp0} -> ${p2.hp})`);
    assert.ok(stunned, "el rival queda aturdido");
    assert.ok(!p1.isPunching(), "el golpe termina");
});

test("después del golpe los dos brazos vuelven a apuntar (ninguno queda trabado por el clip)", async () => {
    for (const axes of [[0, 0, 1, 0], [0, 0, 1, -0.6], [0, 0, -1, 0.3]]) {
        const game = await start(7);
        const shoulders = () => {
            const p = game.state.players[0];
            return p.rig.aimJoints.map((name) => p.rag.joint(name).GetJointAngle());
        };
        game.setPad(0, { axes });
        game.frames(60);
        const before = shoulders();
        game.setPad(0, { buttons: [X], axes });
        game.frames(1);
        game.setPad(0, { axes });
        game.frames(150);
        const after = shoulders();
        after.forEach((angle, i) => {
            assert.ok(Math.abs(angle - before[i]) < 0.15, `mira ${axes.slice(2)}: hombro ${i} ${before[i].toFixed(2)} -> ${angle.toFixed(2)}`);
        });
    }
});
