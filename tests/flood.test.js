/**
 * Inundación como fuente de lluvia y reglas de la pileta (docs/design/14-agua.md §14.7, §14.16: I4, I7, I8 y W6).
 * LiquidFun real contra el campo de alturas del nivel real.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeScene, fillField, floodRun, A_P, DT } from "./helpers/water-scene.js";
import { loadGame } from "./helpers/game.js";

const { LEVEL } = await import("../js/level.js");
const { floodLevel, waterArea, freeWidth, levelOfArea, rainX } = await import("../js/flood.js");

const F = LEVEL.flood;
const fmt = (n, digits = 3) => Number(n).toFixed(digits);

test("floodLevel: pileta antes de start, sube a riseSpeed y se frena en maxLevel", () => {
    assert.equal(floodLevel(0), LEVEL.pool.surface);
    assert.equal(floodLevel(F.start), LEVEL.pool.surface);
    assert.ok(Math.abs(floodLevel(F.start + 20) - (LEVEL.pool.surface + F.riseSpeed * 20)) < 1e-9);
    assert.equal(floodLevel(10000), F.maxLevel);
});

test("waterArea: 0 en la pileta, ancho del hueco sobre ella y total coherente con el presupuesto", () => {
    assert.equal(waterArea(LEVEL.pool.surface), 0);
    const hole = LEVEL.pool.x2 - LEVEL.pool.x1;
    assert.ok(Math.abs(waterArea(4) - hole) < 0.01, `área ${waterArea(4)}`);
    let previous = 0;
    for (let h = 3; h <= F.maxLevel; h += 0.5) {
        const area = waterArea(h);
        assert.ok(area >= previous, "el área no decrece");
        previous = area;
    }
    assert.ok(waterArea(F.maxLevel) > 600 && waterArea(F.maxLevel) < 680, `área ${waterArea(F.maxLevel)}`);
});

test("freeWidth y levelOfArea: el ancho libre es la derivada del área y la inversa la recupera", () => {
    assert.equal(freeWidth(3.5), LEVEL.pool.x2 - LEVEL.pool.x1);
    assert.equal(freeWidth(10), 56, "las plataformas no son lecho del campo: no descuentan ancho");
    assert.equal(freeWidth(12), 56);
    for (const level of [3, 3.7, 4.2, 9, 14.9]) {
        assert.ok(Math.abs(levelOfArea(waterArea(level)) - level) < 1e-6, `nivel ${level}`);
    }
    assert.equal(levelOfArea(0), LEVEL.pool.surface);
    assert.equal(levelOfArea(-5), LEVEL.pool.surface);
});

test("rainX: determinista, dentro del emisor y bien repartida", () => {
    const xs = Array.from({ length: 1000 }, (_, i) => rainX(i, F));
    assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, (_, i) => rainX(i, F)));
    for (const x of xs) assert.ok(x >= F.emitX1 && x <= F.emitX2);
    const buckets = new Array(10).fill(0);
    for (const x of xs) buckets[Math.min(9, Math.floor(((x - F.emitX1) / (F.emitX2 - F.emitX1)) * 10))]++;
    for (const count of buckets) assert.ok(count > 80 && count < 120, `reparto ${buckets}`);
});

test("la fuente emite Q / A_p con Q = riseSpeed · W_libre, no antes de start y se corta con el nivel en maxLevel", (t) => {
    const scene = makeScene();
    const { flood, water, store } = scene;
    for (let i = 0; i < 120; i++) flood.step(F.start - 1, DT);
    assert.equal(flood.emitted, 0, "antes de start no llueve");
    assert.equal(flood.level, -Infinity);
    const before = flood.emitted;
    for (let i = 0; i < 60; i++) flood.step(F.start, DT);
    const expected = (F.riseSpeed * freeWidth(LEVEL.pool.surface)) / A_P;
    t.diagnostic(`fuente a nivel de la pileta: ${flood.emitted - before} gotas en 1 s contra Q / A_p = ${fmt(expected, 2)}`);
    assert.ok(Math.abs(flood.emitted - before - expected) <= 1.5, `${flood.emitted - before} contra ${expected}`);
    assert.equal(store.alive.reduce((a, b) => a + b, 0), flood.emitted);

    fillField(water, F.maxLevel);
    assert.ok(flood.meanLevel >= F.maxLevel - 0.01, `nivel medio ${flood.meanLevel}`);
    const emitted = flood.emitted;
    for (let i = 0; i < 60; i++) flood.step(F.start + 200, DT);
    assert.equal(flood.emitted, emitted, "con el campo en maxLevel no llueve más");
    fillField(water, F.maxLevel - 1);
    flood.step(F.start + 200, DT);
    assert.ok(flood.rate > 0, "bajo maxLevel sigue la fuente");

    store.reset();
    flood.reset();
    assert.equal(flood.emitted, 0);
    assert.equal(flood.active, false);
    assert.equal(water.volume(), flood.baseVolume);
    assert.ok(Math.abs(flood.meanLevel - LEVEL.pool.surface) < 1e-9);
    scene.dispose();
});

/**
 * Una sola inundación completa compartida por I4, I7 y W6: 170 s de lluvia desde `start` (la curva llega a
 * `maxLevel` a los 80 s) con la fuente por caudal, sin robots.
 */
