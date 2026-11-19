/**
 * Ascenso infinito natural (#169, docs/design/16-ascenso.md §16.3): invariantes y variedad del generador por ramas
 * sobre 50 semillas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClimbGenerator, CLIMB, halfWidth, stageOf } from "../js/climb.js";
import { FLUID } from "../js/weapons.js";

const TOP = 300;
const B = CLIMB.branches;

function run(seed, top = TOP) {
    const generator = new ClimbGenerator(seed);
    const list = [];
    do list.push(generator.next());
    while (list[list.length - 1].y < top);
    return { generator, list };
}

const rect = (p) => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, top: p.y });

test("la base de la etapa 0 son de 3 a 5 plataformas anchas entre 4 y 7 m, repartidas por el ancho", () => {
    for (let seed = 1; seed <= 50; seed++) {
        const { base } = new ClimbGenerator(seed);
        assert.ok(base.length >= 3 && base.length <= 5, `semilla ${seed}: ${base.length}`);
        for (const p of base) {
            assert.ok(p.y >= 4 && p.y <= 7, `tope ${p.y}`);
            assert.ok(p.w >= 3.2 && p.w <= 9, `ancho ${p.w}`);
            assert.ok(Math.abs(p.x - CLIMB.centerX) + p.w / 2 <= 28 + 1e-9);
        }
        const sorted = [...base].sort((a, b) => a.x - b.x);
        for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].x - sorted[i].w / 2 - (sorted[i - 1].x + sorted[i - 1].w / 2) >= B.separation - 1e-9);
    }
});

test("invariante de alcance en 50 semillas hasta 300 m: cada plataforma tiene un apoyo con solapamiento >= 1,5 m y dy <= 3,3 m, y nada se pisa", () => {
    const violations = [];
    let count = 0;
    let fallbacks = 0;
    let relaxed = 0;
    for (let seed = 1; seed <= 50; seed++) {
        const { generator, list } = run(seed);
        fallbacks += generator.fallbacks;
        relaxed += generator.relaxed;
        const all = [...generator.base.map((p) => ({ ...p, index: -1 })), ...list];
        list.forEach((p) => {
            count++;
            const where = `semilla ${seed} plataforma ${p.index}`;
            const half = halfWidth(stageOf(p.y + B.transition));
            if (Math.abs(p.x - CLIMB.centerX) + p.w / 2 > half + 1e-9) violations.push(`${where}: fuera de las paredes`);
            const supported = all.some((q) => {
                const dy = p.y - q.y;
                const overlap = Math.min(q.x + q.w / 2, p.x + p.w / 2) - Math.max(q.x - q.w / 2, p.x - p.w / 2);
                return q !== p && dy >= B.dy[0] - 1e-9 && dy <= B.dy[1] + 1e-9 && overlap >= B.overlap - 1e-9;
            });
            if (!supported) violations.push(`${where}: sin apoyo`);
            for (const q of all) {
                if (q === p) continue;
                const shared = Math.min(q.x + q.w / 2, p.x + p.w / 2) - Math.max(q.x - q.w / 2, p.x - p.w / 2);
                const apart = Math.abs(p.y - q.y);
                if (shared > 0 && apart < B.air - 1e-9) violations.push(`${where}: aire ${apart.toFixed(2)} con otra`);
                if (shared <= 0 && apart <= B.sameHeight && -shared < B.separation - 1e-9) violations.push(`${where}: separación ${(-shared).toFixed(2)}`);
            }
        });
    }
    console.log(`alcance: ${count} plataformas en 50 semillas, ${fallbacks} de respaldo, ${relaxed} sin cupo de tramo, ${violations.length} violaciones`);
    assert.deepEqual(violations.slice(0, 5), []);
    assert.equal(fallbacks, 0);
    assert.ok(relaxed <= count / 1000, `sin cupo de tramo: ${relaxed}`);
});

test("variedad en 50 semillas: de 3 a 7 plataformas por tramo de 10 m y desviación de alturas > 0,5 m en tramos de 3 m", () => {
    const bad = [];
    const spreads = [];
    for (let seed = 1; seed <= 50; seed++) {
        const { generator, list } = run(seed);
        const counts = new Map();
        const slabs = new Map();
        for (const p of [...generator.base.map((b) => ({ y: b.y })), ...list]) {
            const k = Math.floor(p.y / B.tract);
            counts.set(k, (counts.get(k) ?? 0) + 1);
            const s = Math.floor(p.y / 3);
            slabs.set(s, [...(slabs.get(s) ?? []), p.y]);
        }
        const last = Math.max(...counts.keys());
        for (const [k, n] of counts) if (k < last && (n < B.density[0] || n > B.density[1])) bad.push(`semilla ${seed} tramo ${k}: ${n}`);
        for (const tops of slabs.values()) {
            if (tops.length < 2) continue;
            const mean = tops.reduce((a, b) => a + b, 0) / tops.length;
            spreads.push(Math.sqrt(tops.reduce((a, b) => a + (b - mean) ** 2, 0) / tops.length));
        }
    }
    const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    console.log(`variedad: desviación media de alturas en tramos de 3 m ${mean.toFixed(2)} m (${spreads.length} tramos con 2 o más)`);
    assert.deepEqual(bad.slice(0, 5), []);
    assert.ok(mean > 0.5, `desviación ${mean}`);
});

test("el ancho medio baja con la etapa: de [5, 9] en la 0 a [2, 4] desde la 5", () => {
    const sums = new Map();
    for (let seed = 1; seed <= 50; seed++) {
        for (const p of run(seed, 150).list) {
            const entry = sums.get(p.stage) ?? { total: 0, count: 0 };
            entry.total += p.w;
            entry.count++;
            sums.set(p.stage, entry);
        }
    }
    const mean = (n) => sums.get(n).total / sums.get(n).count;
    const table = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${n}: ${mean(n).toFixed(2)}`);
    console.log(`ancho medio por etapa: ${table.join(", ")}`);
    for (let n = 1; n <= 5; n++) assert.ok(mean(n) < mean(n - 1), `etapa ${n}`);
    for (let n = 0; n <= 9; n++) {
        const [lo, hi] = [5 + (2 - 5) * Math.min(n, 5) / 5, 9 + (4 - 9) * Math.min(n, 5) / 5];
        const nominal = (lo + hi) / 2;
        assert.ok(Math.abs(mean(n) - nominal) < 0.35 * nominal, `etapa ${n}: ${mean(n)} contra ${nominal}`);
    }
    assert.ok(mean(5) >= 2 && mean(9) <= 4.5);
});

test("armas: ninguna en la etapa 0 y una por plataforma cada period de la etapa, de weights; misma semilla, mismas plataformas", () => {
    const { list } = run(3, 200);
    const seen = new Map();
    for (const p of list) {
        if (p.stage < 1) {
            assert.equal(p.pickups.length, 0);
            continue;
        }
        const n = seen.get(p.stage) ?? 0;
        seen.set(p.stage, n + 1);
        const entry = CLIMB.pickups[Math.min(p.stage - 1, CLIMB.pickups.length - 1)];
        assert.equal(p.pickups.length, n % entry.period === 0 ? 1 : 0);
        for (const w of p.pickups) {
            assert.ok(Object.keys(entry.weights).map((name) => FLUID[name]).includes(w.weapon));
            assert.equal(w.x, p.x);
            assert.ok(Math.abs(w.y - (p.y + CLIMB.pickupLift)) < 1e-9);
        }
    }
    assert.deepEqual(run(7, 120).list, run(7, 120).list);
    assert.notDeepEqual(run(7, 120).list, run(8, 120).list);
});
