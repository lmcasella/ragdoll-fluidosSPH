import { test } from "node:test";
import assert from "node:assert/strict";
import { BUTTON, AIM_RIGHT, AIM_LEFT, startDuel } from "./helpers/duel.js";

const { ROLL } = await import("../src/ragdoll/ActiveRagdoll.js");

const DT = 1 / 60;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Rueda con LT + A y el stick izquierdo en `lx` (la mira a la derecha). Mide hasta 0,3 s después de terminar el roll:
 * estados vistos, desplazamiento del torso, giro acumulado y ángulo envuelto.
 */
async function rollWith(lx) {
    const game = await startDuel(7);
    const player = game.state.players[0];
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(30);
    const x0 = player.torso.GetPosition().get_x();
    let last = player.torso.GetAngle();
    let turned = 0;
    let end = -1;
    const states = new Set();
    let result = null;
    for (let f = 0; f < 120 && result === null; f++) {
        game.setPad(0, { buttons: f === 0 ? [BUTTON.LT, BUTTON.A] : [BUTTON.LT], axes: [lx, 0, 1, 0] });
        game.frame();
        const angle = player.torso.GetAngle();
        turned += wrap(angle - last);
        last = angle;
        states.add(player.clipState);
        const rolling = player.clipState === "roll" || player.clipState === "rollBack";
        if (end < 0 && f > 2 && !rolling) end = f;
        if (end >= 0 && f === end + 18) {
            result = {
                states: [...states],
                dx: player.torso.GetPosition().get_x() - x0,
                turned,
                wrapped: wrap(angle),
                rollFrames: end,
            };
        }
    }
    return result;
}

test("R12: LT + A rueda hacia adelante, hacia atrás y al centro con el desplazamiento y el giro del diseño", async (t) => {
    const forward = await rollWith(1);
    const back = await rollWith(-1);
    const center = await rollWith(0);
    for (const [name, r] of [["adelante", forward], ["atrás", back], ["centro", center]]) {
        t.diagnostic(`R12 ${name}: estados ${r.states}, el roll dura ${r.rollFrames} pasos, desplazamiento ${r.dx.toFixed(2)} m, giro ${r.turned.toFixed(2)} rad, ángulo envuelto ${r.wrapped.toFixed(3)} rad`);
    }
    assert.ok(forward.states.includes("roll") && !forward.states.includes("rollBack"));
    assert.ok(back.states.includes("rollBack") && !back.states.includes("roll"));
    assert.ok(center.states.includes("roll") && !center.states.includes("rollBack"));
    assert.ok(Math.abs(forward.rollFrames * DT - ROLL.duration) <= 2 * DT, "el roll dura ROLL.duration");
    const spin = 0.9 * 2 * Math.PI;
    for (const [r, sign] of [[forward, 1], [center, 1], [back, -1]]) {
        assert.ok(r.dx * sign >= 3.2 * 0.75 && r.dx * sign <= 3.2 * 1.25, `desplazamiento ${r.dx}`);
        assert.ok(Math.abs(r.turned) >= spin, `giro ${r.turned}`);
        assert.ok(Math.abs(r.wrapped) <= 0.35, `ángulo envuelto ${r.wrapped}`);
    }
    assert.ok(forward.turned < 0 && center.turned < 0 && back.turned > 0, "el giro sigue el sentido del clip");
});

