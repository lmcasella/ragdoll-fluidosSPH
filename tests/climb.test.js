/**
 * Ascenso infinito (#25, docs/design/16-ascenso.md). C1: invariantes del generador sobre 50 semillas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIMB, ClimbGenerator, baseSolids, halfWidth, reachable, seamHeights, stageOf, stageWalls } from "../js/climb.js";
import { LEVEL } from "../js/level.js";
import { FLUID } from "../js/weapons.js";

const TOP = 400;
const RADIUS = 0.06;
const SEAMS = seamHeights(RADIUS, 0, 1000);

function rowsUntil(seed, top = TOP) {
    const generator = new ClimbGenerator(seed);
    const rows = [];
    do rows.push(generator.next());
    while (rows[rows.length - 1].y < top);
    return rows;
}

const nodeOf = (p, y) => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, top: y });
const basePlatforms = () => baseSolids().filter((s) => s.kind === "platform").map((s) => ({ x: s.x, w: s.w, y: s.y + s.h / 2 }));

test("costuras: la primera está en 245,76 m y se repiten cada 491,52 m", () => {
    assert.ok(Math.abs(SEAMS[0] - 245.76) < 1e-3, `primera costura ${SEAMS[0]}`);
    assert.ok(Math.abs(SEAMS[1] - 737.28) < 1e-3, `segunda costura ${SEAMS[1]}`);
});

test("C1: el generador cumple el invariante de alcance en 50 semillas hasta 400 m", () => {
    const violations = [];
    let rowCount = 0;
    let fallbacks = 0;
    let lowered = 0;
    for (let seed = 1; seed <= 50; seed++) {
        const rows = rowsUntil(seed);
        let previous = { y: 7.8, platforms: basePlatforms() };
        const inStage = new Map();
        for (const row of rows) {
            rowCount++;
            const where = `semilla ${seed} fila ${row.index}`;
            const half = halfWidth(stageOf(row.y + CLIMB.rows.transition));
            const dy = row.y - previous.y;
            const nearSeam = SEAMS.some((s) => Math.abs(row.y - (s - CLIMB.seamMargin)) < 1e-9);
            if (nearSeam) lowered++;
            if (dy > CLIMB.rows.gap[1] + 1e-9 || dy < (nearSeam ? 1.7 : CLIMB.rows.gap[0]) - 1e-9) violations.push(`${where}: dy ${dy}`);
            if (row.stage !== stageOf(row.y)) violations.push(`${where}: etapa`);
            if (row.platforms.length < 2 || row.platforms.length > 4) violations.push(`${where}: cantidad ${row.platforms.length}`);
            if (row.platforms.length === 2 && row.platforms[0].w === 3 && row.platforms[1].w === 3) fallbacks++;
            for (const p of row.platforms) {
                if (Math.abs(p.x - CLIMB.centerX) + p.w / 2 > half + 1e-9) violations.push(`${where}: fuera de las paredes`);
                if (p.w < CLIMB.rows.width[0] - 1e-9 || p.w > CLIMB.rows.width[1] + 1e-9) violations.push(`${where}: ancho ${p.w}`);
                if (!previous.platforms.some((q) => reachable(nodeOf(q, q.y ?? previous.y), nodeOf(p, row.y)))) violations.push(`${where}: inalcanzable`);
                const mirror = row.platforms.find((q) => Math.abs(q.x - (2 * CLIMB.centerX - p.x)) < 1e-9 && Math.abs(q.w - p.w) < 1e-9);
                if (!mirror) violations.push(`${where}: sin espejo`);
            }
            const sorted = [...row.platforms].sort((a, b) => a.x - b.x);
            for (let i = 1; i < sorted.length; i++) {
                const gap = sorted[i].x - sorted[i].w / 2 - (sorted[i - 1].x + sorted[i - 1].w / 2);
                if (gap < CLIMB.rows.separation - 1e-9) violations.push(`${where}: separación ${gap}`);
            }
            for (const seam of SEAMS) {
                if (row.y > seam - CLIMB.seamMargin + 1e-9 && row.y - CLIMB.rows.thickness < seam + CLIMB.seamMargin) violations.push(`${where}: costura ${seam}`);
            }
            const index = inStage.get(row.stage) ?? 0;
            inStage.set(row.stage, index + 1);
            const entry = CLIMB.pickups[Math.min(row.stage - 1, CLIMB.pickups.length - 1)];
            const expected = row.stage >= 1 && index % entry.period === 0;
            if (row.pickups.length !== (expected ? 2 : 0)) {
                violations.push(`${where}: armas ${row.pickups.length}, esperadas ${expected ? 2 : 0}`);
            } else if (expected) {
                const [a, b] = row.pickups;
                const outer = Math.max(...row.platforms.map((p) => Math.abs(p.x - CLIMB.centerX)));
                const allowed = Object.keys(entry.weights).map((name) => FLUID[name]);
                if (a.weapon !== b.weapon || !allowed.includes(a.weapon)) violations.push(`${where}: arma ${a.weapon}/${b.weapon}`);
                if (Math.abs(a.x + b.x - 2 * CLIMB.centerX) > 1e-9 || Math.abs(Math.abs(a.x - CLIMB.centerX) - outer) > 1e-9) violations.push(`${where}: lugar de las armas`);
                if (Math.abs(a.y - (row.y + CLIMB.pickupLift)) > 1e-9) violations.push(`${where}: altura de las armas`);
            }
            previous = row;
        }
    }
    for (let n = 0; n <= 14; n++) {
        for (const wall of stageWalls(n)) {
            for (const seam of SEAMS) {
                if (wall.y - wall.h / 2 < seam - 1e-9 && wall.y + wall.h / 2 > seam + 1e-9) violations.push(`pared de la etapa ${n} cruza la costura ${seam}`);
            }
        }
    }
    console.log(`C1: ${rowCount} filas en 50 semillas, ${lowered} bajadas por costura, ${fallbacks} filas de dos plataformas de ancho 3, ${violations.length} violaciones`);
    assert.deepEqual(violations.slice(0, 5), []);
});

test("C1: la misma semilla da las mismas filas y otra semilla da otras", () => {
    assert.deepEqual(rowsUntil(7, 120), rowsUntil(7, 120));
    assert.notDeepEqual(rowsUntil(7, 120), rowsUntil(8, 120));
});

test("C1: la base de Infinito son las plataformas del clásico con tope ≤ 8 m y la primera fila queda sobre el rayo de aparición", () => {
    const base = basePlatforms();
    assert.equal(base.length, 5);
    assert.ok(base.every((p) => p.y <= CLIMB.baseMaxTop));
    assert.ok(LEVEL.solids.some((s) => s.kind === "platform" && s.y + s.h / 2 > CLIMB.baseMaxTop), "el clásico conserva las altas");
    assert.ok(baseSolids().every((s) => s.kind !== "wall"));
    const [first] = rowsUntil(1, 20);
    assert.ok(first.y - CLIMB.rows.thickness >= CLIMB.spawnRayTop + 0.7 - 1e-9, `cara inferior ${first.y - CLIMB.rows.thickness}`);
    assert.equal(first.pickups.length, 0, "la etapa 0 no lleva armas generadas");
});

test("paredes: la etapa 0 queda en x = 0 y 56 como el clásico y cada una se angosta 6 m", () => {
    const [left, right] = stageWalls(0);
    assert.equal(left.x + left.w / 2, 0);
    assert.equal(right.x - right.w / 2, 56);
    const next = stageWalls(1);
    assert.equal(next[0].x + next[0].w / 2, 3);
    assert.equal(stageWalls(10)[0].x + stageWalls(10)[0].w / 2, 16);
});
