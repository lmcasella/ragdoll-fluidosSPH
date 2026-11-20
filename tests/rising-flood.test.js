/**
 * Inundación del ascenso infinito (#25, docs/design/16-ascenso.md §16.5): `RisingFlood` sobre el campo `ShallowWater`,
 * JS puro. C3 (costo con el nivel sin techo) y C7 (libro de masa del campo).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ShallowWater } from "../js/water.js";
import { RisingFlood } from "../js/flood.js";
import { CLIMB, halfWidth, stageOf } from "../js/climb.js";

const DT = 1 / 60;
const TARGET = 150;
const MEASURED = 600;

const FAST = { ...CLIMB, flood: { ...CLIMB.flood, speed: CLIMB.flood.speed * 10, perStage: CLIMB.flood.perStage * 10 } };

function bookError(water, initial) {
    const expected = initial + water.stats.sourced - water.stats.floorCut.volume;
    return Math.abs(water.volume() - expected) / expected;
}

function timeSteps(water, count) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < count; i++) water.step(DT);
    return Number(process.hrtime.bigint() - start) / 1e6 / count;
}

test("RisingFlood: el nivel y el fondo efectivo siguen la curva y el span sigue el ancho de la etapa", () => {
    const water = new ShallowWater();
    water.setStart({ surface: CLIMB.flood.surface });
    const flood = new RisingFlood(water);
    assert.equal(flood.level, -Infinity);
    let time = 0;
    for (let i = 0; i < 60 * 12; i++) {
        time += DT;
        flood.step(time, DT);
        water.step(DT);
    }
    assert.ok(flood.active);
    const expected = CLIMB.flood.surface + CLIMB.flood.speed * (12 - CLIMB.flood.start);
    assert.ok(Math.abs(flood.level - expected) < 0.01, `nivel ${flood.level}, esperado ${expected}`);
    assert.equal(flood.floor, 0);
    const half = halfWidth(stageOf(flood.level));
    assert.equal(water.i0, Math.round((28 - half) / water.dx));
    assert.equal(water.i1, Math.round((28 + half) / water.dx));
    flood.reset();
    assert.equal(flood.level, -Infinity);
    assert.equal(water.i0, 0);
    assert.equal(water.i1, water.N);
    assert.equal(water.stats.sourced, 0);
});

test("C3 y C7: con el nivel sin techo hasta 150 m el campo cuesta lo mismo y el libro de masa cierra", () => {
    const water = new ShallowWater();
    water.setStart({ surface: CLIMB.flood.surface });
    const flood = new RisingFlood(water, undefined, FAST);
    const initial = water.volume();
    let time = 0;
    let worst = 0;
    let minH = Infinity;
    const millis = [];
    const substeps = [];
    while (flood.eta < TARGET) {
        time += DT;
        flood.step(time, DT);
        const before = water.stats.substeps;
        const t0 = process.hrtime.bigint();
        water.step(DT);
        millis.push(Number(process.hrtime.bigint() - t0) / 1e6);
        substeps.push(water.stats.substeps - before);
        worst = Math.max(worst, bookError(water, initial));
        for (let i = water.i0; i < water.i1; i++) minH = Math.min(minH, water.h[i]);
    }
    const mean = (list) => list.slice(-MEASURED).reduce((a, b) => a + b, 0) / MEASURED;
    const sub = mean(substeps);
    const msRising = mean(millis);
    const steps = millis.length;
    const measured = Math.min(steps, MEASURED);
    const classic = new ShallowWater();
    for (let i = 0; i < classic.N; i++) classic.h[i] = Math.max(0, 15 - classic.b[i]);
    timeSteps(classic, 100);
    const msClassic = timeSteps(classic, MEASURED);

    console.log(
        `C3: ${steps} pasos hasta ${flood.eta.toFixed(1)} m, últimos ${measured}: subpasos medios ${sub.toFixed(2)}, capHits ${water.stats.capHits}, halvings ${water.stats.halvings}, min h ${minH.toExponential(2)}, ${msRising.toFixed(3)} ms/paso contra ${msClassic.toFixed(3)} ms/paso en Clásico con 15 m (razón ${(msRising / msClassic).toFixed(2)})`,
    );
    console.log(`C7: error relativo máximo del libro ${worst.toExponential(2)}, sourced ${water.stats.sourced.toFixed(1)} m², floorCut ${water.stats.floorCut.volume.toFixed(1)} m²`);
    assert.ok(measured >= MEASURED, `pasos medidos ${measured}`);
    assert.ok(sub <= 6, `subpasos medios ${sub}`);
    assert.equal(water.stats.capHits, 0);
    assert.equal(water.stats.halvings, 0);
    assert.ok(minH >= 0, `h mínima ${minH}`);
    assert.ok(msRising <= 1.5 * msClassic, `${msRising} ms contra ${msClassic} ms`);
    assert.ok(worst < 1e-6, `error del libro ${worst}`);
});
