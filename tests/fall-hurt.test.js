import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { BUTTON } from "./helpers/duel.js";

async function solo() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(60);
    return game;
}

function lift(player, height) {
    const offset = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const pos = body.GetPosition();
        offset.set_x(pos.get_x());
        offset.set_y(pos.get_y() + height);
        body.SetTransform(offset, body.GetAngle());
    }
    Box2D.destroy(offset);
}

/** Deja caer a J1 desde `height` m y corre hasta `limit` frames; devuelve la lista de estados distintos en orden. */
function fall(game, height, limit = 400, each = () => {}) {
    const player = game.state.players[0];
    lift(player, height);
    const states = [];
    const frames = {};
    for (let f = 0; f < limit; f++) {
        each(f, player);
        game.frame();
        if (states.at(-1) !== player.clipState) states.push(player.clipState);
        frames[player.clipState] = (frames[player.clipState] ?? 0) + 1;
    }
    return { states, frames };
}

test("F1: una caída con daño pasa por landHurt y una levantada; una sin daño no", async (t) => {
    const hurt = await solo();
    const hp = hurt.state.players[0].hp;
    const a = fall(hurt, 7);
    t.diagnostic(`F1 con daño: ${a.states.join(" > ")}, hp ${hp} -> ${hurt.state.players[0].hp.toFixed(1)}`);
    assert.ok(hurt.state.players[0].hp < hp);
    const at = a.states.indexOf("landHurt");
    assert.ok(at >= 0, `estados: ${a.states}`);
    assert.ok(["getupFront", "getupBack"].includes(a.states[at + 1]), `estados: ${a.states}`);

    const soft = await solo();
    const hpSoft = soft.state.players[0].hp;
    const b = fall(soft, 5);
    t.diagnostic(`F1 sin daño: ${b.states.join(" > ")}, hp ${hpSoft} -> ${soft.state.players[0].hp}`);
    assert.ok(b.states.includes("fallHigh"), `estados: ${b.states}`);
    assert.equal(soft.state.players[0].hp, hpSoft);
    assert.ok(!b.states.some((s) => s === "landHurt" || s.startsWith("getup")), `estados: ${b.states}`);
});

test("F2: boca abajo elige getupFront y boca arriba getupBack, con el lado a la derecha y a la izquierda", async (t) => {
    for (const flipX of [false, true]) {
        for (const [name, down, expected] of [["boca abajo", true, "getupFront"], ["boca arriba", false, "getupBack"]]) {
            const game = await solo();
            const player = game.state.players[flipX ? 1 : 0];
            const origin = new Box2D.b2Vec2(0, 0);
            lift(player, 7);
            let forced = false;
            let result = null;
            for (let f = 0; f < 400 && result === null; f++) {
                if (player.recoverState === "landHurt" && player.now - player.recoverStart > 0.9) {
                    const pos = player.torso.GetPosition();
                    origin.set_x(pos.get_x());
                    origin.set_y(pos.get_y());
                    player.torso.SetTransform(origin, player.side * (down ? -Math.PI / 2 : Math.PI / 2));
                    player.torso.SetAngularVelocity(0);
                    forced = true;
                }
                game.frame();
                if (forced && player.clipState.startsWith("getup")) result = player.clipState;
            }
            Box2D.destroy(origin);
            t.diagnostic(`F2 flipX=${flipX} ${name}: ${result}`);
            assert.equal(result, expected, `flipX=${flipX} ${name}`);
        }
    }
});

test("F3: durante la secuencia el pad no mueve, no gira, no salta, no ataca ni dispara; al terminar responde", async (t) => {
    const run = async (busy) => {
        const game = await solo();
        const player = game.state.players[0];
        lift(player, 7);
        const trace = [];
        let start = -1;
        let end = -1;
        let shots = 0;
        let side0 = player.side;
        for (let f = 0; f < 400; f++) {
            if (busy && player.recovering()) {
                const k = f % 6;
                game.setPad(0, {
                    buttons: [BUTTON.RT, ...(k < 3 ? [BUTTON.A] : [BUTTON.B])],
                    axes: [k % 2 ? -1 : 1, 0, k % 2 ? -1 : 1, 0],
                });
            } else if (busy) {
                game.setPad(0);
            }
            const before = game.state.particleSystem.GetParticleCount();
            game.frame();
            if (player.recovering()) {
                if (start < 0) {
                    start = f;
                    side0 = player.side;
                }
                trace.push({ x: player.torso.GetPosition().get_x(), side: player.side });
                shots += game.state.particleSystem.GetParticleCount() - before;
            } else if (start >= 0 && end < 0) {
                end = f;
            }
        }
        game.setPad(0);
        return { trace, start, end, shots, side0 };
    };
    const base = await run(false);
    const pressed = await run(true);
    t.diagnostic(`F3: secuencia de ${base.trace.length} frames (${(base.trace.length / 60).toFixed(2)} s) sin input y ${pressed.trace.length} con input; partículas ${pressed.shots}`);
    assert.ok(base.trace.length > 150);
    assert.equal(pressed.trace.length, base.trace.length);
    const n = base.trace.length;
    let maxDiff = 0;
    for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(pressed.trace[i].x - base.trace[i].x));
    t.diagnostic(`F3: diferencia máxima de x ${maxDiff.toFixed(4)} m`);
    assert.ok(maxDiff < 0.1, `diferencia de x ${maxDiff}`);
    assert.ok(pressed.trace.every((p) => p.side === pressed.side0), "el lado cambió");
    assert.equal(pressed.shots, 0);
});

test("F4: al terminar la secuencia el robot está de pie y responde al stick", async (t) => {
    const game = await solo();
    const player = game.state.players[0];
    fall(game, 7, 400);
    assert.ok(!player.recovering());
    game.setPad(0, { axes: [1, 0, 1, 0] });
    game.frames(5);
    const x0 = player.torso.GetPosition().get_x();
    game.frames(60);
    const moved = player.torso.GetPosition().get_x() - x0;
    t.diagnostic(`F4: estado ${player.clipState}, desplazamiento en 1 s ${moved.toFixed(2)} m, ángulo del torso ${player.torso.GetAngle().toFixed(2)} rad`);
    assert.ok(moved > 1, `desplazamiento ${moved}`);
});

test("F5: un golpe durante la secuencia no cambia de clip y la muerte la corta", async () => {
    const game = await solo();
    const player = game.state.players[0];
    lift(player, 7);
    for (let f = 0; f < 400 && player.recoverState !== "landHurt"; f++) game.frame();
    assert.equal(player.clipState, "landHurt");
    player.hit("stumble");
    game.frame();
    assert.equal(player.clipState, "landHurt");
    player.hp = 0;
    game.frame();
    assert.equal(player.clipState, "dead");
});
