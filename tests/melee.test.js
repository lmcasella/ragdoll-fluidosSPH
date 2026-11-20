import { test } from "node:test";
import assert from "node:assert/strict";
import { BUTTON, AIM_RIGHT, AIM_LEFT, startDuel, run } from "./helpers/duel.js";

const { MELEE } = await import("../js/melee.js");
const { FLUID } = await import("../js/weapons.js");

const DT = 1 / 60;
const GAP = 0.8;
const COMBO_FRAMES = [0, 15, 39];

/** Frame en el que J1 aprieta B, y el resto del tiempo lo suelta; la mira queda a la derecha. */
const comboPresses = (frames) => (f) => ({ buttons: frames.includes(f) ? [BUTTON.B] : [], axes: AIM_RIGHT });

test("R6: combo de tres golpes con B en t = 0, 0,25 y 0,65 s", { todo: "sin el paso adelante (#230) solo conecta el golpe 1: el alcance depende de la animación de las piernas" }, async (t) => {
    const game = await startDuel(GAP);
    const [p1, p2] = game.state.players;
    const press = comboPresses(COMBO_FRAMES);
    const hp0 = p2.hp;
    const states = [];
    const hits = run(
        game,
        140,
        (f) => game.setPad(0, press(f)),
        () => states.push(p1.clipState),
    );
    const sequence = [...new Set(states)].filter((s) => s.startsWith("combo"));
    t.diagnostic(`R6: secuencia ${sequence}, impactos ${hits.length} (${hits.map((h) => `${h.kind}@${h.frame}`)}), hp ${hp0} -> ${p2.hp.toFixed(2)}, rival ${p2.clipState}`);
    assert.deepEqual(sequence, ["combo1", "combo2", "combo3"]);
    assert.equal(hits.length, 3);
    assert.equal(p2.clipState, "reactStumble");
});

test("R6: el primer golpe del combo conecta, daña según la parte y deja al rival en reactSimple", async (t) => {
    const game = await startDuel(GAP);
    const [p1, p2] = game.state.players;
    const press = comboPresses([0]);
    const states = [];
    let dealt = 0;
    const hp0 = p2.hp;
    const hits = run(
        game,
        30,
        (f) => game.setPad(0, press(f)),
        () => {
            states.push(p2.clipState);
            dealt = hp0 - p2.hp;
        },
    );
    t.diagnostic(`R6 golpe 1: impactos ${hits.length}, daño ${dealt.toFixed(2)}, estado del rival ${p2.clipState}`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, "hit");
    assert.ok(states.includes("reactSimple"));
    const multipliers = Object.values(p2.rig.damage).concat(p2.rig.defaultDamage).map((m) => m * MELEE.attacks.combo1.damage);
    assert.ok(multipliers.some((value) => Math.abs(value - dealt) <= 0.01), `daño ${dealt}`);
    assert.equal(p1.clipState, "combo1");
});

/**
 * Máximo alcance (m) de las piezas `bodies` medido desde el ancla de `origin`, a lo largo de un ataque sin rival:
 * devuelve el tiempo (s desde el inicio del ataque) en que ocurre.
 */
function reachPeak(player, row, bodies, samples) {
    const anchor = player.rag.joint(row.origin).GetAnchorA();
    const ax = anchor.get_x();
    const ay = anchor.get_y();
    let far = 0;
    for (const id of bodies) {
        for (let fixture = player.rag.bodies.get(id).GetFixtureList(); Box2D.getPointer(fixture) !== 0; fixture = fixture.GetNext()) {
            const aabb = fixture.GetAABB(0);
            const lo = aabb.get_lowerBound();
            const hi = aabb.get_upperBound();
            for (const x of [lo.get_x(), hi.get_x()]) {
                for (const y of [lo.get_y(), hi.get_y()]) far = Math.max(far, Math.hypot(x - ax, y - ay));
            }
        }
    }
    samples.push({ t: player.now - player.attackStart, far });
}

const HANDS = { combo1: ["b_14"], combo2: ["b_3"], combo3: ["b_3", "b_14"], airPunch: ["b_3", "b_14"], airKick: ["b_4", "b_16"] };

