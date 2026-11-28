/**
 * Geometría de plataformas de densidad (#346, docs/design/05-escenario.md §5.5): marching squares, Douglas-Peucker y
 * descomposición convexa de `src/core/math/`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const { contoursOfGrid } = await import("../src/core/math/marchingSquares.js");
const { simplifyRing } = await import("../src/core/math/polygonSimplify.js");
const { decomposeConvex } = await import("../src/core/math/convexDecomposition.js");
const { polygonArea } = await import("../src/core/math/geometry.js");
const { createSeededRandom } = await import("../src/core/math/random.js");

const MICROMETER = 1e-6;
const AREA_TOLERANCE = 0.001;
const BOX2D_MAX_VERTICES = 8;
const NO_MINIMUM_AREA = 0;
const MERGE_BUDGET_MILLISECONDS = 5;
const CORRODED_GRID_TOLERANCE_CELLS = 0.5;
const CORRODED_GRID_PIECES_BEFORE = 101;
const CORRODED_GRID_PATH = new URL("./fixtures/corroded-platform-grid.json", import.meta.url);

function filledGrid(columns, rows, cellWidth, cellHeight) {
    return { values: new Float32Array(columns * rows).fill(1), columns, rows, cellWidth, cellHeight };
}

function ringArea(ring) {
    return polygonArea(ring, ring.length / 2);
}

function boundsOf(ring) {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (let index = 0; index < ring.length; index += 2) {
        bounds.minX = Math.min(bounds.minX, ring[index]);
        bounds.maxX = Math.max(bounds.maxX, ring[index]);
        bounds.minY = Math.min(bounds.minY, ring[index + 1]);
        bounds.maxY = Math.max(bounds.maxY, ring[index + 1]);
    }
    return bounds;
}

function isConvex(ring) {
    const count = ring.length / 2;
    for (let index = 0; index < count; index++) {
        const previous = (index + count - 1) % count;
        const next = (index + 1) % count;
        const turn = (ring[2 * index] - ring[2 * previous]) * (ring[2 * next + 1] - ring[2 * previous + 1]) - (ring[2 * index + 1] - ring[2 * previous + 1]) * (ring[2 * next] - ring[2 * previous]);
        if (turn < -MICROMETER * MICROMETER) return false;
    }
    return true;
}

function totalArea(pieces) {
    return pieces.reduce((sum, piece) => sum + ringArea(piece), 0);
}

test("marching squares: una grilla llena da un rectángulo exacto en el borde de la grilla", () => {
    const columns = 240;
    const rows = 8;
    const width = 12;
    const height = 0.4;
    const rings = contoursOfGrid(filledGrid(columns, rows, width / columns, height / rows));
    assert.equal(rings.length, 1);
    const bounds = boundsOf(rings[0]);
    assert.ok(Math.abs(bounds.minX) < MICROMETER && Math.abs(bounds.minY) < MICROMETER);
    assert.ok(Math.abs(bounds.maxX - width) < MICROMETER && Math.abs(bounds.maxY - height) < MICROMETER);
    assert.ok(Math.abs(ringArea(rings[0]) - width * height) < MICROMETER);
});

test("marching squares: celdas no cuadradas respetan cada tamaño de celda", () => {
    const rings = contoursOfGrid(filledGrid(3, 2, 0.5, 0.125));
    const bounds = boundsOf(rings[0]);
    assert.ok(Math.abs(bounds.maxX - 1.5) < MICROMETER);
    assert.ok(Math.abs(bounds.maxY - 0.25) < MICROMETER);
});

test("marching squares: un hueco da el externo antihorario y un agujero horario", () => {
    const grid = filledGrid(10, 10, 1, 1);
    grid.values[5 * 10 + 5] = 0;
    grid.values[5 * 10 + 6] = 0;
    const rings = contoursOfGrid(grid);
    assert.equal(rings.length, 2);
    const areas = rings.map(ringArea).sort((first, second) => first - second);
    assert.ok(areas[0] < 0 && areas[1] > 0);
    assert.ok(Math.abs(areas[1] - 100) < MICROMETER);
    assert.ok(Math.abs(areas[0] + 1.5) < MICROMETER);
});

test("marching squares: la silla une las esquinas llenas y no deja anillos que se tocan en un punto", () => {
    const grid = { values: [1, 0, 0, 1], columns: 2, rows: 2, cellWidth: 1, cellHeight: 1 };
    const rings = contoursOfGrid(grid);
    assert.equal(rings.length, 1);
    assert.ok(ringArea(rings[0]) > 0);
});

test("marching squares: la interpolación lineal ubica el borde dentro de la celda", () => {
    const grid = { values: [1, 1, 0.75, 0], columns: 4, rows: 1, cellWidth: 1, cellHeight: 1 };
    const bounds = boundsOf(contoursOfGrid(grid)[0]);
    assert.ok(Math.abs(bounds.maxX - 2.9) < 0.15);
});

test("Douglas-Peucker: un rectángulo lleno queda en 4 vértices", () => {
    const ring = contoursOfGrid(filledGrid(240, 8, 0.05, 0.05))[0];
    assert.ok(ring.length / 2 > 4);
    const simplified = simplifyRing(ring, 0.025);
    assert.equal(simplified.length / 2, 4);
    assert.ok(ringArea(simplified) > 0);
});

test("Douglas-Peucker: respeta la tolerancia", () => {
    const bump = [0, 0, 2, 0, 2, 1, 1, 1.1, 0, 1];
    assert.equal(simplifyRing(bump, 0.2).length / 2, 4);
    assert.equal(simplifyRing(bump, 0.05).length / 2, 5);
});

test("descomposición: un rectángulo da una sola pieza de 4 vértices", () => {
    const rectangle = [0, 0, 12, 0, 12, 0.4, 0, 0.4];
    const pieces = decomposeConvex(rectangle, [], { maxVertices: BOX2D_MAX_VERTICES, minArea: NO_MINIMUM_AREA });
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0].length / 2, 4);
});

test("descomposición: un polígono en L da piezas convexas que suman su área", () => {
    const lShape = [0, 0, 4, 0, 4, 1, 1, 1, 1, 4, 0, 4];
    const pieces = decomposeConvex(lShape, [], { maxVertices: BOX2D_MAX_VERTICES, minArea: NO_MINIMUM_AREA });
    assert.ok(pieces.length >= 2);
    assert.ok(pieces.every((piece) => piece.length / 2 <= BOX2D_MAX_VERTICES));
    assert.ok(Math.abs(totalArea(pieces) - 7) / 7 < AREA_TOLERANCE);
});

test("descomposición: un polígono con agujero da piezas convexas que suman su área", () => {
    const outer = [0, 0, 10, 0, 10, 4, 0, 4];
    const hole = [3, 1, 3, 3, 7, 3, 7, 1];
    const pieces = decomposeConvex(outer, [hole], { maxVertices: BOX2D_MAX_VERTICES, minArea: NO_MINIMUM_AREA });
    const expected = 40 - 8;
    assert.ok(pieces.every((piece) => piece.length / 2 <= BOX2D_MAX_VERTICES && ringArea(piece) > 0));
    assert.ok(Math.abs(totalArea(pieces) - expected) / expected < AREA_TOLERANCE);
});

test("descomposición: el contorno de una grilla con hueco, simplificado, se parte sin perder área", () => {
    const grid = filledGrid(60, 8, 0.2, 0.05);
    for (let row = 2; row < 6; row++) {
        for (let column = 20; column < 30; column++) grid.values[row * 60 + column] = 0;
    }
    const rings = contoursOfGrid(grid).map((ring) => simplifyRing(ring, 0.025));
    const outer = rings.find((ring) => ringArea(ring) > 0);
    const holes = rings.filter((ring) => ringArea(ring) < 0);
    const pieces = decomposeConvex(outer, holes, { maxVertices: BOX2D_MAX_VERTICES, minArea: NO_MINIMUM_AREA });
    const expected = rings.reduce((sum, ring) => sum + ringArea(ring), 0);
    assert.ok(Math.abs(totalArea(pieces) - expected) / expected < AREA_TOLERANCE);
});

test("descomposición: descarta las piezas de área menor al mínimo", () => {
    const rectangle = [0, 0, 1, 0, 1, 1, 0, 1];
    assert.equal(decomposeConvex(rectangle, [], { maxVertices: BOX2D_MAX_VERTICES, minArea: 2 }).length, 0);
});

test("descomposición: grillas con huecos al azar dan piezas convexas de hasta 8 vértices que suman el área", () => {
    const columns = 80;
    const rows = 8;
    const seeds = 25;
    for (let seed = 1; seed <= seeds; seed++) {
        const random = createSeededRandom(seed);
        const grid = filledGrid(columns, rows, 0.15, 0.05);
        for (let hole = 0; hole < 6; hole++) {
            const firstColumn = Math.floor(random() * (columns - 6));
            const firstRow = Math.floor(random() * (rows - 2));
            const holeColumns = 1 + Math.floor(random() * 5);
            const holeRows = 1 + Math.floor(random() * 3);
            for (let row = 0; row < holeRows; row++) {
                for (let column = 0; column < holeColumns; column++) grid.values[(firstRow + row) * columns + firstColumn + column] = 0;
            }
        }
        const rings = contoursOfGrid(grid).map((ring) => simplifyRing(ring, 0.025));
        const outers = rings.filter((ring) => ringArea(ring) > 0);
        if (outers.length !== 1) continue;
        const holes = rings.filter((ring) => ringArea(ring) < 0);
        const pieces = decomposeConvex(outers[0], holes, { maxVertices: BOX2D_MAX_VERTICES, minArea: NO_MINIMUM_AREA });
        const expected = rings.reduce((sum, ring) => sum + ringArea(ring), 0);
        assert.ok(Math.abs(totalArea(pieces) - expected) / expected < AREA_TOLERANCE, `semilla ${seed}`);
        assert.ok(pieces.every((piece) => piece.length / 2 <= BOX2D_MAX_VERTICES && isConvex(piece)), `semilla ${seed}`);
    }
});

test("descomposición: la plataforma central corroída por el ácido (251 triángulos) da piezas convexas, suma su área y no usa más piezas que la unión anterior", (t) => {
    const grid = JSON.parse(readFileSync(CORRODED_GRID_PATH, "utf8"));
    grid.values = Float32Array.from(grid.values);
    const tolerance = CORRODED_GRID_TOLERANCE_CELLS * Math.max(grid.cellWidth, grid.cellHeight);
    const outer = contoursOfGrid(grid).map((ring) => simplifyRing(ring, tolerance)).find((ring) => ringArea(ring) > 0);
    const started = performance.now();
    const pieces = decomposeConvex(outer, [], { maxVertices: BOX2D_MAX_VERTICES, minArea: NO_MINIMUM_AREA });
    const milliseconds = performance.now() - started;
    t.diagnostic(`plataforma corroída: ${pieces.length} piezas en ${milliseconds.toFixed(2)} ms`);
    const expected = ringArea(outer);
    assert.ok(Math.abs(totalArea(pieces) - expected) / expected < AREA_TOLERANCE);
    assert.ok(pieces.every((piece) => piece.length / 2 <= BOX2D_MAX_VERTICES && isConvex(piece)));
    assert.ok(pieces.length <= CORRODED_GRID_PIECES_BEFORE, `${pieces.length} piezas`);
    if (process.env.PERF === "1") assert.ok(milliseconds < MERGE_BUDGET_MILLISECONDS, `${milliseconds} ms`);
});