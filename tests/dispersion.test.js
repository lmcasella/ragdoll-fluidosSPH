/** Dispersión de las ondas cortas y oleaje residual del campo de alturas (#244, docs/design/14-agua.md §14.3 y §14.11), Node puro. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ShallowWater, WATER_FIELD, SWELL } from "../js/water.js";
import { seededRandom } from "../js/bot.js";
import { MATERIALS } from "../js/materials.js";

const G = 10;
const DT = 1 / 60;
const NU = MATERIALS.water.mu / 1000;

/** Tanque de `length` m entre paredes reflectivas con el piso en y = 0. */
function tank(length) {
    return {
        bounds: { minX: 0, maxX: length, minY: 0, maxY: 32 },
        solids: [{ x: length / 2, y: -0.5, w: length, h: 1, kind: "floor" }],
    };
}

/** Tanque de 20 m con agua de `depth` m y la superficie `shape(x)` (m sobre `depth`) a cada celda. */
function pool(depth, shape) {
    const water = new ShallowWater(tank(20), WATER_FIELD);
    for (let i = 0; i < water.N; i++) {
        water.h[i] = depth + shape(water.center(i));
        water.E[i] = water.h[i];
    }
    return water;
}

/** Cruces por cero de la serie `values` con interpolación lineal: devuelve los tiempos (s). */
function crossings(values) {
    const times = [];
    for (let s = 1; s < values.length; s++) {
        const a = values[s - 1];
        const b = values[s];
        if (a * b < 0) times.push((s - 1 + a / (a - b)) * DT);
    }
    return times;
}

test("a: un bulto gaussiano (a = 5 cm, σ = 0,3 m, h = 3 m) dispersa: cruces a 2 m, primer cruce en el centro y modo estacionario de 4 m", (t) => {
    const water = pool(3, (x) => 0.05 * Math.exp(-((x - 10) ** 2) / (2 * 0.3 ** 2)));
    const probe = [];
    const center = [];
    for (let s = 0; s < 300; s++) {
        water.step(DT);
        probe.push(water.depthAt(12) - 3);
        center.push(water.depthAt(10) - 3);
    }
    const probeCrossings = crossings(probe).length;
    const first = crossings(center)[0];

    const k = (10 * Math.PI) / 20;
    const mode = pool(3, (x) => 0.01 * Math.cos(k * x));
    const amplitude = () => {
        let sum = 0;
        for (let i = 0; i < mode.N; i++) sum += (mode.h[i] - 3) * Math.cos(k * mode.center(i));
        return (sum * mode.dx * 2) / 20;
    };
    const omega = Math.sqrt(G * k * Math.tanh(3 * k));
    let peak = 0;
    for (let s = 0; s < 1800; s++) {
        mode.step(DT);
        const a = amplitude();
        if (s >= 1800 - Math.ceil((2 * Math.PI) / omega / DT)) peak = Math.max(peak, Math.abs(a));
    }
    const expected = 0.01 * Math.exp(-2 * NU * k * k * 30);
    t.diagnostic(
        `a: ${probeCrossings} cruces en la sonda a 2 m en 5 s (esperados 7 ± 1); primer cruce en el centro a ${first.toFixed(4)} s (0,32 ± 0,02); ` +
            `amplitud del modo de 4 m a los 30 s ${peak.toExponential(4)} m, piso ${(0.99 * expected).toExponential(4)} m`,
    );
    assert.ok(Math.abs(probeCrossings - 7) <= 1, `cruces ${probeCrossings}`);
    assert.ok(Math.abs(first - 0.32) <= 0.02, `primer cruce ${first}`);
    assert.ok(peak >= 0.99 * expected, `amplitud ${peak} < ${0.99 * expected}`);
});

/** Período (s) de un modo estacionario de longitud de onda `lambda` en un tanque de 20 m con `depth` m: del tiempo entre cruces de su proyección. */
function modePeriod(depth, lambda) {
    const k = (2 * Math.PI) / lambda;
    const water = pool(depth, (x) => 0.01 * Math.cos(k * x));
    const airy = (2 * Math.PI) / Math.sqrt(G * k * Math.tanh(k * depth));
    const projection = [];
    for (let s = 0; s < Math.round((3.2 * airy) / DT); s++) {
        water.step(DT);
        let sum = 0;
        for (let i = 0; i < water.N; i++) sum += (water.h[i] - depth) * Math.cos(k * water.center(i));
        projection.push(sum);
    }
    const times = crossings(projection);
    return { measured: (2 * (times[times.length - 1] - times[0])) / (times.length - 1), airy };
}

test("b: el período de un modo estacionario coincide con Airy dentro de 2 % (h 3/λ 1, h 3/λ 4, h 1/λ 4)", (t) => {
    const cases = [
        [3, 1, 0.793],
        [3, 4, 1.585],
        [1, 4, 1.655],
    ];
    for (const [depth, lambda, expected] of cases) {
        const { measured } = modePeriod(depth, lambda);
        t.diagnostic(`b: h ${depth} m, λ ${lambda} m: período ${measured.toFixed(4)} s contra Airy ${expected} s (${((100 * (measured - expected)) / expected).toFixed(2)} %)`);
        assert.ok(Math.abs(measured - expected) / expected <= 0.02, `h ${depth} λ ${lambda}: ${measured}`);
    }
});

/** Desvío estándar (m) de la superficie de las celdas de `water` sobre `depth`. */
function sigmaOf(water, depth) {
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < water.N; i++) {
        const e = water.h[i] - depth;
        sum += e;
        sum2 += e * e;
    }
    const mean = sum / water.N;
    return Math.sqrt(sum2 / water.N - mean * mean);
}

test("c: el oleaje inicial tiene σ de 6 a 9 mm, se sostiene 30 s, conserva el volumen y depende de la semilla", (t) => {
    const make = (seed) => {
        const water = pool(3, () => 0);
        water.swell(seededRandom(seed));
        return water;
    };
    const water = make(7);
    const v0 = 3 * water.N * water.dx;
    const sigma0 = sigmaOf(water, 3);
    const drift = Math.abs(water.volume() - v0);
    let low = Infinity;
    let high = 0;
    for (let s = 0; s < 1800; s++) {
        water.step(DT);
        const sigma = sigmaOf(water, 3);
        low = Math.min(low, sigma);
        high = Math.max(high, sigma);
    }
    const same = make(7);
    const other = make(8);
    let diffSame = 0;
    let diffOther = 0;
    const again = make(7);
    for (let i = 0; i < same.N; i++) {
        diffSame = Math.max(diffSame, Math.abs(same.h[i] - again.h[i]));
        diffOther = Math.max(diffOther, Math.abs(same.h[i] - other.h[i]));
    }
    t.diagnostic(
        `c: σ(t=0) ${(1000 * sigma0).toFixed(2)} mm; σ en 30 s de ${(1000 * low).toFixed(2)} a ${(1000 * high).toFixed(2)} mm; |ΔΣh·dx| ${drift.toExponential(2)} m²; ` +
            `misma semilla ${diffSame.toExponential(1)} m, otra semilla ${diffOther.toExponential(2)} m (σ objetivo ${1000 * SWELL.sigma} mm)`,
    );
    assert.ok(sigma0 >= 0.006 && sigma0 <= 0.009, `σ0 ${sigma0}`);
    assert.ok(low >= 0.005 && high <= 0.009, `σ en 30 s ${low}..${high}`);
    assert.ok(drift <= 1e-12, `volumen ${drift}`);
    assert.equal(diffSame, 0);
    assert.ok(diffOther > 1e-4, `otra semilla ${diffOther}`);
});
