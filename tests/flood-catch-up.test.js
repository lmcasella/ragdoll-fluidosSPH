/**
 * Alcance de la inundación de Infinito (#271, docs/design/16-ascenso.md §16.5): el agua suma velocidad según la distancia
 * al robot vivo más bajo. Unitario sobre `RisingFlood` con un campo falso, y estabilidad del campo real a 4 m/s.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RisingFlood, supportHeight } from "../js/flood.js";
import { CLIMB, stageOf } from "../js/climb.js";
import { loadGame } from "./helpers/game.js";

const DT = 1 / 60;
const { catchUp } = CLIMB.flood;

function fakeWater() {
    return { setSpan() {}, raiseFloor() {}, rise() {}, reset() {} };
}

/** Corre la inundación `seconds` s de ronda (la curva empieza en `flood.start`) y devuelve la distancia final. */
function run(flood, seconds, lowest) {
    let time = 0;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
        time += DT;
        flood.step(time, DT);
        assert.ok(flood.eta < lowest(time), `el agua ${flood.eta} pasó al robot en ${lowest(time)}`);
    }
    return lowest(time) - flood.eta;
}

test("alcance: con d <= gap la velocidad es la de siempre", () => {
    for (const d of [-5, 0, 1, catchUp.gap]) {
        const flood = new RisingFlood(fakeWater(), undefined, undefined, () => 0, () => CLIMB.flood.surface + d);
        assert.equal(flood.riseSpeed, CLIMB.flood.speed + CLIMB.flood.perStage * stageOf(flood.eta));
    }
});

test("alcance: sin robots vivos la velocidad es la de siempre", () => {
    const flood = new RisingFlood(fakeWater(), undefined, undefined, () => 0, () => -Infinity);
    assert.equal(flood.riseSpeed, CLIMB.flood.speed + CLIMB.flood.perStage * stageOf(flood.eta));
    const sinArgumento = new RisingFlood(fakeWater());
    assert.equal(sinArgumento.riseSpeed, flood.riseSpeed);
});

test("alcance: crece con la distancia y se corta en max", () => {
    const base = CLIMB.flood.speed + CLIMB.flood.perStage * stageOf(CLIMB.flood.surface);
    const at = (d) => new RisingFlood(fakeWater(), undefined, undefined, () => 0, () => CLIMB.flood.surface + d).riseSpeed;
    assert.ok(Math.abs(at(catchUp.gap + 2) - (base + catchUp.rate * 2)) < 1e-9);
    assert.ok(Math.abs(at(1000) - (base + catchUp.max)) < 1e-9);
});

test("alcance: con un robot fijo 40 m sobre el agua, queda a <= gap + 0,5 m de sus pies en <= 20 s de ronda y nunca lo pasa", () => {
    const top = CLIMB.flood.surface + 40;
    const flood = new RisingFlood(fakeWater(), undefined, undefined, () => 0, () => top);
    const d = run(flood, 20, () => top);
    console.log(`robot fijo: a los 20 s de ronda el agua queda a ${d.toFixed(2)} m de sus pies`);
    assert.ok(d <= catchUp.gap + 0.5, `distancia ${d}`);
    assert.ok(d > 0);
});

test("alcance: con un robot que sube a 1 m/s, a los 30 s la distancia queda entre gap y gap + 2 m", () => {
    const start = CLIMB.flood.surface + 10;
    const lowest = (time) => start + time;
    const flood = new RisingFlood(fakeWater(), undefined, undefined, () => 0, () => lowest(flood.roundTime));
    const d = run(flood, 30, lowest);
    console.log(`robot a 1 m/s: a los 30 s la distancia es ${d.toFixed(2)} m`);
    assert.ok(d >= catchUp.gap && d <= catchUp.gap + 2, `distancia ${d}`);
});

test("altura de apoyo: apoyado es su punto más bajo; en el aire, un salto no cuenta y una caída sí", () => {
    assert.equal(supportHeight(true, 10, 4), 10);
    assert.equal(supportHeight(false, 12, 10), 10);
    assert.equal(supportHeight(false, 8, 10), 8);
    assert.equal(supportHeight(false, 7, undefined), 7);
});

test("altura de apoyo: un robot que salta no acelera el agua; uno que cae actualiza el apoyo en el mismo paso", () => {
    const base = CLIMB.flood.surface + 10;
    const robot = { grounded: true, low: base, last: undefined };
    const lowest = () => {
        robot.last = supportHeight(robot.grounded, robot.low, robot.last);
        return robot.last;
    };
    const flood = new RisingFlood(fakeWater(), undefined, undefined, () => 0, lowest);
    const speedAt = (low, grounded) => {
        robot.low = low;
        robot.grounded = grounded;
        return flood.riseSpeed;
    };
    const grounded = speedAt(base, true);
    const jumping = speedAt(base + 4, false);
    assert.equal(jumping, grounded);
    const falling = speedAt(base - 4, false);
    assert.equal(robot.last, base - 4);
    assert.ok(falling < grounded);
});

test("Infinito con LiquidFun real: el campo sube a 4 m/s varios segundos y queda estable", async () => {
    globalThis.location = { search: "?seed=1" };
    const game = await loadGame({ map: "infinite" });
    game.setPad(0);
    game.setPad(1);
    const { flood, water } = game.state;
    flood.lowestPlayer = () => flood.eta + 1000;
    const eta0 = flood.eta;
    let maxEta = eta0;
    let valid = true;
    for (let i = 0; i < 60 * 12; i++) {
        game.frames(1);
        maxEta = Math.max(maxEta, flood.eta);
        for (let k = water.i0; k < water.i1; k++) if (!Number.isFinite(water.h[k]) || water.h[k] < 0) valid = false;
    }
    console.log(`campo real: la superficie subió ${(maxEta - eta0).toFixed(1)} m, velocidad ${flood.riseSpeed.toFixed(2)} m/s`);
    assert.ok(flood.riseSpeed >= catchUp.max, `velocidad ${flood.riseSpeed}`);
    assert.ok(maxEta - eta0 > 10, `subió ${maxEta - eta0} m`);
    assert.ok(valid, "alturas no finitas o negativas");
    assert.ok(Number.isFinite(water.volume()));
});