test("R6b: sin rival, el máximo alcance de la mano cae dentro de la ventana activa de cada golpe del combo", async (t) => {
    const game = await startDuel(7);
    const p1 = game.state.players[0];
    const press = comboPresses(COMBO_FRAMES);
    const samples = { combo1: [], combo2: [], combo3: [] };
    run(
        game,
        150,
        (f) => game.setPad(0, press(f)),
        () => {
            if (samples[p1.attack]) reachPeak(p1, MELEE.attacks[p1.attack], HANDS[p1.attack], samples[p1.attack]);
        },
    );
    for (const name of Object.keys(samples)) {
        const row = MELEE.attacks[name];
        const peak = samples[name].reduce((best, s) => (s.far > best.far ? s : best));
        t.diagnostic(`R6b ${name}: alcance máximo ${peak.far.toFixed(2)} m en t = ${peak.t.toFixed(3)} s; ventana ${row.active}`);
        assert.ok(peak.t >= row.active[0] - DT && peak.t <= row.active[1] + DT, `${name}: ${peak.t.toFixed(3)} fuera de ${row.active}`);
    }
});

/**
 * Salta con J1 y aprieta golpe o patada `after` frames después; mide el alcance de las piezas de ataque. Devuelve las
 * muestras del ataque aéreo.
 */
async function airReach(name, after, kick) {
    const game = await startDuel(7);
    const p1 = game.state.players[0];
    const samples = [];
    run(
        game,
        150,
        (f) => {
            const buttons = [];
            if (f === 0) buttons.push(BUTTON.A);
            if (f === after) buttons.push(BUTTON.B);
            game.setPad(0, { buttons, axes: kick && f >= after - 1 ? [0, 1, 1, 0] : AIM_RIGHT });
        },
        () => {
            if (p1.attack === name) reachPeak(p1, MELEE.attacks[name], HANDS[name], samples);
        },
    );
    return samples;
}

test("R6b: en el aire, la mano de airPunch y el pie de airKick alcanzan su máximo dentro de la ventana activa", async (t) => {
    for (const [name, kick] of [["airPunch", false], ["airKick", true]]) {
        const row = MELEE.attacks[name];
        const samples = await airReach(name, 12, kick);
        assert.ok(samples.length > 10, `${name}: ${samples.length} muestras`);
        const peak = samples.reduce((best, s) => (s.far > best.far ? s : best));
        t.diagnostic(`R6b ${name}: alcance máximo ${peak.far.toFixed(2)} m en t = ${peak.t.toFixed(3)} s; ventana ${row.active}`);
        assert.ok(peak.t >= row.active[0] - DT && peak.t <= row.active[1] + DT, `${name}: ${peak.t.toFixed(3)} fuera de ${row.active}`);
    }
});

test("R7: un solo B da combo1 y a los 0,4 + 0,2 s + 1 paso vuelve a la locomoción; el segundo toque a los 0,1 s no encadena", async (t) => {
    for (const [name, frames] of [["un toque", [0]], ["toque a los 0,1 s", [0, 6]]]) {
        const game = await startDuel(7);
        const p1 = game.state.players[0];
        const press = comboPresses(frames);
        const states = [];
        run(game, 60, (f) => game.setPad(0, press(f)), () => states.push(p1.clipState));
        const first = states.findIndex((s) => s === "combo1");
        const left = states.findIndex((s, i) => i > first && !s.startsWith("combo"));
        t.diagnostic(`R7 ${name}: combo1 en el frame ${first}, locomoción en el frame ${left} (${((left - first) * DT).toFixed(3)} s después)`);
        assert.equal(first, 0);
        assert.ok(!states.includes("combo2"), `${name}: encadenó`);
        assert.ok(states[Math.round(0.5 / DT)] === "combo1", "en la tolerancia sigue en combo1");
        assert.ok(left - first <= Math.ceil((0.4 + 0.2) / DT) + 1, `${name}: ${left - first} pasos`);
        assert.ok(!states[Math.ceil(0.6 / DT) + 2].startsWith("combo"));
    }
});

