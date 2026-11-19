/**
 * Absorción e inmersión de #71 (docs/design/14-agua.md §14.4 y §14.16, I1 a I6): LiquidFun real contra el campo de
 * alturas, con el nivel real, el `ParticleStore` y el contorno inelástico. El costo (I8), la inundación (I4, I7) y la
 * positividad (W6) están en `flood.test.js`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeScene, wavePulse, particle, A_P, DT, G, RADIUS } from "./helpers/water-scene.js";

const { FLUID, SHOT_SYSTEM } = await import("../js/weapons.js");
const { LEVEL } = await import("../js/level.js");
const { MATERIALS, SIGMA_W } = await import("../js/materials.js");

const SG = new Map([[FLUID.WATER, MATERIALS.water.SG], [FLUID.ACID, MATERIALS.acid.SG], [FLUID.HONEY, MATERIALS.honey.SG], [FLUID.LAVA, MATERIALS.lava.SG]]);
const SURFACE = LEVEL.pool.surface;

test("I1: N gotas de agua caen en la pileta y el volumen del campo crece N · A_p (error relativo < 1e-6)", (t) => {
    const scene = makeScene();
    const n = 60;
    const v0 = scene.water.volume();
    for (let k = 0; k < n; k++) scene.spawn(FLUID.WATER, 24 + (k * 8) / n, 4.2 + (k % 5) * 0.3);
    for (let s = 0; s < 180 && scene.immersion.stats.absorbed < n; s++) scene.step();
    const grown = scene.water.volume() - v0;
    const expected = n * (1.5 * SHOT_SYSTEM.radius) ** 2;
    const error = Math.abs(grown - expected) / expected;
    const exact = Math.abs(grown - n * scene.immersion.area) / (n * scene.immersion.area);
    t.diagnostic(`I1: ${scene.immersion.stats.absorbed} absorbidas; el campo creció ${grown.toFixed(9)} m² contra N · A_p = ${expected.toFixed(9)} m²; error relativo ${error.toExponential(2)} (con el radio en float32 del motor, ${exact.toExponential(2)}); tolerancia 1e-6`);
    assert.equal(scene.immersion.stats.absorbed, n);
    assert.ok(error < 1e-6, `error relativo ${error}`);
    assert.equal(scene.store.alive.reduce((a, b) => a + b, 0), 0, "no queda ninguna partícula viva");
    scene.dispose();
});

test("I2: la cantidad de movimiento horizontal absorbida, antes de water.step, es Σ SG · A_p · v_x (error relativo < 1e-6)", (t) => {
    const scene = makeScene();
    const kinds = [FLUID.WATER, FLUID.ACID];
    const n = 45;
    let expected = 0;
    let scale = 0;
    for (let k = 0; k < n; k++) {
        const kind = kinds[k % kinds.length];
        const vx = 12 * Math.sin(k * 1.7) + 0.37;
        scene.spawn(kind, 21 + (k * 14) / n, 2.9, vx, -6);
        const stored = particle(scene.system, k).vx;
        expected += SG.get(kind) * A_P * stored;
        scale += SG.get(kind) * A_P * Math.abs(stored);
    }
    const before = scene.water.momentum();
    const energy0 = scene.water.energy();
    scene.immersion.step(DT);
    const gained = scene.water.momentum() - before;
    const error = Math.abs(gained - expected) / scale;
    const heat = n * A_P * SIGMA_W * MATERIALS.water.c * scene.water.config.ambientT;
    const extra = scene.water.energy() - energy0 - heat;
    t.diagnostic(`I2: Δ Σ q dx = ${gained.toExponential(9)} m³/s contra Σ SG A_p v_x = ${expected.toExponential(9)}; error relativo a Σ|SG A_p v_x| ${error.toExponential(2)}; tolerancia 1e-6; pérdida inelástica sumada a la energía ${extra.toFixed(3)} J`);
    assert.equal(scene.immersion.stats.absorbed, n);
    assert.ok(error < 1e-6, `error relativo ${error}`);
    assert.ok(extra >= 0, `la pérdida inelástica es negativa: ${extra}`);
    scene.dispose();
});

test("I3: 20 gotas en x₀ generan dos frentes a ±√(g h) (±10 %)", (t) => {
    const { scene, eta, firstAt } = wavePulse({ x0: 28, seconds: 2.4 });
    const water = scene.water;
    const expected = Math.sqrt(G * SURFACE);
    const slope = (rows, k) => {
        const mt = rows.reduce((a, r) => a + r[0], 0) / rows.length;
        const mx = rows.reduce((a, r) => a + r[k], 0) / rows.length;
        let num = 0;
        let den = 0;
        for (const r of rows) {
            num += (r[0] - mt) * (r[k] - mx);
            den += (r[0] - mt) ** 2;
        }
        return num / den;
    };
    const measure = (threshold) => {
        const rows = [];
        for (let s = firstAt; s < eta.length; s++) {
            let right = NaN;
            let left = NaN;
            for (let i = water.N - 1; i >= 0; i--) if (water.b[i] === 0 && eta[s][i] - SURFACE > threshold) { right = water.center(i); break; }
            for (let i = 0; i < water.N; i++) if (water.b[i] === 0 && eta[s][i] - SURFACE > threshold) { left = water.center(i); break; }
            const time = (s - firstAt) / 60;
            if (time >= 0.4 && time <= 1.5) rows.push([time, left, right]);
        }
        return { right: slope(rows, 2), left: -slope(rows, 1), samples: rows.length };
    };
    for (const threshold of [0.002, 0.01]) {
        const m = measure(threshold);
        t.diagnostic(`I3 (frente en η − 3 > ${threshold * 1000} mm, entre 0,4 y 1,5 s de la primera gota, ${m.samples} muestras): derecho ${m.right.toFixed(2)} m/s, izquierdo ${m.left.toFixed(2)} m/s contra √(g h) = ${expected.toFixed(2)} m/s (${((m.right / expected - 1) * 100).toFixed(1)} %, ${((m.left / expected - 1) * 100).toFixed(1)} %); tolerancia ±10 %`);
        assert.ok(m.samples >= 50, `solo ${m.samples} muestras`);
        assert.ok(Math.abs(m.right / expected - 1) <= 0.1, `frente derecho ${m.right}`);
        assert.ok(Math.abs(m.left / expected - 1) <= 0.1, `frente izquierdo ${m.left}`);
    }
    assert.equal(scene.immersion.stats.absorbed, 20);
    scene.dispose();
});

test("I5: la lava soltada en agua quieta de 3 m cae a la velocidad terminal √(2 g (SG − 1) A_p / (C_d D)) = 1,55 m/s (±15 %)", (t) => {
    const scene = makeScene();
    const diameter = 1.5 * RADIUS;
    const expected = Math.sqrt((2 * G * (MATERIALS.lava.SG - 1) * A_P) / (MATERIALS.lava.Cd * diameter));
    scene.spawn(FLUID.LAVA, 28, SURFACE - 0.05);
    const window = [];
    let lowest = Infinity;
    for (let s = 1; s <= 80; s++) {
        scene.step();
        const p = particle(scene.system, 0);
        lowest = Math.min(lowest, p.y);
        if (s >= 54 && s <= 78) window.push({ y: p.y, speed: -p.vy });
    }
    const mean = window.reduce((a, w) => a + w.speed, 0) / window.length;
    const top = Math.max(...window.map((w) => w.y));
    const bottom = Math.min(...window.map((w) => w.y));
    t.diagnostic(`I5: velocidad media entre 0,9 y 1,3 s ${mean.toFixed(3)} m/s contra ${expected.toFixed(3)} m/s (${((mean / expected - 1) * 100).toFixed(1)} %); tolerancia ±15 %; la ventana va de y ${top.toFixed(2)} a ${bottom.toFixed(2)} m`);
    assert.ok(Math.abs(expected - 1.55) < 0.01, `terminal esperada ${expected}`);
    assert.ok(bottom > 0.4, "la ventana de medición está dentro del agua, lejos del fondo");
    assert.ok(Math.abs(mean / expected - 1) <= 0.15, `velocidad media ${mean}`);
    assert.equal(scene.immersion.count, 1);
    scene.dispose();
});

test("H1 (#110): la miel soltada a 2,8 m en agua quieta de 3 m cae a la velocidad terminal √(2 g (SG − 1) A_p / (C_d D)) = 0,79 m/s (±15 %) y no se absorbe", (t) => {
    const scene = makeScene();
    const diameter = 1.5 * RADIUS;
    const expected = Math.sqrt((2 * G * (MATERIALS.honey.SG - 1) * A_P) / (MATERIALS.honey.Cd * diameter));
    scene.spawn(FLUID.HONEY, 28, 2.8);
    const speeds = [];
    let reachedBottom = -1;
    for (let s = 1; s <= 600; s++) {
        scene.step();
        const p = particle(scene.system, 0);
        if (p.y <= 2.2 && p.y >= 0.6) speeds.push(-p.vy);
        if (reachedBottom < 0 && p.y < 0.6) {
            reachedBottom = s;
            break;
        }
    }
    const mean = speeds.reduce((a, v) => a + v, 0) / speeds.length;
    t.diagnostic(`H1: velocidad media entre y = 2,2 y 0,6 m ${mean.toFixed(3)} m/s contra ${expected.toFixed(3)} m/s (${((mean / expected - 1) * 100).toFixed(1)} %), ${speeds.length} pasos; tolerancia ±15 %; absorbidas ${scene.immersion.stats.absorbed}`);
    assert.ok(Math.abs(expected - 0.79) < 0.01, `terminal esperada ${expected}`);
    assert.ok(reachedBottom > 0, "la partícula no llegó a y = 0,6 m");
    assert.ok(Math.abs(mean / expected - 1) <= 0.15, `velocidad media ${mean}`);
    assert.equal(scene.immersion.stats.absorbed, 0);
    assert.equal(scene.immersion.count, 1);
    scene.dispose();
});
/**
 * Un paso de `immersion.step` con una sola partícula en `(x, y)`: cambio de cantidad de movimiento horizontal
 * (kg·m/s de la rebanada) de la partícula y de las columnas, y velocidad relativa horizontal antes y después
 * contra la columna `column`.
 */
