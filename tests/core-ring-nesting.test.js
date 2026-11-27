/**
 * `src/core/math/ringNesting.js` (#346): punto dentro de polígono y reparto de agujeros entre contornos externos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pointInPolygon, assignHolesToOuters } from "../src/core/math/ringNesting.js";

const square = (minX, minY, size) => [minX, minY, minX + size, minY, minX + size, minY + size, minX, minY + size];
const reversed = (ring) => {
    const result = [];
    for (let index = ring.length - 2; index >= 0; index -= 2) result.push(ring[index], ring[index + 1]);
    return result;
};

test("pointInPolygon distingue dentro y fuera de un polígono cóncavo", () => {
    const lShape = [0, 0, 4, 0, 4, 1, 1, 1, 1, 4, 0, 4];
    assert.equal(pointInPolygon(0.5, 0.5, lShape), true);
    assert.equal(pointInPolygon(0.5, 3, lShape), true);
    assert.equal(pointInPolygon(3, 3, lShape), false, "en el hueco de la L");
    assert.equal(pointInPolygon(-1, 0.5, lShape), false);
    assert.equal(pointInPolygon(5, 0.5, lShape), false);
});

test("assignHolesToOuters reparte cada agujero al externo que lo contiene", () => {
    const left = square(0, 0, 10);
    const right = square(20, 0, 10);
    const leftHole = reversed(square(2, 2, 2));
    const rightHole = reversed(square(24, 4, 2));
    const holesByOuter = assignHolesToOuters([left, right], [rightHole, leftHole]);
    assert.deepEqual(holesByOuter, [[leftHole], [rightHole]]);
});

test("assignHolesToOuters da el agujero al externo más chico: una isla dentro de un agujero tiene sus propios agujeros", () => {
    const frame = square(0, 0, 100);
    const bigHole = reversed(square(10, 10, 80));
    const island = square(30, 30, 20);
    const islandHole = reversed(square(35, 35, 5));
    const holesByOuter = assignHolesToOuters([frame, island], [bigHole, islandHole]);
    assert.deepEqual(holesByOuter, [[bigHole], [islandHole]]);
});

test("assignHolesToOuters descarta un agujero que ningún externo contiene y no falla sin externos", () => {
    const stray = reversed(square(50, 50, 2));
    assert.deepEqual(assignHolesToOuters([square(0, 0, 10)], [stray]), [[]]);
    assert.deepEqual(assignHolesToOuters([], [stray]), []);
});