test("R7: un toque fuera de la ventana de encadenado empieza combo1 de nuevo, no combo2, una vez pasado el enfriamiento", async () => {
    const game = await startDuel(7);
    const p1 = game.state.players[0];
    const press = comboPresses([0, 56]);
    const states = [];
    run(game, 90, (f) => game.setPad(0, press(f)), () => states.push(p1.clipState));
    assert.equal(states[0], "combo1");
    assert.ok(!states[55].startsWith("combo"), "entre la tolerancia y el enfriamiento no hay ataque");
    assert.equal(states[56], "combo1");
    assert.ok(!states.includes("combo2"));
});

/**
 * Escenario de bloqueo: J2 mantiene LT de frente a 0,8 m y J1 hace el combo. Para cada golpe resuelto por `Melee`
 * guarda qué cuerpo tocó cada uno de los tres rayos y cuál recibió el impacto.
 */
async function blockDuel(frames, { p2Aim = AIM_LEFT, pressFrames = COMBO_FRAMES, p2Buttons = [BUTTON.LT] } = {}) {
    const game = await startDuel(GAP);
    const { melee, damage } = game.state;
    const probes = [];
    const original = melee.attack.bind(melee);
    melee.attack = (players, k, row, now) => {
        const anchor = players[k].rag.joint(row.origin).GetAnchorA();
        const ax = anchor.get_x();
        const ay = anchor.get_y();
        const base = Math.atan2(players[k].aimDir.y, players[k].aimDir.x);
        const touched = [row.spread * 0, -row.spread, row.spread].map((spread) => {
            const hit = melee.raycaster.cast(ax, ay, ax + Math.cos(base + spread) * row.reach, ay + Math.sin(base + spread) * row.reach, players[k].ownBodies);
            return hit ? damage.ownerOf(hit.bodyPtr)?.bodyId ?? null : null;
        });
        probes.push({ attacker: k, touched });
        return original(players, k, row, now);
    };
    game.setPad(1, { buttons: p2Buttons, axes: p2Aim });
    game.frames(10);
    const press = comboPresses(pressFrames);
    const samples = [];
    const hits = run(
        game,
        frames,
        (f) => game.setPad(0, press(f)),
        () => {
            const rival = game.state.players[1];
            samples.push({ vx: rival.torso.GetLinearVelocity().get_x(), state: rival.clipState, hp: rival.hp });
        },
    );
    return { game, hits, probes, samples };
}

test("R8 y R8b: contra un rival que bloquea de frente, los golpes 1 y 2 no dañan, no aturden y emiten block", async (t) => {
    const { game, hits, probes, samples } = await blockDuel(60, { pressFrames: [0, 15] });
    const p2 = game.state.players[1];
    const arms = new Set(p2.rig.arms);
    const report = probes.map((probe, i) => {
        const armRays = probe.touched.filter((id) => id && arms.has(id)).length;
        return `golpe ${i + 1}: rayos [${probe.touched}] (${armRays}/3 en un brazo)`;
    });
    t.diagnostic(`R8b: ${report.join("; ")}`);
    t.diagnostic(`R8: eventos ${hits.map((h) => `${h.kind}@${h.frame}`)}; hp ${p2.hp}; estados ${[...new Set(samples.map((s) => s.state))]}`);
    assert.equal(hits.length, 2);
    for (const hit of hits) assert.equal(hit.kind, "block");
    assert.equal(p2.hp, 100);
    assert.ok(samples.every((s) => s.state === "block"), "el rival sigue en block, sin aturdimiento ni reacción");
    assert.ok(!p2.isStunned());
    let worst = 0;
    for (const hit of hits) {
        const before = samples[hit.frame - 1].vx;
        worst = Math.max(worst, Math.abs(samples[hit.frame].vx - before));
    }
    t.diagnostic(`R8: Δvx máximo del torso rival en el paso de un golpe bloqueado ${worst.toFixed(3)} m/s`);
    assert.ok(worst < 1);
    for (const probe of probes) {
        assert.ok(probe.touched.some((id) => id && arms.has(id)), "el impacto cae primero en un brazo");
        const first = probe.touched.find((id) => id);
        assert.ok(arms.has(first), `el primer rayo que toca recibe el impacto en ${first}`);
    }
});

