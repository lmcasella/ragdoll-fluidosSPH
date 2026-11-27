/**
 * Azar de `src/core/math/random.js` (#307).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeededRandom, hashToUnit } from "../src/core/math/random.js";

const SAMPLE_COUNT = 1000;
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
