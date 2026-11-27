/**
 * Numérica de `src/core/math/numeric.js` (#307) y azar de `src/core/math/random.js`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { solveNewton, solveBisection, minmod, sampleUniformGrid, piecewiseLinear } from "../src/core/math/numeric.js";
import { createSeededRandom, hashToUnit } from "../src/core/math/random.js";

const TOLERANCE = 1e-9;
const SAMPLE_COUNT = 1000;

test("solveNewton halla la raíz cuadrada de 2 y reusa el contexto", () => {
    const context = { target: 2 };
    const root = solveNewton((x, data) => (x * x - data.target) / (2 * x), 1, context, 1e-14, 50);
    assert.ok(Math.abs(root - Math.SQRT2) < TOLERANCE);
});

test("solveNewton corta en el tope de iteraciones", () => {
    let calls = 0;
    solveNewton(() => {
        calls++;
        return 1;
    }, 0, null, 1e-14, 7);
    assert.equal(calls, 7);
});

test("solveBisection invierte una función creciente", () => {
    const cube = (x) => x * x * x;
    const root = solveBisection(cube, 8, null, 0, 10, 60);
    assert.ok(Math.abs(root - 2) < TOLERANCE);
});

test("minmod elige la pendiente menor o cero si cambian de signo", () => {
    assert.equal(minmod(1, 3), 1);
    assert.equal(minmod(-4, -2), -2);
    assert.equal(minmod(1, -1), 0);
    assert.equal(minmod(0, 5), 0);
});

test("sampleUniformGrid interpola entre centros de celda y no extrapola", () => {
    const values = [0, 10, 20, 30];
    const valueAt = (index) => values[index];
    assert.equal(sampleUniformGrid(1.5, 0, 1, 0, 3, valueAt), 10);
    assert.equal(sampleUniformGrid(2, 0, 1, 0, 3, valueAt), 15);
    assert.equal(sampleUniformGrid(-5, 0, 1, 0, 3, valueAt), 0);
    assert.equal(sampleUniformGrid(99, 0, 1, 0, 3, valueAt), 30);
});

test("piecewiseLinear interpola por canal y se queda en los extremos", () => {
    const stops = [
        [0, [0, 100]],
        [10, [100, 0]],
        [20, [100, 50]],
    ];
    const out = [0, 0];
    assert.deepEqual(piecewiseLinear(stops, -5, out), [0, 100]);
    assert.deepEqual(piecewiseLinear(stops, 5, out), [50, 50]);
    assert.deepEqual(piecewiseLinear(stops, 10, out), [100, 0]);
    assert.deepEqual(piecewiseLinear(stops, 15, out), [100, 25]);
    assert.deepEqual(piecewiseLinear(stops, 99, out), [100, 50]);
    assert.equal(piecewiseLinear(stops, 5, out), out);
});

test("createSeededRandom repite la secuencia con la misma semilla y queda en [0, 1)", () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);
    const other = createSeededRandom(43);
    let differs = false;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
        const value = first();
        assert.equal(value, second());
        assert.ok(value >= 0 && value < 1);
        if (value !== other()) differs = true;
    }
    assert.ok(differs, "otra semilla da otra secuencia");
});

test("createSeededRandom da los valores de referencia de mulberry32", () => {
    const random = createSeededRandom(1);
    assert.equal(random(), 0.6270739405881613);
    assert.equal(random(), 0.002735721180215478);
});

test("hashToUnit es determinista y queda en [0, 1)", () => {
    for (let seed = 0; seed < SAMPLE_COUNT; seed++) {
        const value = hashToUnit(seed);
        assert.equal(value, hashToUnit(seed));
        assert.ok(value >= 0 && value < 1);
    }
    assert.notEqual(hashToUnit(1), hashToUnit(2));
});