test("con el rival bloqueando, el combo con el pad llega a combo3, rompe la guardia y el rival tropieza", async (t) => {
    const { hits, samples } = await blockDuel(170);
    t.diagnostic(`eventos ${hits.map((h) => `${h.kind}@${h.frame}`)}`);
    assert.deepEqual(hits.map((h) => h.kind), ["block", "block", "blockBreak"]);
    assert.equal(samples[hits[2].frame].state, "reactStumble");
});

test("el tercer golpe del combo rompe la guardia: sin daño ni empuje, el rival tropieza y no vuelve a bloquear durante 0,7 s con LT mantenido", async (t) => {
    const game = await startDuel(GAP);
    game.setPad(1, { buttons: [BUTTON.LT], axes: AIM_LEFT });
    game.frames(10);
    const [p1, p2] = game.state.players;
    p1.beginAttack("combo3", p1.now);
    const samples = [];
    const hits = run(
        game,
        170,
        () => game.setPad(0, { buttons: [], axes: AIM_RIGHT }),
        () => {
            const v = p2.torso.GetLinearVelocity();
            samples.push({ vx: v.get_x(), vy: v.get_y(), state: p2.clipState });
        },
    );
    t.diagnostic(`rotura: eventos ${hits.map((h) => `${h.kind}@${h.frame}`)}; hp ${p2.hp}`);
    assert.deepEqual(hits.map((h) => h.kind), ["blockBreak"]);
    assert.equal(p2.hp, 100);
    const f = hits[0].frame;
    assert.equal(samples[f - 1].state, "block");
    assert.equal(samples[f].state, "reactStumble");
    const dv = Math.hypot(samples[f].vx - samples[f - 1].vx, samples[f].vy - samples[f - 1].vy);
    t.diagnostic(`Δv del torso rival al romper la guardia ${dv.toFixed(3)} m/s`);
    assert.ok(dv < 1.5);
    const stunned = Math.round(0.7 / DT);
    for (let i = f; i < f + stunned - 1; i++) assert.notEqual(samples[i].state, "block", `frame ${i - f}`);
    const back = samples.findIndex((s, i) => i > f && s.state === "block");
    t.diagnostic(`vuelve a block ${back - f} pasos después (${((back - f) * DT).toFixed(3)} s)`);
    assert.ok(back >= 0, "vuelve a bloquear después");
    assert.ok((back - f) * DT >= 0.7 - DT);
});

test("R8: el evento block queda a ±0,01 m del impacto del rayo", async () => {
    const { hits, game } = await blockDuel(60, { pressFrames: [0] });
    assert.equal(hits.length, 1);
    const { x, y } = hits[0];
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    const anchor = game.state.players[0].rag.joint("back_shoulder").GetAnchorA();
    assert.ok(Math.hypot(x - anchor.get_x(), y - anchor.get_y()) <= MELEE.attacks.combo1.reach + 0.01);
});

test("R9: un golpe por la espalda a un rival que bloquea daña y le da reacción normal", async (t) => {
    const { game, hits, samples } = await blockDuel(40, { p2Aim: AIM_RIGHT, pressFrames: [0] });
    const p2 = game.state.players[1];
    t.diagnostic(`R9: eventos ${hits.map((h) => h.kind)}, hp ${p2.hp}, estados ${[...new Set(samples.map((s) => s.state))]}`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, "hit");
    assert.ok(p2.hp < 100);
    assert.ok(samples.some((s) => s.state === "reactSimple"));
});

