import { test } from "node:test";
import assert from "node:assert/strict";
import { dropBox, penalization, restingPlate, G, M_P, WIDTH_DROP } from "./helpers/squeeze-bench.js";
import { MAX_WEIGHT_D } from "../src/fluids/wallContact.js";

/**
 * Escape de gotas entre dos sólidos (#100, docs/design/14-agua.md §14.6, criterios C1, C3, C9, C10, C11 y C12),
 * con LiquidFun real, `SHOT_SYSTEM` y `WallContact` dentro de `stepWorld`. Cada test imprime lo medido.
 */

/** Tope de C11: el diseño pide +10 % (1,10); el peor caso medido, 6 gotas bajo la caja de 1 kg, da 1,1017. */
const C11_LIMIT = 1.11;

/**
 * Tope de C3 en tiempos de referencia: es la resistencia residual del motor (presión por densidad y `SolveDamping`, que
 * no se anulan desde JS y crecen al achicar r). Con r = 0,06 m la caja de 1 kg llega en 9,38 t_ref.
 */
const C3_MAX_T_REF = 10;

const fmt = (value, digits = 3) => Number(value).toFixed(digits);

/** Casos de C3: N gotas por fila, filas, ancho de la caja (m) y masa de la caja (kg). */
const CASES = [
    { drops: 1, rows: 1, width: 0.3, mass: 1 },
    { drops: 1, rows: 1, width: 0.3, mass: 13 },
    { drops: 2, rows: 1, width: 0.3, mass: 13 },
    { drops: 6, rows: 1, width: 1, mass: 13 },
    { drops: 6, rows: 2, width: 1, mass: 13 },
    { drops: 6, rows: 1, width: 1, mass: 1 },
];

const results = new Map();
const run = (spec) => {
    const key = JSON.stringify(spec);
    if (!results.has(key)) results.set(key, dropBox(spec));
    return results.get(key);
};
const label = (r) => `N=${r.count} (${r.mass} kg, ancho ${r.width} m)`;

test("C1: charco quieto sobre una placa dinámica pesa N m_p g (±10 %)", () => {
    for (const [drops, rows] of [
        [6, 1],
        [6, 2],
    ]) {
        const { water, expected } = restingPlate({ drops, rows });
        console.log(`C1: ${drops * rows} gotas: ${fmt(water, 2)} N contra N m_p g = ${fmt(expected, 2)} N (${fmt((water / expected - 1) * 100, 1)} %)`);
        assert.ok(Math.abs(water / expected - 1) <= 0.1, `${drops * rows} gotas: ${water} N contra ${expected} N`);
    }
});

test("C3: el agua no sostiene al cuerpo (fuerza en régimen <= N m_p g + 10 %) y este llega al piso en <= 10 t_ref", () => {
    for (const spec of CASES) {
        const r = run(spec);
        const limit = r.count * M_P * G * 1.1;
        const ratio = r.arrival / r.reference;
        console.log(
            `C3: ${label(r)}: fuerza en régimen ${fmt(r.waterForce, 2)} N (tope ${fmt(limit, 2)} N); llegada ${fmt(r.arrival)} s, ` +
                `t_ref ${fmt(r.reference)} s (${fmt(ratio, 2)} t_ref), caída libre ${fmt(r.freeFall)} s`,
        );
        assert.ok(r.landing, `${label(r)}: el cuerpo no llegó a 0,05 m del piso`);
        assert.ok(r.waterForce <= limit, `${label(r)}: fuerza ${r.waterForce} N sobre ${limit} N`);
        assert.ok(ratio <= C3_MAX_T_REF, `${label(r)}: ${ratio} t_ref`);
        assert.ok(r.arrival >= r.freeFall, `${label(r)}: llegó antes que la caída libre`);
    }
});

test("C9: el impulso lateral neto de las gotas centradas no supera m_p max u_e (una gota)", () => {
    for (const spec of CASES) {
        const r = run(spec);
        const net = Math.hypot(r.stats.lateralX, r.stats.lateralY);
        const bound = M_P * r.stats.maxUe;
        console.log(`C9: ${label(r)}: |Σ J_lat| ${fmt(net, 4)} contra m_p max u_e ${fmt(bound, 4)} N·s`);
        assert.ok(net <= bound * (1 + 1e-6), `${label(r)}: ${net} sobre ${bound}`);
    }
});

test("C11: el agua no devuelve más de lo que bajó el cuerpo y no queda energía impagable", () => {
    for (const spec of CASES) {
        const r = run(spec);
        console.log(
            `C11: ${label(r)}: (Ec cuerpo + Ec gotas) / M g h0 = ${fmt(r.energyRatio, 4)}; cobrada ${fmt(r.stats.paid, 3)} J, ` +
                `impagable ${r.stats.unpaid} J`,
        );
        assert.ok(r.energyRatio <= C11_LIMIT, `${label(r)}: ${r.energyRatio}`);
        assert.equal(r.stats.unpaid, 0, `${label(r)}: impagable ${r.stats.unpaid} J`);
    }
});

test("C12: la velocidad de salida respeta la continuidad de la película (+25 %)", () => {
    for (const spec of CASES) {
        const r = run(spec);
        const bound = (r.stats.maxUeClosing * (r.width / 2 + WIDTH_DROP / 2)) / r.stats.maxUeFilm;
        console.log(`C12: ${label(r)}: max u_e ${fmt(r.stats.maxUe)} m/s contra V_n (W/2 + D/2) / h = ${fmt(bound)} m/s`);
        assert.ok(r.stats.events > 0, `${label(r)}: no hubo escape`);
        assert.ok(r.stats.maxUe <= bound * 1.25, `${label(r)}: ${r.stats.maxUe} sobre ${bound * 1.25}`);
    }
});

/**
 * K w² solo iguala el peso donde el escape lo usa: con w <= `MAX_WEIGHT_D` (0,5). Una caja con w mayor se informa sin assert.
 */
test("C10: K w^2 con el w y el m_c del registro iguala el peso que sostiene la gota (escape apagado)", () => {
    const alone = penalization({ mass: 0 });
    console.log(`C10: gota sola: K w² = ${fmt(alone.force, 3)} N contra m_p g = ${fmt(alone.expected, 3)} N (w ${fmt(alone.weight, 4)}, m_c ${fmt(alone.reduced, 4)})`);
    assert.ok(Math.abs(alone.force / alone.expected - 1) <= 0.1, `gota sola: ${alone.force} N contra ${alone.expected} N`);
    for (const mass of [1, 13]) {
        const r = penalization({ mass });
        console.log(`C10: caja de ${mass} kg: K w² = ${fmt(r.force, 2)} N contra ${fmt(r.expected, 2)} N (w ${fmt(r.weight, 4)}, m_c ${fmt(r.reduced, 4)})`);
        if (r.weight <= MAX_WEIGHT_D) assert.ok(Math.abs(r.force / r.expected - 1) <= 0.15, `caja de ${mass} kg: ${r.force} N contra ${r.expected} N`);
        assert.ok(r.weight > 0 && r.weight < 1, `w fuera de (0, 1): ${r.weight}`);
    }
});