function exchange(scene, kind, x, y, vx, vy, column) {
    const { water, immersion, system } = scene;
    const index = scene.spawn(kind, x, y, vx, vy);
    const p0 = particle(system, index);
    const rel0 = p0.vx - water.uOf(column);
    const q0 = water.momentum();
    immersion.step(DT);
    const p1 = particle(system, index);
    const rel1 = p1.vx - water.uOf(column);
    const particleChange = SG.get(kind) * SIGMA_W * A_P * (p1.vx - p0.vx);
    const columnChange = SIGMA_W * (water.momentum() - q0);
    return { particleChange, columnChange, rel0, rel1 };
}

for (const [label, kind] of [["I6", FLUID.LAVA], ["H3 (miel, #110)", FLUID.HONEY]]) test(`${label}: la reacción de la inmersión conserva la cantidad de movimiento y ninguna velocidad relativa se invierte (< 1e-6)`, (t) => {
    const scene = makeScene();
    const { water, immersion, system } = scene;
    for (let i = 0; i < water.N; i++) if (water.h[i] > 0) water.q[i] = 1.5 * water.h[i];
    const cases = [[-3, -5], [4, -5], [10, -8], [1.5, 0], [0, -3]];
    const columns = cases.map(([vx, vy], k) => {
        const x = 20.05 + k * 3;
        scene.spawn(kind, x, 1.5, vx, vy);
        return Math.floor(x / water.dx);
    });
    const before = cases.map((_, k) => ({ ...particle(system, k), rel: particle(system, k).vx - water.uOf(columns[k]) }));
    const q0 = water.momentum();
    immersion.step(DT);
    const after = cases.map((_, k) => ({ ...particle(system, k), rel: particle(system, k).vx - water.uOf(columns[k]) }));
    const particleChange = cases.reduce((sum, _, k) => sum + SG.get(kind) * SIGMA_W * A_P * (after[k].vx - before[k].vx), 0);
    const exchanged = cases.reduce((sum, _, k) => sum + SG.get(kind) * SIGMA_W * A_P * Math.abs(after[k].vx - before[k].vx), 0);
    const columnChange = SIGMA_W * (water.momentum() - q0);
    const relative = Math.abs(particleChange + columnChange) / exchanged;
    const ratios = cases.map((_, k) => (before[k].rel === 0 ? 1 : (after[k].rel * before[k].rel) / (before[k].rel * before[k].rel)));
    t.diagnostic(`${label} (agua de 3 m, corriente de 1,5 m/s, 5 partículas): |Δp partículas + Δp columnas| ${Math.abs(particleChange + columnChange).toExponential(2)} kg·m/s sobre ${exchanged.toFixed(3)} kg·m/s intercambiados (relativo ${relative.toExponential(2)}); cocientes rel_después/rel_antes ${ratios.map((r) => r.toFixed(3)).join(", ")}; tolerancia 1e-6, sin inversión (cociente ≥ 0); recortes por masa reducida ${immersion.stats.capped}`);
    assert.equal(immersion.count, cases.length);
    assert.ok(relative < 1e-6, `suma relativa ${relative}`);
    assert.ok(Math.min(...ratios) >= 0, `una velocidad relativa se invirtió: ${ratios}`);
    scene.dispose();
});
test("I6: el tope por masa reducida recorta el impulso sobre una columna delgada sin invertir la velocidad relativa", (t) => {
    const scene = makeScene();
    const { water } = scene;
    const column = Math.floor(5.05 / water.dx);
    water.h[column] = 0.05;
    const before = scene.immersion.stats.capped;
    const r = exchange(scene, FLUID.LAVA, 5.05, water.b[column] + 0.02, 6, 0, column);
    const massColumn = SIGMA_W * 0.05 * water.dx;
    const massParticle = SG.get(FLUID.LAVA) * SIGMA_W * A_P;
    const reduced = (massParticle * massColumn) / (massParticle + massColumn);
    const impulse = Math.abs(r.particleChange);
    t.diagnostic(`I6 (tope): columna de 0,05 m (${massColumn.toFixed(3)} kg) contra partícula de ${massParticle.toFixed(3)} kg; impulso ${impulse.toFixed(4)} kg·m/s contra m_red · |v_rel| = ${(reduced * Math.abs(r.rel0)).toFixed(4)}; v_rel ${r.rel0.toFixed(3)} → ${r.rel1.toFixed(6)} m/s; suma ${(r.particleChange + r.columnChange).toExponential(2)}; recortes ${scene.immersion.stats.capped - before}`);
    assert.ok(scene.immersion.stats.capped > before, "el tope se activó");
    assert.ok(impulse <= reduced * Math.abs(r.rel0) * (1 + 1e-6), "el impulso supera m_red · |v_rel|");
    assert.ok((r.rel1 * r.rel0) / (r.rel0 * r.rel0) >= -1e-6, `la velocidad relativa se invirtió: ${r.rel0} → ${r.rel1}`);
    assert.ok(Math.abs(r.particleChange + r.columnChange) / impulse < 1e-6);
    scene.dispose();
});

test("la lava no se absorbe (solo se frena) y lo miscible desaparece del sistema", () => {
    const scene = makeScene();
    scene.spawn(FLUID.LAVA, 28, 1.5);
    scene.spawn(FLUID.WATER, 24, 2.5);
    scene.immersion.step(DT);
    scene.store.afterStep();
    assert.equal(scene.immersion.count, 1);
    assert.equal(scene.immersion.stats.absorbed, 1);
    scene.step();
    assert.equal(scene.system.GetParticleCount(), 1, "queda solo la lava");
    scene.dispose();
});

test("una gota que cae al piso seco de una isla se absorbe como película", () => {
    const scene = makeScene();
    const column = Math.floor(5.05 / scene.water.dx);
    scene.spawn(FLUID.WATER, 5.05, 4.05);
    scene.immersion.step(DT);
    assert.equal(scene.immersion.stats.absorbed, 1);
    assert.ok(Math.abs(scene.water.h[column] - A_P / scene.water.dx) < 1e-3 * (A_P / scene.water.dx), `h ${scene.water.h[column]} contra A_p / dx ${A_P / scene.water.dx}`);
    scene.dispose();
});