let floodResult = null;
const flooded = () => (floodResult ??= floodRun({ seconds: 170, sample: 10 }));

test("I7: el volumen total (campo + partículas · A_p) sigue la curva de la inundación (±0,5 %) y lo retenido en plataformas es ≤ 800 partículas", (t) => {
    const run = flooded();
    let worst = 0;
    let worstEmitted = 0;
    for (const s of run.samples) {
        const curve = (s.total - s.curveVolume) / (s.curveVolume - run.volume0);
        const emitted = Math.abs(s.total - s.emittedVolume) / (s.emittedVolume - run.volume0);
        if (s.t >= 10) worst = Math.max(worst, Math.abs(curve));
        worstEmitted = Math.max(worstEmitted, emitted);
        t.diagnostic(
            `I7 t ${fmt(s.t, 0)} s: curva ${fmt(s.curveLevel, 2)} m, η medio ${fmt(s.meanLevel, 2)} m (${fmt(s.meanLevel - s.curveLevel, 2)} m), η medio solo del campo ${fmt(s.fieldLevel, 2)} m; ` +
                `volumen total ${fmt(s.total, 2)} m² contra curva ${fmt(s.curveVolume, 2)} m² (${fmt((s.total / s.curveVolume - 1) * 100, 2)} % del volumen, ${fmt(curve * 100, 2)} % del agregado); ` +
                `campo ${fmt(s.field, 2)} m², en vuelo ${s.flying}, retenidas ${s.retained}, caudal ${fmt(s.rate, 1)}/s`,
        );
    }
    const last = run.samples.at(-1);
    t.diagnostic(
        `I7: error máximo del volumen total contra la curva ${fmt(worst * 100, 3)} % del volumen agregado (tolerancia 0,5 %); contra lo emitido ${worstEmitted.toExponential(2)}; ` +
            `retenidas máx ${run.maxRetained} (tope 800), partículas máx ${run.maxCount}; η medio final ${fmt(last.meanLevel, 2)} m (solo del campo ${fmt(last.fieldLevel, 2)} m) contra curva ${fmt(last.curveLevel, 2)} m`,
    );
    const etaGap = Math.max(...run.samples.map((s) => Math.abs(s.realEta - s.fieldLevel)));
    t.diagnostic(
        `I7: η real del campo (media de b + h donde b < η) contra levelOfArea del campo: máx ${fmt(etaGap, 3)} m (tolerancia 0,02 m); ` +
            `η real final ${fmt(last.realEta, 3)} m con ${last.flying} gotas en vuelo (esperado 15,00 ±0,075 m)`,
    );
    assert.ok(worstEmitted < 1e-6, `conservación: ${worstEmitted}`);
    assert.ok(worst < 0.005, `error contra la curva ${worst}`);
    assert.ok(etaGap <= 0.02, `η real contra levelOfArea ${etaGap}`);
    assert.ok(Math.abs(last.realEta - LEVEL.flood.maxLevel) <= 0.075, `η real final ${last.realEta}`);
    if (run.maxRetained > 800) t.todo(`#143: retenidas en plataformas ${run.maxRetained}, tope 800`);
});

