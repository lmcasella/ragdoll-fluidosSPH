import { test } from "node:test";
import assert from "node:assert/strict";
import { thermalScene } from "./helpers/thermal-bench.js";
import { THERMAL } from "../js/thermal.js";
import { FLUID } from "../js/weapons.js";

/** Cuenta las partículas vivas del material `kind`. */
function count(scene, kind) {
    let n = 0;
    for (let k = 0; k < scene.store.capacity; k++) if (scene.store.alive[k] && scene.store.kind[k] === kind) n++;
    return n;
}

test("#186: lava sola en el aire con tiempo de juego se vuelve piedra en 8–12 s", () => {
    const scene = thermalScene({ points: [{ x: 5, y: 0.05, kind: FLUID.LAVA }], options: THERMAL.game });
    let t = null;
    for (let i = 0; i < 60 * 15 && t === null; i++) {
        scene.step();
        if (count(scene, FLUID.STONE) === 1) t = scene.time;
    }
    scene.dispose();
    assert.ok(t !== null && t >= 8 && t <= 12, `piedra a ${t} s`);
});

test("#186: agua sobre un charco de lava hierve al contacto y la superficie se vuelve piedra", () => {
    const d = 0.09;
    const points = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 10; c++) points.push({ x: 3.2 + c * d, y: 0.05 + r * d, kind: FLUID.LAVA });
    const scene = thermalScene({ points, walls: true, options: THERMAL.game });
    for (let i = 0; i < 30; i++) scene.step();
    let firstSteam = null;
    for (let i = 0; i < 60 * 3; i++) {
        if (i < 60 && i % 2 === 0) for (let c = 0; c < 2; c++) scene.create({ x: 3.6 + c * 0.2, y: 1.0, kind: FLUID.WATER });
        scene.step();
        if (firstSteam === null && scene.thermal.stats.boiled > 0) firstSteam = scene.time;
    }
    const stone = count(scene, FLUID.STONE);
    const boiled = scene.thermal.stats.boiled;
    scene.dispose();
    assert.ok(firstSteam !== null && firstSteam < 1, `primer vapor a ${firstSteam} s (el agua llega a ~0,9 s)`);
    assert.ok(stone >= 14, `piedra ${stone} de 20`);
    assert.ok(boiled >= 8, `agua hervida ${boiled}`);
});

test("#186: el vapor en el aire se disipa en 3–6 s", () => {
    const scene = thermalScene({ points: [{ x: 5, y: 3, kind: FLUID.STEAM }], options: THERMAL.game });
    let t = null;
    for (let i = 0; i < 60 * 10 && t === null; i++) {
        scene.step();
        if (count(scene, FLUID.STEAM) === 0) t = scene.time;
    }
    const humidity = scene.thermal.stats.humidity;
    scene.dispose();
    assert.ok(t !== null && t >= 3 && t <= 6, `desaparece a ${t} s`);
    assert.equal(humidity, 1);
});

test("#186: el vapor que toca un techo frío condensa y gotea", () => {
    const scene = thermalScene({ points: [{ x: 5, y: 2.6, kind: FLUID.STEAM }, { x: 5.2, y: 2.6, kind: FLUID.STEAM }], solids: [{ x: 5, y: 3.2, w: 4, h: 0.4 }], options: THERMAL.game });
    let t = null;
    for (let i = 0; i < 60 * 3; i++) {
        scene.step();
        if (t === null && count(scene, FLUID.WATER) > 0) t = scene.time;
    }
    const { condensed, humidity } = scene.thermal.stats;
    scene.dispose();
    assert.ok(t !== null && t < 1.5, `primera gota a ${t} s`);
    assert.equal(condensed, 2);
    assert.equal(humidity, 0);
});