test("el roll tiene enfriamiento: un segundo LT + A inmediato no rueda", async () => {
    const game = await startDuel(7);
    const player = game.state.players[0];
    game.setPad(0, { buttons: [BUTTON.LT, BUTTON.A], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { buttons: [BUTTON.LT], axes: AIM_RIGHT });
    game.frames(Math.round(ROLL.duration / DT) + 3);
    assert.notEqual(player.clipState, "roll");
    game.setPad(0, { buttons: [BUTTON.LT, BUTTON.A], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { buttons: [BUTTON.LT], axes: AIM_RIGHT });
    assert.notEqual(player.clipState, "roll", "dentro de ROLL.cooldown");
    game.frames(Math.round(ROLL.cooldown / DT));
    game.setPad(0, { buttons: [BUTTON.LT, BUTTON.A], axes: AIM_RIGHT });
    game.frame();
    assert.equal(player.clipState, "roll");
});

test("al terminar el roll con LT apretado vuelve a block", async () => {
    const game = await startDuel(7);
    const player = game.state.players[0];
    game.setPad(0, { buttons: [BUTTON.LT, BUTTON.A], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { buttons: [BUTTON.LT], axes: AIM_RIGHT });
    game.frames(Math.round(ROLL.duration / DT) + 40);
    assert.equal(player.clipState, "block");
});

test("en el aire, LT + A no rueda ni salta", async () => {
    const game = await startDuel(7);
    const player = game.state.players[0];
    game.setPad(0, { buttons: [BUTTON.A], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(20);
    const vy = player.torso.GetLinearVelocity().get_y();
    game.setPad(0, { buttons: [BUTTON.LT, BUTTON.A], axes: AIM_RIGHT });
    game.frame();
    assert.ok(!["roll", "rollBack", "block"].includes(player.clipState), player.clipState);
    assert.ok(player.torso.GetLinearVelocity().get_y() <= vy + 0.01, "no hay segundo salto");
});

test("R19: la mira cruza al otro lado a mitad del roll y el giro se aplica al terminar, sin perder joints", async (t) => {
    const game = await startDuel(7);
    const world = game.state.world;
    const jointsBefore = world.GetJointCount();
    const player = () => game.state.players[0];
    game.setPad(0, { buttons: [BUTTON.LT, BUTTON.A], axes: [1, 0, 1, 0] });
    game.frame();
    game.setPad(0, { buttons: [BUTTON.LT], axes: [1, 0, -1, 0] });
    const first = player();
    let flippedDuring = false;
    let flippedAt = -1;
    for (let f = 0; f < 80; f++) {
        game.frame();
        if (player() !== first && flippedAt < 0) flippedAt = f;
        if (flippedAt < 0 && player().flipX) flippedDuring = true;
        if (flippedAt < 0 && f > 3 && f < Math.round(ROLL.duration / DT) - 3) assert.equal(player().flipX, false, "durante el roll no gira");
    }
    t.diagnostic(`R19: giro en el frame ${flippedAt} (el roll dura ${Math.round(ROLL.duration / DT)} pasos), joints ${jointsBefore} -> ${world.GetJointCount()}`);
    assert.equal(flippedDuring, false);
    assert.ok(flippedAt >= Math.round(ROLL.duration / DT) - 3, "el giro espera a que termine el roll");
    assert.equal(player().flipX, true);
    assert.equal(world.GetJointCount(), jointsBefore);
});

test("R20: 1.000 combos, bloqueos y rolls no dejan objetos nativos ni hacen crecer el heap", async (t) => {
    const game = await startDuel(7);
    const { world } = game.state;
    const probe = () => {
        const v = new Box2D.b2Vec2(0, 0);
        const ptr = Box2D.getPointer(v);
        Box2D.destroy(v);
        return ptr;
    };
    const cycle = (i) => {
        const kind = i % 4;
        const buttons = [];
        if (kind === 0 || kind === 3) buttons.push(BUTTON.B);
        if (kind === 1) buttons.push(BUTTON.LT);
        if (kind === 2) buttons.push(BUTTON.LT, BUTTON.A);
        game.setPad(0, { buttons, axes: AIM_RIGHT });
        game.setPad(1, { buttons: kind === 1 ? [BUTTON.LT] : [], axes: AIM_LEFT });
        game.frame();
        game.setPad(0, { buttons: kind === 1 ? [BUTTON.LT] : [], axes: AIM_RIGHT });
        game.frames(2);
    };
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(30);
    const bodies = world.GetBodyCount();
    const joints = world.GetJointCount();
    for (let i = 0; i < 600; i++) cycle(i);
    const growth = [];
    let last = probe();
    for (let window = 0; window < 4; window++) {
        for (let i = 600 + window * 100; i < 700 + window * 100; i++) cycle(i);
        const now = probe();
        growth.push(now - last);
        last = now;
    }
    t.diagnostic(`R20: cuerpos ${bodies} -> ${world.GetBodyCount()}, joints ${joints} -> ${world.GetJointCount()}, crecimiento del puntero de prueba por cada 100 ciclos: ${growth}`);
    assert.equal(world.GetBodyCount(), bodies);
    assert.equal(world.GetJointCount(), joints);
    const jumps = growth.filter((bytes) => bytes > 1024);
    assert.ok(jumps.length <= 1, `crece de forma sostenida: ${growth}`);
    assert.ok(growth.reduce((a, b) => a + b, 0) - jumps.reduce((a, b) => a + b, 0) <= 1024);
});