/**
 * Vapor que sube, forma niebla y condensa (docs/design/14-agua.md §14.8 y 14.16 T5, T9; docs/design/15-quimica.md
 * fichas 7, 15, 22, 37 y 41; criterios V1 a V4 del issue #113): LiquidFun real, el campo de alturas, `Immersion` y
 * `Thermal` del juego con `stepWorld`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { thermalScene, DT } from "./helpers/thermal-bench.js";

const { FLUID } = await import("../src/combat/weapons.js");
const { SINK } = await import("../src/fluids/particleStore.js");
const { MATERIALS, SIGMA_W } = await import("../src/fluids/materials.js");

const fmt = (n, digits = 3) => Number(n).toFixed(digits);
const A_P = (1.5 * 0.06) ** 2;
const M_P = SIGMA_W * A_P;
const WATER = MATERIALS.water;
const STONE = MATERIALS.stone;
const L_V = WATER.latentVaporization;
const E_L = WATER.c * WATER.boilingPoint;
const E_V = E_L + L_V;
const CEILING = { x: 5, y: 0.75, w: 4, h: 1 };

const cavity = (points, options = {}) => thermalScene({ walls: true, solids: [CEILING], airLosses: false, points, ...options });

const heightOf = (s, i = 0) => s.positions()[i].y;
const quality = (s, slot = 1) => (s.store.enthalpy[slot] - E_L) / L_V;

test("V1: una parcela de vapor sobre agua a 20 °C de igual masa condensa ~15 % y el agua queda a 100 °C (ficha 7)", (t) => {
    const s = cavity([
        { x: 5, y: 0.06, kind: FLUID.WATER },
        { x: 5, y: 0.17, kind: FLUID.STEAM },
    ]);
    const { thermal, store } = s;
    const total0 = thermal.energy() + thermal.energyLost();
    for (let k = 0; k < Math.round(3 / DT); k++) s.step();
    const condensed = 1 - quality(s);
    const Twater = thermal.temperature(FLUID.WATER, store.enthalpy[0]);
    const expected = (WATER.c * 80) / L_V;
    const total1 = thermal.energy() + thermal.energyLost();
    t.diagnostic(
        `V1: condensó ${fmt(condensed * 100, 3)} % (ficha 7: ${fmt(expected * 100, 3)} %, c_p·80/L_v), agua a ${fmt(Twater, 3)} °C, vapor en y = ${fmt(heightOf(s, 1), 3)} m (techo en 0,25), deriva de energía ${((total1 - total0) / total0).toExponential(2)}, humedad ${thermal.stats.humidity}`,
    );
    assert.ok(Math.abs(condensed - 0.15) <= 0.05, `condensó ${condensed}`);
    assert.ok(Math.abs(condensed - expected) / expected <= 0.05, `condensó ${condensed} contra ${expected}`);
    assert.ok(Math.abs(Twater - 100) < 0.5, `agua a ${Twater} °C`);
    assert.equal(store.kind[1], FLUID.STEAM);
    assert.equal(thermal.stats.humidity, 0);
    assert.ok(Math.abs(total1 - total0) / total0 < 1e-9);
    s.dispose();
});

test("V1 en ácido: el vapor sobre ácido frío lo calienta hasta 100 °C y condensa lo mismo (ficha 22)", (t) => {
    const s = cavity([
        { x: 5, y: 0.06, kind: FLUID.ACID },
        { x: 5, y: 0.17, kind: FLUID.STEAM },
    ]);
    const { thermal, store } = s;
    for (let k = 0; k < Math.round(3 / DT); k++) s.step();
    const condensed = 1 - quality(s);
    const expected = (MATERIALS.acid.c * MATERIALS.acid.SG * 80) / L_V;
    const Tacid = thermal.temperature(FLUID.ACID, store.enthalpy[0]);
    t.diagnostic(`ácido: condensó ${fmt(condensed * 100, 3)} % (esperado ${fmt(expected * 100, 3)} %), ácido a ${fmt(Tacid, 3)} °C`);
    assert.ok(Math.abs(Tacid - 100) < 0.5);
    assert.ok(Math.abs(condensed - (MATERIALS.acid.c * 80) / L_V) / ((MATERIALS.acid.c * 80) / L_V) <= 0.05);
    s.dispose();
});

test("el vapor que llega a e_l con contacto de agua pasa a agua por la fila condense y no se disuelve", () => {
    const s = cavity([
        { x: 5, y: 0.06, kind: FLUID.WATER },
        { x: 5, y: 0.17, kind: FLUID.STEAM, enthalpy: E_L + 0.05 * L_V },
    ]);
    const { thermal, store } = s;
    const total0 = thermal.energy() + thermal.energyLost();
    for (let k = 0; k < 30; k++) s.step();
    assert.equal(store.kind[1], FLUID.WATER);
    assert.equal(thermal.stats.condensed, 1);
    assert.equal(thermal.stats.humidity, 0);
    assert.equal(store.destroyed[SINK.HUMIDITY][FLUID.STEAM], 0);
    assert.ok(Math.abs(thermal.energy() + thermal.energyLost() - total0) / total0 < 1e-9);
    s.dispose();
});

test("V3: el vapor sobre piedra fría condensa hasta que la piedra llega a 100 °C, con balance de energía ±5 % (ficha 37)", (t) => {
    const s = cavity([
        { x: 5, y: 0.06, kind: FLUID.STONE },
        { x: 5, y: 0.17, kind: FLUID.STEAM },
    ]);
    const { thermal, store } = s;
    const mass = thermal.mass[FLUID.STONE];
    const stone0 = mass * store.enthalpy[0];
    const steam0 = M_P * store.enthalpy[1];
    let seconds = 0;
    while (seconds < 400 && thermal.temperature(FLUID.STONE, store.enthalpy[0]) < 99.99) {
        s.step();
        seconds += DT;
    }
    const gained = mass * store.enthalpy[0] - stone0;
    const given = steam0 - M_P * store.enthalpy[1];
    const Tstone = thermal.temperature(FLUID.STONE, store.enthalpy[0]);
    const sensible = mass * STONE.c * 80;
    t.diagnostic(
        `V3: piedra de 20 a ${fmt(Tstone, 3)} °C en ${fmt(seconds, 1)} s; ganó ${fmt(gained / 1e3, 3)} kJ (calor sensible esperado ${fmt(sensible / 1e3, 3)} kJ) y el vapor cedió ${fmt(given / 1e3, 3)} kJ (${fmt(((given - gained) / gained) * 100, 4)} % de diferencia); condensó ${fmt((given / (M_P * L_V)) * 100, 3)} % de la parcela`,
    );
    assert.ok(Tstone >= 99.9 && Tstone <= 100 + 1e-6, `piedra a ${Tstone} °C`);
    assert.ok(Math.abs(gained - sensible) / sensible <= 0.05);
    assert.ok(Math.abs(given - gained) / gained <= 0.05);
    for (let k = 0; k < 300; k++) s.step();
    assert.ok(thermal.temperature(FLUID.STONE, store.enthalpy[0]) <= 100 + 1e-6, "la piedra pasó de 100 °C");
    s.dispose();
});

test("la piedra a 100 °C o más no intercambia con el vapor (se sobrecalienta, ficha 37)", () => {
    const s = cavity([
        { x: 5, y: 0.06, kind: FLUID.STONE, enthalpy: STONE.c * 150 },
        { x: 5, y: 0.17, kind: FLUID.STEAM },
    ]);
    const { store } = s;
    for (let k = 0; k < 120; k++) s.step();
    assert.equal(store.enthalpy[0], STONE.c * 150);
    assert.equal(store.enthalpy[1], E_V);
    s.dispose();
});

test("V2: el vapor sobre una columna a 100 °C no condensa, no se absorbe y no cambia de fase", () => {
    const s = thermalScene({ immersion: true, floor: { x: 28, y: -0.5, w: 56, h: 1 }, airLosses: false });
    const { water, thermal, store } = s;
    for (let i = 270; i <= 290; i++) water.E[i] = SIGMA_W * WATER.c * water.h[i] * 100;
    s.create({ x: 28.05, y: water.surfaceAt(28.05) + 0.03, kind: FLUID.STEAM });
    const y0 = heightOf(s);
    for (let k = 0; k < 60; k++) s.step();
    assert.equal(store.destroyed[SINK.ABSORBED][FLUID.STEAM], 0);
    assert.equal(thermal.stats.condensed, 0);
    assert.equal(store.enthalpy[0], E_V);
    assert.ok(heightOf(s) > y0 + 0.3);
    s.dispose();
});

/** Sube una parcela en aire quieto hasta que su título baja de `until` o se disuelve; devuelve altura y tiempo. */
function riseUntil(alpha, until) {
    const s = thermalScene({ points: [{ x: 5, y: 1, kind: FLUID.STEAM }] });
    s.thermal.entrainment = alpha;
    const y0 = 1;
    let steps = 0;
    while (steps < 40000 && s.store.alive[0] === 1 && quality(s, 0) > until) {
        s.step();
        steps++;
    }
    const y = s.store.alive[0] === 1 ? heightOf(s) : null;
    const out = { rise: y === null ? null : y - y0, seconds: steps * DT, R: s.thermal.plumeRadius, s };
    return out;
}