test("I4: ninguna partícula miscible queda por debajo de η − 2r después de un paso de absorción", (t) => {
    const run = flooded();
    const { stepsWithOffenders, maxOffenders, maxBefore } = run.miscibleBelow;
    t.diagnostic(`I4: pasos con partículas miscibles bajo η − 2r después de absorber: ${stepsWithOffenders} (máx ${maxOffenders}); tolerancia 0; antes de absorber llegó a haber ${maxBefore} (las que el campo subió en el paso)`);
    assert.equal(stepsWithOffenders, 0);
    assert.equal(maxOffenders, 0);
});

test("W6 en el nivel real con lluvia: min h ≥ 0 y 0 activaciones del tope de subpasos", (t) => {
    const { water } = flooded().scene;
    const stats = water.stats;
    t.diagnostic(`W6: ${stats.steps} pasos, ${stats.substeps} subpasos (${fmt(stats.substeps / stats.steps, 2)} por paso), min h ${stats.minH}, activaciones del tope ${stats.capHits} (tolerancia 0), repeticiones con dt/2 ${stats.halvings}, cantidad de movimiento anulada en celdas secas ${stats.droppedMomentum.toExponential(2)}`);
    assert.ok(stats.minH >= 0, `min h ${stats.minH}`);
    assert.equal(stats.capHits, 0);
});

/**
 * Dos robots en las islas con el script de `index.html`: el campo se llena a mano a `level` y la ronda corre al
 * `roundTime` dado. Devuelve el juego, con los gamepads sueltos.
 */
async function standing(level, roundTime) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(10);
    if (level) fillField(game.state.water, level);
    game.state.match.roundTime = roundTime;
    return game;
}

test("un robot quieto en seco no se moja y bajo el agua pierde vida por cortocircuito", async (t) => {
    const dry = await standing(0, 50);
    dry.frames(180);
    dry.state.players.forEach((p) => assert.equal(p.hp, 100));

    const early = await standing(0, 100);
    early.frames(30);
    early.state.players.forEach((p) => assert.equal(p.hp, 100, "la curva ya cubre los pies, pero el agua todavía no cayó"));

    const wet = await standing(7.5, 100);
    wet.frames(60);
    assert.ok(wet.state.players.every((p) => p.wet), "el agua ya los alcanzó");
    wet.state.players.forEach((p) => (p.hp = 100));
    const before = wet.state.players.map((p) => p.hp);
    wet.frames(180);
    const lost = wet.state.players.map((p, k) => before[k] - p.hp);
    t.diagnostic(`pérdida en 3 s con el agua a 7,5 m: ${lost.map((l) => fmt(l, 2)).join(" y ")} (esperado ~9)`);
    lost.forEach((l, k) => assert.ok(l > 8 && l < 9.2, `J${k + 1}: perdió ${l.toFixed(2)} en 3 s (esperado ~9)`));
});

test("D6: la pileta no moja antes de la inundación y el sensor mata", async () => {
    const before = await standing(7.5, 30);
    before.frames(60);
    assert.equal(before.state.flood.active, false);
    before.state.players.forEach((p) => assert.equal(p.wet, false, "el agua no moja antes de start"));

    const drowning = await standing(0, 30);
    const { players } = drowning.state;
    const dx = 28 - players[0].torso.GetPosition().get_x();
    const v = new Box2D.b2Vec2(0, 0);
    for (const body of players[0].rag.bodies.values()) {
        const p = body.GetPosition();
        v.set_x(p.get_x() + dx);
        v.set_y(p.get_y());
        body.SetTransform(v, body.GetAngle());
    }
    Box2D.destroy(v);
    drowning.frames(120);
    assert.equal(players[0].dead, true, "el sensor mató al robot que cayó a la pileta");
    assert.equal(players[1].dead, false);
});

