import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { WALK_ANIM, STICKY } = await import("../js/ActiveRagdoll.js");

const DT = 1 / 60;

/**
 * Camina `frames` pasos hacia la derecha con el stick izquierdo (J1), opcionalmente pegado en miel, y devuelve las
 * muestras de |vx| del torso y de la velocidad del clip, más la distancia y la fase del clip (suma de velocidad × dt).
 */
async function walk({ sticky = false, frames = 120 } = {}) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(40);
    const player = game.state.players[0];
    const startX = player.torso.GetPosition().get_x();
    game.setPad(0, { axes: [1, 0, 0, 0] });
    const samples = [];
    let phase = 0;
    for (let f = 0; f < frames; f++) {
        if (sticky) player.stickyTimer = STICKY.grace;
        game.frame();
        samples.push({ vx: Math.abs(player.torso.GetLinearVelocity().get_x()), anim: player.animSpeed, clip: player.clipState });
        phase += player.animSpeed * DT;
    }
    return { samples, phase, distance: player.torso.GetPosition().get_x() - startX };
}

test("caminando normal la velocidad del clip llega a ~1 y sigue a |vx| / refSpeed", async () => {
    const { samples } = await walk();
    const tail = samples.slice(-60);
    console.log(`normal: velocidad del clip ${tail[tail.length - 1].anim.toFixed(3)}, |vx| ${tail[tail.length - 1].vx.toFixed(2)} m/s`);
    for (const s of tail) {
        assert.equal(s.clip, "walk");
        assert.ok(Math.abs(s.anim - 1) < 0.15, `velocidad del clip ${s.anim.toFixed(3)}`);
        assert.ok(s.anim >= WALK_ANIM.minSpeed && s.anim <= WALK_ANIM.maxSpeed);
    }
});

test("pegado en miel el clip va lento: proporcional a |vx| y nunca bajo el mínimo", async () => {
    const { samples } = await walk({ sticky: true });
    const tail = samples.slice(-60);
    for (const s of tail) {
        const expected = Math.max(WALK_ANIM.minSpeed, s.vx / WALK_ANIM.refSpeed);
        assert.ok(s.anim < 0.5, `velocidad del clip ${s.anim.toFixed(3)}`);
        assert.ok(s.anim >= WALK_ANIM.minSpeed);
        assert.ok(Math.abs(s.anim - expected) < 0.1, `clip ${s.anim.toFixed(3)} vs esperado ${expected.toFixed(3)}`);
    }
    const last = tail[tail.length - 1];
    console.log(`miel: velocidad del clip ${last.anim.toFixed(3)}, |vx| ${last.vx.toFixed(2)} m/s`);
});

test("la distancia por unidad de fase del clip es coherente entre normal y pegado", async () => {
    const normal = await walk();
    const sticky = await walk({ sticky: true });
    const perPhaseNormal = normal.distance / normal.phase;
    const perPhaseSticky = sticky.distance / sticky.phase;
    console.log(`m por ciclo de clip: normal ${perPhaseNormal.toFixed(2)}, miel ${perPhaseSticky.toFixed(2)}`);
    assert.ok(perPhaseSticky / perPhaseNormal < 1.5 && perPhaseSticky / perPhaseNormal > 0.2);
});

test("la velocidad del clip no tiembla: cambia poco entre pasos", async () => {
    const { samples } = await walk();
    let maxStep = 0;
    for (let i = 20; i < samples.length; i++) maxStep = Math.max(maxStep, Math.abs(samples[i].anim - samples[i - 1].anim));
    console.log(`salto máximo entre pasos: ${maxStep.toFixed(4)}`);
    assert.ok(maxStep < 0.05);
});