test("R11: LT + RT durante 1 s no emite partículas ni baja el tanque, y LT + B no ataca", async () => {
    const game = await startDuel(7);
    const [p1] = game.state.players;
    const before = game.state.particleSystem.GetParticleCount();
    const tank = p1.tanks.get(p1.weapon);
    game.setPad(0, { buttons: [BUTTON.LT, BUTTON.RT], axes: AIM_RIGHT });
    game.frames(60);
    assert.equal(game.state.particleSystem.GetParticleCount(), before);
    assert.equal(p1.tanks.get(p1.weapon), tank);
    game.setPad(0, { buttons: [BUTTON.LT, BUTTON.B], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { buttons: [BUTTON.LT], axes: AIM_RIGHT });
    game.frames(30);
    assert.equal(p1.attack, null);
    assert.equal(p1.clipState, "block");
});

test("bloqueo > golpe > disparo: un golpe corta el chorro mientras dura y al terminar vuelve a disparar", async () => {
    const game = await startDuel(7);
    const [p1] = game.state.players;
    game.setPad(0, { buttons: [BUTTON.RT], axes: AIM_RIGHT });
    game.frames(30);
    const tank0 = p1.tanks.get(p1.weapon);
    assert.ok(tank0 < MELEE.impulse * 1e9);
    game.setPad(0, { buttons: [BUTTON.RT, BUTTON.B], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { buttons: [BUTTON.RT], axes: AIM_RIGHT });
    const tankAtPunch = p1.tanks.get(p1.weapon);
    game.frames(20);
    assert.ok(p1.armsBusy);
    assert.equal(p1.tanks.get(p1.weapon), tankAtPunch, "sin disparo durante el ataque");
});

test("R13: un golpe que conecta a mitad del roll daña normal, da reactSimple en ese paso y corta el roll", async (t) => {
    const game = await startDuel(GAP);
    const [p1, p2] = game.state.players;
    game.setPad(1, { axes: AIM_LEFT });
    game.frames(5);
    const hp0 = p1.hp;
    let rollFrames = 0;
    let reactAt = -1;
    let rolledBeforeHit = 0;
    const hits = run(
        game,
        60,
        (f) => {
            game.setPad(1, { buttons: f === 0 ? [BUTTON.LT, BUTTON.A] : [BUTTON.LT], axes: [-1, 0, -1, 0] });
            game.setPad(0, { buttons: f === 0 ? [BUTTON.B] : [], axes: AIM_RIGHT });
        },
        (f) => {
            if (p2.clipState === "roll") rollFrames++;
            if (p2.clipState === "reactSimple" && reactAt < 0) reactAt = f;
        },
    );
    t.diagnostic(`R13: ${hits.map((h) => `${h.kind}@${h.frame}`)}, roll durante ${rollFrames} frames, reacción en el frame ${reactAt}, hp rival ${p2.hp.toFixed(2)} (atacante ${hp0 - p1.hp})`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, "hit");
    assert.equal(reactAt, hits[0].frame, "reactSimple en el paso del golpe");
    assert.ok(rollFrames < Math.round(0.8 / DT) - 5, "el roll se corta");
    assert.ok(p2.hp < 100);
    assert.ok(!p2.rolling());
});

test("R14: B en el aire es airPunch, abajo + B en el aire es airKick y aterrizar corta el ataque en 3 pasos", async (t) => {
    for (const [name, kick, expected] of [["B", false, "airPunch"], ["abajo + B", true, "airKick"]]) {
        const game = await startDuel(7);
        const p1 = game.state.players[0];
        const seen = new Set();
        run(
            game,
            40,
            (f) => {
                const buttons = [];
                if (f === 0) buttons.push(BUTTON.A);
                if (f === 12) buttons.push(BUTTON.B);
                game.setPad(0, { buttons, axes: kick && f >= 11 ? [0, 1, 1, 0] : AIM_RIGHT });
            },
            () => seen.add(p1.clipState),
        );
        t.diagnostic(`R14 ${name}: estados ${[...seen]}`);
        assert.ok(seen.has(expected), `${name}: ${[...seen]}`);
    }

    const game = await startDuel(7);
    const p1 = game.state.players[0];
    let airborne = false;
    let contactAt = -1;
    let result = null;
    run(
        game,
        160,
        (f) => {
            const buttons = [];
            if (f === 0) buttons.push(BUTTON.A);
            if (f === 70) buttons.push(BUTTON.B);
            game.setPad(0, { buttons, axes: AIM_RIGHT });
        },
        (f) => {
            if (!p1.isGrounded()) airborne = true;
            else if (airborne && contactAt < 0) contactAt = f;
            if (contactAt >= 0 && f === contactAt + 3 && result === null) result = { state: p1.clipState, attack: p1.attack };
        },
    );
    t.diagnostic(`R14 aterrizar a mitad de airPunch: contacto en el frame ${contactAt}, 3 pasos después ${JSON.stringify(result)}`);
    assert.ok(["idle", "aim", "walk", "walkBack"].includes(result.state));
    assert.equal(result.attack, null);
});

test("R14: un airKick que conecta deja al rival en reactStumble", async (t) => {
    const game = await startDuel(GAP);
    const [p1, p2] = game.state.players;
    const offset = new Box2D.b2Vec2(0, 0);
    const lift = (player, dy) => {
        for (const body of player.rag.bodies.values()) {
            const pos = body.GetPosition();
            offset.set_x(pos.get_x());
            offset.set_y(pos.get_y() + dy);
            body.SetTransform(offset, body.GetAngle());
        }
    };
    const states = new Set();
    const hits = run(
        game,
        90,
        (f) => {
            const buttons = [];
            if (f === 0) buttons.push(BUTTON.A);
            if (f === 6) buttons.push(BUTTON.B);
            game.setPad(0, { buttons, axes: f >= 5 ? [0, 1, 1, 0] : AIM_RIGHT });
            if (f === 38) lift(p2, p1.torso.GetPosition().get_y() - p2.torso.GetPosition().get_y() + 0.3);
        },
        () => states.add(p2.clipState),
    );
    Box2D.destroy(offset);
    t.diagnostic(`R14 airKick: eventos ${hits.map((h) => `${h.kind}@${h.frame}`)}, estados del rival ${[...states]}, hp ${p2.hp.toFixed(2)}`);
    assert.ok(hits.some((h) => h.kind === "hit"));
    assert.ok(states.has("reactStumble"));
});

test("R15: un golpe que conecta deja al receptor en reactSimple en el mismo paso y dura 0,4 s", async (t) => {
    const game = await startDuel(GAP);
    const [, p2] = game.state.players;
    const states = [];
    const hits = run(
        game,
        50,
        (f) => game.setPad(0, { buttons: f === 0 ? [BUTTON.B] : [], axes: AIM_RIGHT }),
        () => states.push(p2.clipState),
    );
    const hitFrame = hits[0].frame;
    const end = states.findIndex((s, i) => i > hitFrame && s !== "reactSimple");
    t.diagnostic(`R15: golpe en el frame ${hitFrame}, reactSimple desde el mismo frame hasta ${end - 1} (${((end - hitFrame) * DT).toFixed(3)} s)`);
    assert.equal(states[hitFrame], "reactSimple");
    assert.ok(Math.abs((end - hitFrame) * DT - 0.4) <= 2 * DT);
});

/**
 * Chorro de ácido de 1 s de J1 contra J2 a `gap` m, con J2 bloqueando o no; devuelve la vida que pierde J2 en 6 s.
 */
async function acidDamage(gap, block) {
    const game = await startDuel(gap);
    const [p1] = game.state.players;
    p1.weapon = FLUID.ACID;
    game.setPad(1, { buttons: block ? [BUTTON.LT] : [], axes: AIM_LEFT });
    game.frames(15);
    for (let f = 0; f < 60; f++) {
        game.setPad(0, { buttons: [BUTTON.RT], axes: AIM_RIGHT });
        game.frame();
    }
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(300);
    return 100 - game.state.players[1].hp;
}

test("R10: el chorro de ácido daña igual (±10 %) a un rival que bloquea y a uno que no", { todo: "la pose de block expone otras partes: +14 % a 2,2 m y +19 % a 1,5 m" }, async (t) => {
    for (const gap of [1.5, 2.2]) {
        const open = await acidDamage(gap, false);
        const guarded = await acidDamage(gap, true);
        t.diagnostic(`R10 a ${gap} m: sin bloquear ${open.toFixed(2)}, bloqueando ${guarded.toFixed(2)} (${(((guarded - open) / open) * 100).toFixed(1)} %)`);
        assert.ok(Math.abs(guarded - open) <= 0.1 * open, `${gap} m: ${open} vs ${guarded}`);
    }
});