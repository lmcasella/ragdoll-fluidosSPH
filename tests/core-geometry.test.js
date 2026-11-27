/**
 * Geometría de `src/core/math/geometry.js` (#307): polígonos, recortes, intervalos y cajas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    polygonArea,
    polygonCentroid,
    clipPolygonByHalfPlane,
    clipSegmentToBand,
    intersectIntervals,
    subtractIntervals,
    mergeBounds,
} from "../src/core/math/geometry.js";

const TOLERANCE = 1e-12;
const SQUARE = Float64Array.of(0, 0, 2, 0, 2, 2, 0, 2);

test("polygonArea es positiva en sentido antihorario y negativa al revés", () => {
    assert.equal(polygonArea(SQUARE, 4), 4);
    assert.equal(polygonArea(Float64Array.of(0, 2, 2, 2, 2, 0, 0, 0), 4), -4);
});

test("polygonCentroid de un cuadrado es su centro y devuelve el área", () => {
    const out = { x: 0, y: 0, area: 0 };
    assert.equal(polygonCentroid(SQUARE, 4, out), out);
    assert.ok(Math.abs(out.x - 1) < TOLERANCE);
    assert.ok(Math.abs(out.y - 1) < TOLERANCE);
    assert.equal(out.area, 4);
});

test("polygonCentroid de un triángulo rectángulo está en un tercio de los catetos", () => {
    const out = { x: 0, y: 0, area: 0 };
    polygonCentroid(Float64Array.of(0, 0, 3, 0, 0, 3), 3, out);
    assert.ok(Math.abs(out.x - 1) < TOLERANCE);
    assert.ok(Math.abs(out.y - 1) < TOLERANCE);
});

test("clipPolygonByHalfPlane corta un cuadrado por la mitad", () => {
    const destination = new Float64Array(16);
    const count = clipPolygonByHalfPlane(SQUARE, 4, destination, 1, 0, 1);
    assert.equal(count, 4);
    assert.equal(polygonArea(destination, count), 2);
});

test("clipPolygonByHalfPlane deja entero lo que cae adentro y vacío lo que cae afuera", () => {
    const destination = new Float64Array(16);
    assert.equal(clipPolygonByHalfPlane(SQUARE, 4, destination, 1, 0, 5), 4);
    assert.equal(clipPolygonByHalfPlane(SQUARE, 4, destination, 1, 0, -1), 0);
});

test("clipSegmentToBand deja el tramo dentro de la banda, sea cual sea la dirección", () => {
    const forward = clipSegmentToBand({ from: 0, to: 1 }, 0, 10, 2, 5);
    assert.deepEqual(forward, { from: 0.2, to: 0.5 });
    const backward = clipSegmentToBand({ from: 0, to: 1 }, 10, -10, 2, 5);
    assert.ok(Math.abs(backward.from - 0.5) < TOLERANCE);
    assert.ok(Math.abs(backward.to - 0.8) < TOLERANCE);
});

test("clipSegmentToBand con un semiplano usa un borde infinito", () => {
    const rising = clipSegmentToBand({ from: 0, to: 1 }, 0, 4, -Infinity, 1);
    assert.deepEqual(rising, { from: 0, to: 0.25 });
    const falling = clipSegmentToBand({ from: 0, to: 1 }, 4, -4, -Infinity, 1);
    assert.deepEqual(falling, { from: 0.75, to: 1 });
});

test("intersectIntervals recorta y descarta los vacíos", () => {
    assert.deepEqual(intersectIntervals([[0, 4], [6, 9], [12, 14]], 3, 10), [[3, 4], [6, 9]]);
});

test("subtractIntervals parte, recorta y conserva", () => {
    assert.deepEqual(subtractIntervals([[0, 10]], 4, 6), [[0, 4], [6, 10]]);
    assert.deepEqual(subtractIntervals([[0, 10]], -1, 3), [[3, 10]]);
    assert.deepEqual(subtractIntervals([[0, 10]], 11, 12), [[0, 10]]);
    assert.deepEqual(subtractIntervals([[2, 3]], 0, 10), []);
});

test("mergeBounds agranda la caja en el lugar", () => {
    const target = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    mergeBounds(target, { minX: 1, minY: 2, maxX: 3, maxY: 4 });
    assert.equal(mergeBounds(target, { minX: 0, minY: 3, maxX: 2, maxY: 9 }), target);
    assert.deepEqual(target, { minX: 0, minY: 2, maxX: 3, maxY: 9 });
});