test("T9: la parcela de vapor llega a la mitad de su latente a la altura de Morton–Taylor–Turner con α = 0,10, dentro del rango de α = 0,07 a 0,13", (t) => {
    const at = {};
    for (const alpha of [0.07, 0.1, 0.13]) {
        at[alpha] = riseUntil(alpha, 0.5);
        at[alpha].s.dispose();
    }
    const R = at[0.1].R;
    const analytic = (0.5 * L_V * R) / (2 * 0.1 * MATERIALS.steam.c * (100 - 20));
    const h = at[0.1].rise;
    t.diagnostic(
        `T9: mitad condensada a ${fmt(h, 1)} m (${fmt(at[0.1].seconds, 1)} s) con α = 0,10 (analítica ${fmt(analytic, 1)} m con R = ${fmt(R, 3)} m); α = 0,07: ${fmt(at[0.07].rise, 1)} m, α = 0,13: ${fmt(at[0.13].rise, 1)} m`,
    );
    assert.ok(at[0.13].rise <= h && h <= at[0.07].rise, `${at[0.13].rise} ≤ ${h} ≤ ${at[0.07].rise}`);
    assert.ok(Math.abs(h - analytic) / analytic <= 0.05, `${h} contra ${analytic}`);
});

test("V4: el vapor que se enfría en el aire pasa a niebla y se disuelve como humedad: 0 gotas de agua y la masa de H2O contabilizada", (t) => {
    const s = thermalScene({ points: [{ x: 5, y: 1, kind: FLUID.STEAM }] });
    const { thermal, store } = s;
    const total0 = thermal.energy() + thermal.energyLost();
    const colors = [];
    const colorBuffer = () => Box2D.getPointer(s.system.GetColorBuffer());
    let foggy = false;
    let steps = 0;
    while (steps < 40000 && store.alive[0] === 1) {
        s.step();
        steps++;
        if (steps % 600 === 0 && store.alive[0] === 1) colors.push([quality(s, 0), Box2D.HEAPU8[colorBuffer()]]);
        if (store.alive[0] === 1 && quality(s, 0) < 0.99) foggy = true;
    }
    const total1 = thermal.energy() + thermal.energyLost();
    t.diagnostic(
        `V4: la niebla se disolvió a los ${fmt(steps * DT, 1)} s; vapores creados ${store.created[FLUID.STEAM]}, disueltos ${store.destroyed[SINK.HUMIDITY][FLUID.STEAM]}, agua creada ${store.created[FLUID.WATER]}, pasos steam→agua ${thermal.stats.condensed}; energía perdida ${fmt(thermal.stats.lost / 1e3, 3)} kJ de ${fmt((M_P * E_V) / 1e3, 3)} kJ iniciales, deriva ${((total1 - total0) / total0).toExponential(2)}; rojo del color por título ${colors.map(([x, r]) => `${fmt(x, 2)}:${r}`).join(" ")}`,
    );
    assert.ok(foggy, "no pasó por niebla");
    assert.equal(store.alive[0], 0);
    assert.equal(store.created[FLUID.WATER], 0, "se creó una partícula de agua");
    assert.equal(thermal.stats.condensed, 0);
    assert.equal(thermal.stats.advance.condense, 0);
    assert.equal(store.destroyed[SINK.HUMIDITY][FLUID.STEAM], 1);
    assert.equal(store.created[FLUID.STEAM] - store.destroyed[SINK.HUMIDITY][FLUID.STEAM], 0, "la masa de H2O no cierra");
    const mass = thermal.mass[FLUID.STEAM];
    assert.ok(Math.abs(thermal.stats.lost - mass * E_V) / (mass * E_V) < 1e-9, "la energía perdida no es m e_v");
    assert.ok(Math.abs(total1 - total0) / total0 < 1e-9);
    assert.ok(colors.length > 2 && colors[0][1] <= 255);
    s.dispose();
});