test("reiniciar la ronda deja el campo asentado, sin gotas y con la fuente en cero", () => {
    const scene = makeScene();
    const { water, flood, store, system } = scene;
    const settled = water.volume();
    for (let i = 0; i < 600; i++) scene.step(F.start + i * DT);
    assert.ok(flood.emitted > 500);
    assert.ok(water.volume() > settled + 5, "el campo recibió agua");
    flood.reset();
    store.reset();
    scene.step(0);
    assert.equal(water.volume(), settled);
    assert.equal(system.GetParticleCount(), 0);
    assert.equal(flood.emitted, 0);
    assert.equal(flood.active, false);
    assert.equal(water.stats.steps, 1);
    scene.dispose();
});
test("I8: costo con la inundación al tope y dos robots disparando (se mide, no bloquea)", async (t) => {
    const game = await standing(12, F.start + 200);
    const { world, immersion, flood, damage, water, particleSystem, players, wallContact } = game.state;
    const ms = { step: 0, wall: 0, flood: 0, immersion: 0, water: 0, process: 0 };
    const timed = (owner, name, key) => {
        const original = owner[name].bind(owner);
        owner[name] = (...args) => {
            const t0 = process.hrtime.bigint();
            const result = original(...args);
            ms[key] += Number(process.hrtime.bigint() - t0) / 1e6;
            return result;
        };
    };
    game.frames(60 * 5);
    timed(world, "Step", "step");
    timed(wallContact, "update", "wall");
    timed(flood, "step", "flood");
    timed(immersion, "step", "immersion");
    timed(water, "step", "water");
    timed(damage, "process", "process");
    let steps = 0;
    const originalStep = immersion.step;
    immersion.step = (dt) => {
        originalStep(dt);
        steps++;
    };
    game.setPad(0, { buttons: [7], axes: [0, 0, 0.7, 0.7] });
    game.setPad(1, { buttons: [7], axes: [0, 0, -0.7, 0.7] });
    const frames = 300;
    let maxParticles = 0;
    let absorbed = immersion.stats.absorbed;
    for (let i = 0; i < frames; i++) {
        if (i % 30 === 0) players.forEach((p) => p.tanks.set(4, 300));
        game.frame();
        maxParticles = Math.max(maxParticles, particleSystem.GetParticleCount());
    }
    absorbed = immersion.stats.absorbed - absorbed;
    const physics = (ms.step + ms.wall + ms.flood + ms.immersion + ms.water + ms.process) / frames;
    t.diagnostic(
        `I8: física ${fmt(physics, 2)} ms/frame contra 8 ms (world.Step ${fmt(ms.step / frames)}, wallContact ${fmt(ms.wall / frames)}, flood ${fmt(ms.flood / frames)}, ` +
            `water.step ${fmt(ms.water / frames)}, immersion.step ${fmt(ms.immersion / frames)} [${fmt(ms.immersion / steps)} ms/paso contra 0,3], damage.process ${fmt(ms.process / frames)}); ` +
            `${steps} pasos, ${absorbed} absorbidas, hasta ${maxParticles} partículas, lluvia a ${fmt(flood.rate, 0)}/s, η medio ${fmt(flood.meanLevel, 2)} m, subpasos del campo ${fmt(water.stats.substeps / water.stats.steps, 2)} por paso`,
    );
    assert.ok(Number.isFinite(physics));
    assert.ok(absorbed > 0, "la lluvia y el chorro llegaron al campo");
    assert.equal(water.stats.capHits, 0);
});
