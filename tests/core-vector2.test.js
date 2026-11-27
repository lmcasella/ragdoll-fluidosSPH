/**
 * Vectores 2D de `src/core/math/vector2.js` (#307).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { vectorLength, distance, normalize, dot, cross, rotateLocalToWorld } from "../src/core/math/vector2.js";
import { QUARTER_TURN } from "../src/core/math/scalar.js";

const TOLERANCE = 1e-12;

test("vectorLength y distance miden con Pitágoras", () => {
    assert.equal(vectorLength(3, 4), 5);
    assert.equal(distance(1, 1, 4, 5), 5);
    assert.equal(distance(4, 5, 1, 1), 5);
});

test("normalize deja longitud 1 en el objeto de salida y no crea otro", () => {
    const out = { x: 0, y: 0 };
    assert.equal(normalize(3, 4, out), out);
    assert.equal(out.x, 0.6);
    assert.equal(out.y, 0.8);
});

test("normalize del vector nulo queda en el origen", () => {
    const out = { x: 9, y: 9 };
    normalize(0, 0, out);
    assert.equal(out.x, 0);
    assert.equal(out.y, 0);
});

test("dot y cross", () => {
    assert.equal(dot(1, 2, 3, 4), 11);
    assert.equal(dot(1, 0, 0, 1), 0);
    assert.equal(cross(1, 0, 0, 1), 1);
    assert.equal(cross(0, 1, 1, 0), -1);
});

test("rotateLocalToWorld gira y traslada", () => {
    const out = { x: 0, y: 0 };
    const result = rotateLocalToWorld(1, 0, Math.cos(QUARTER_TURN), Math.sin(QUARTER_TURN), 10, 20, out);
    assert.equal(result, out);
    assert.ok(Math.abs(out.x - 10) < TOLERANCE);
    assert.ok(Math.abs(out.y - 21) < TOLERANCE);
});

test("rotateLocalToWorld sin giro solo traslada", () => {
    const out = { x: 0, y: 0 };
    rotateLocalToWorld(2, 3, 1, 0, 5, 7, out);
    assert.deepEqual(out, { x: 7, y: 10 });
});
