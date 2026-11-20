/**
 * Ebullición del agua con lava y piedra caliente (docs/design/14-agua.md §14.8, criterios T3, T4, T5, B1, B2 y B3 de
 * §14.16, #112): LiquidFun real, el campo de alturas, `Immersion` y `Thermal` del juego con `stepWorld`. El piso cubre
 * la pileta (x de 18 a 38, 3 m de agua a 20 °C, 60 m² = 720 kg) y el campo no corre (`water.step`): cada columna
 * conserva su contenido, así que el calor de cada partícula queda en la columna de debajo, como en el diseño.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { thermalScene, DT } from "./helpers/thermal-bench.js";

const { FLUID } = await import("../js/weapons.js");
const { SINK } = await import("../js/particleStore.js");
const { MATERIALS, REACTIONS, SIGMA_W } = await import("../js/materials.js");
const { THERMAL } = await import("../js/thermal.js");

const fmt = (n, digits = 3) => Number(n).toFixed(digits);
const A_P = (1.5 * 0.06) ** 2;
const M_W = SIGMA_W * A_P;
const LAVA = MATERIALS.lava;
const WATER = MATERIALS.water;
const STONE = MATERIALS.stone;
const M_LAVA = LAVA.SG * SIGMA_W * A_P;
const L_V = WATER.latentVaporization;
const E_L = WATER.c * WATER.boilingPoint;
const E_V = E_L + L_V;
const BATCH = M_W * L_V;
const P_B = 2 * Math.sqrt(Math.PI * A_P) * (SIGMA_W / THERMAL.waterDensity);
const FLOOR = { x: 28, y: -0.5, w: 56, h: 1 };
const POOL = { column: 280, x: 28.05 };

const poolScene = (options = {}) => thermalScene({ immersion: true, floor: FLOOR, airLosses: false, ...options });

/**
 * Artesa de 0,6 m de ancho dentro de la pileta (x de 28,0 a 28,6: las columnas 280 a 285): las partículas de lava
 * quedan sobre las mismas columnas y el calor de cada una se contabiliza ahí. `h` es el espesor de agua que se deja
 * en esas columnas, a `T` °C.
 */
const TROUGH = { from: 280, to: 285, walls: [{ x: 27.9, y: 1.75, w: 0.2, h: 3.5 }, { x: 28.7, y: 1.75, w: 0.2, h: 3.5 }] };

function troughScene({ h, T }) {
    const s = poolScene({ solids: TROUGH.walls });
    for (let i = TROUGH.from; i <= TROUGH.to; i++) {
        s.water.h[i] = h;
        s.water.E[i] = SIGMA_W * WATER.c * h * T;
    }
    return s;
}

const troughColumns = () => Array.from({ length: TROUGH.to - TROUGH.from + 1 }, (_, k) => TROUGH.from + k);

const lavaEnergy = (s) => {
    let sum = 0;
    for (let slot = 0; slot < s.store.capacity; slot++) {
        const kind = s.store.kind[slot];
        if (s.store.alive[slot] && (kind === FLUID.LAVA || kind === FLUID.STONE)) sum += M_LAVA * s.store.enthalpy[slot];
    }
    return sum;
};

const countKind = (s, kind) => {
    let n = 0;
    for (let slot = 0; slot < s.store.capacity; slot++) if (s.store.alive[slot] && s.store.kind[slot] === kind) n++;
    return n;
};

const heatColumns = (s, from, to, T) => {
    const { water } = s;
    for (let i = from; i <= to; i++) water.E[i] = SIGMA_W * WATER.c * water.h[i] * T;
};

const sinkLava = (s, xs, depth = 0.3) => {
    const eta = s.water.surfaceAt(xs[0]);
    for (const x of xs) s.create({ x, y: eta - depth, kind: FLUID.LAVA });
};

test("constantes: el agua y el vapor comparten tramos de T(e) y las filas boil y condense conservan masa", () => {
    const s = thermalScene({ airLosses: false, points: [{ x: 5, y: 0.2, kind: FLUID.WATER }, { x: 6, y: 0.2, kind: FLUID.STEAM }] });
    const th = s.thermal;
    assert.equal(th.eBoil, E_L);
    assert.equal(th.eVapor, E_V);
    assert.equal(s.store.enthalpy[1], E_V, "el vapor nace en e_v");
    assert.ok(Math.abs(th.temperature(FLUID.WATER, E_L - 1) - 100) < 1e-3);
    assert.equal(th.temperature(FLUID.WATER, E_L + 0.5 * L_V), 100);
    assert.equal(th.temperature(FLUID.STEAM, E_L + 0.5 * L_V), 100);
    assert.ok(Math.abs(th.temperature(FLUID.STEAM, E_V + 2010 * 30) - 130) < 1e-9);
    assert.equal(th.specificHeat(FLUID.WATER, E_L + 1), Infinity);
    assert.equal(th.specificHeat(FLUID.STEAM, E_V), 2010);
    assert.ok(Math.abs(th.enthalpyAt(FLUID.WATER, 100) - E_L) < 1e-9);
    assert.ok(Math.abs(th.enthalpyAt(FLUID.STEAM, 100) - E_V) < 1e-9);
    assert.equal(th.mass[FLUID.STEAM], th.mass[FLUID.WATER]);
    assert.deepEqual(MATERIALS.steam.species, { H2O: 1 });
    const rows = REACTIONS.filter((row) => row.id === "boil" || row.id === "condense");
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(Object.values(row.from)[0], Object.values(row.to)[0]);
    s.dispose();
});

test("el agua pasa a vapor al llegar a e_v y el vapor sin contacto que baja a e_l se disuelve como humedad, con histéresis y la misma energía", () => {
    const s = thermalScene({
        airLosses: false,
        points: [
            { x: 5, y: 0.2, kind: FLUID.WATER },
            { x: 8, y: 0.2, kind: FLUID.WATER },
            { x: 11, y: 0.2, kind: FLUID.STEAM },
            { x: 14, y: 0.2, kind: FLUID.STEAM },
        ],
    });
    const th = s.thermal;
    const { store } = s;
    store.enthalpy[0] = E_V - 1;
    store.enthalpy[1] = E_V + 10;
    store.enthalpy[2] = E_L + 1;
    store.enthalpy[3] = E_L - 10;
    const before = store.enthalpy.slice(0, 4);
    s.step();
    assert.equal(store.kind[0], FLUID.WATER, "por debajo de e_v sigue siendo agua (mezcla a 100 °C)");
    assert.equal(store.kind[1], FLUID.STEAM);
    assert.equal(store.kind[2], FLUID.STEAM, "por encima de e_l sigue siendo vapor (histéresis)");
    assert.equal(store.alive[3], 0, "el vapor sin contacto que llega a e_l se disuelve en el aire (#113)");
    assert.equal(store.destroyed[SINK.HUMIDITY][FLUID.STEAM], 1);
    assert.equal(th.stats.boiled, 1);
    assert.equal(th.stats.humidity, 1);
    assert.equal(th.stats.advance.boil, th.mass[FLUID.WATER]);
    for (let k = 0; k < 3; k++) assert.equal(store.enthalpy[k], before[k], `la entalpía de la partícula ${k} no cambia al cambiar de fase`);
    s.dispose();
});

test("T3: la partícula de lava en agua a 20 °C solidifica en el tiempo del modelo concentrado con h_b = 500 (~1,25 min) ±10 %", (t) => {
    const s = poolScene();
    sinkLava(s, [POOL.x]);
    const hb = MATERIALS.heat.filmBoiling;
    const k = hb * P_B;
    const analytic = (M_LAVA * LAVA.c * Math.log((LAVA.temperature - 20) / (LAVA.solidus - 20))) / k + (M_LAVA * LAVA.latentFusion) / (k * (LAVA.solidus - 20));
    let seconds = 0;
    while (seconds < 400 && s.store.kind[0] === FLUID.LAVA) {
        s.step();
        seconds += DT;
    }
    const error = (seconds - analytic) / analytic;
    t.diagnostic(
        `T3: solidifica a los ${fmt(seconds, 1)} s (${fmt(seconds / 60, 2)} min) contra ${fmt(analytic, 1)} s (${fmt(analytic / 60, 2)} min) del modelo concentrado con h_b ${hb}, P b ${fmt(P_B * 1e3, 3)}·10⁻³ m², columna a ${fmt(s.water.temperatureOf(POOL.column), 2)} °C al final; error ${fmt(error * 100, 2)} %; vapor emitido ${s.thermal.stats.emitted}`,
    );
    assert.equal(s.store.kind[0], FLUID.STONE);
    assert.ok(Math.abs(error) <= 0.1, `error ${error}`);
    assert.ok(Math.abs(seconds - 75) / 75 <= 0.1, `${seconds} s contra ~1,25 min`);
    assert.equal(s.thermal.stats.emitted, 0);
    s.dispose();
});

test("T4: columna a 100 °C con el aporte de la lava, el volumen evaporado es Q / (σ_w L_v) ±1 %", (t) => {
    const s = troughScene({ h: 1, T: 100 });
    const { water, thermal } = s;
    const columns = troughColumns();
    const h0 = columns.map((i) => water.h[i]);
    sinkLava(s, [28.1, 28.3, 28.5]);
    const Q0 = lavaEnergy(s);
    const total0 = thermal.energy() + thermal.energyLost();
    const steps = Math.round(300 / DT);
    for (let k = 0; k < steps; k++) s.step();
    const Q = Q0 - lavaEnergy(s);
    const dropped = columns.reduce((a, i, k) => a + (h0[k] - water.h[i]) * water.dx, 0);
    const pending = columns.reduce((a, i) => a + water.boiled[i], 0);
    const expected = Q / (SIGMA_W * L_V);
    const measured = dropped + pending / (SIGMA_W * L_V);
    const hottest = Math.max(...columns.map((i) => water.temperatureOf(i)));
    const total1 = thermal.energy() + thermal.energyLost();
    t.diagnostic(
        `T4: lava cedió Q = ${fmt(Q / 1e3, 1)} kJ en ${fmt(steps * DT, 1)} s; volumen evaporado ${fmt(measured * 1e4, 3)}·10⁻⁴ m² (columnas ${fmt(dropped * 1e4, 3)} + pendiente ${fmt((pending / (SIGMA_W * L_V)) * 1e4, 3)}) contra Q/(σ_w L_v) = ${fmt(expected * 1e4, 3)}·10⁻⁴ m², error ${fmt(((measured - expected) / expected) * 100, 4)} %; ${thermal.stats.emitted} vapores emitidos, columna más caliente ${fmt(hottest, 6)} °C, deriva de energía ${((total1 - total0) / total0).toExponential(2)}`,
    );
    assert.ok(thermal.stats.emitted >= 2);
    assert.ok(Math.abs(measured - expected) / expected <= 0.01, `volumen ${measured} contra ${expected}`);
    assert.ok(hottest <= 100 + 1e-9, `la columna pasó de 100 °C: ${hottest}`);
    assert.ok(Math.abs(total1 - total0) / total0 < 1e-3);
    s.dispose();
});

test("T4 directo: el calor Q inyectado en una columna a 100 °C se va como vapor, un vapor por paso y por columna", () => {
    const s = poolScene();
    const { water, thermal } = s;
    const i = POOL.column;
    heatColumns(s, i, i, 100);
    const h0 = water.h[i];
    const batches = 7.5;
    water.E[i] += (batches * BATCH) / water.dx;
    const ledger0 = thermal.energy() + thermal.energyLost();
    const emittedPerStep = [];
    for (let k = 0; k < 10; k++) {
        const before = thermal.stats.emitted;
        s.step();
        emittedPerStep.push(thermal.stats.emitted - before);
    }
    const volume = (h0 - water.h[i]) * water.dx + water.boiled[i] / (SIGMA_W * L_V);
    assert.deepEqual(emittedPerStep, [1, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
    assert.ok(Math.abs(volume - (batches * BATCH) / (SIGMA_W * L_V)) / volume < 1e-9);
    assert.ok(Math.abs(water.temperatureOf(i) - 100) < 1e-9);
    assert.ok(Math.abs(thermal.energy() + thermal.energyLost() - ledger0) / ledger0 < 1e-9);
    s.dispose();
});

test("B1: bajo agua subenfriada no sale vapor: el primer vapor aparece con la columna a 100 °C y cuando el calor pagó el calentamiento y el latente", (t) => {
    const s = troughScene({ h: 1, T: 89 });
    const { water, thermal } = s;
    const columns = troughColumns();
    sinkLava(s, [28.1, 28.3, 28.5]);
    const Q0 = lavaEnergy(s);
    let steps = 0;
    let first = null;
    let reached = null;
    while (steps < Math.round(400 / DT) && first === null) {
        s.step();
        steps++;
        const hottest = Math.max(...columns.map((i) => water.temperatureOf(i)));
        if (reached === null && hottest >= 100 - 1e-9) reached = { step: steps, Q: Q0 - lavaEnergy(s) };
        if (thermal.stats.emitted > 0) first = { step: steps, T: hottest, Q: Q0 - lavaEnergy(s) };
    }
    assert.ok(first, "la lava en las columnas a 89 °C nunca emitió vapor");
    assert.ok(reached, "ninguna columna llegó a 100 °C");
    t.diagnostic(
        `B1: columnas a 89 °C, ${fmt((reached.step - 1) * DT, 1)} s con todas por debajo de 100 °C y 0 vapores; la primera llega a 100 °C a los ${fmt(reached.step * DT, 1)} s (la lava cedió ${fmt(reached.Q / 1e3, 1)} kJ) y el primer vapor sale a los ${fmt(first.step * DT, 1)} s con la columna a ${fmt(first.T, 6)} °C, tras ${fmt(first.Q / 1e3, 1)} kJ cedidos (un vapor son ${fmt(BATCH / 1e3, 1)} kJ)`,
    );
    assert.ok(first.step >= reached.step, "salió vapor con las columnas por debajo de 100 °C");
    assert.ok(Math.abs(first.T - 100) < 1e-6, `la columna emitió a ${first.T} °C`);
    assert.ok(first.Q - reached.Q > 0 && first.Q > BATCH, "el vapor salió antes de pagar el calor latente");
    s.dispose();
});

test("B1b: tres partículas de lava en la pileta a 20 °C durante 3 min: 0 vapores y ninguna columna llega a 100 °C", (t) => {
    const s = poolScene();
    const { water, thermal } = s;
    sinkLava(s, [22.03, 28.05, 33.02]);
    let hottest = 0;
    let steam = 0;
    for (let k = 0; k < Math.round(180 / DT); k++) {
        s.step();
        steam = Math.max(steam, thermal.stats.steam);
        if (k % 30 === 0) for (let i = 0; i < water.N; i++) if (water.h[i] > 0) hottest = Math.max(hottest, water.temperatureOf(i));
    }
    t.diagnostic(`B1b: 180 s con 3 lavas: vapores máx ${steam}, emitidos ${thermal.stats.emitted}, columna más caliente ${fmt(hottest, 2)} °C`);
    assert.equal(steam, 0);
    assert.equal(thermal.stats.emitted, 0);
    assert.ok(hottest < 100);
    s.dispose();
});

for (const h of [0.2, 3]) {
    test(`B2: 1 kg de lava a 1150 °C sobre ${h === 3 ? "agua de sobra (3 m)" : "poca agua (0,2 m)"} a 20 °C evapora lo que dice el balance de energía y no más de 0,57 kg ±5 %`, (t) => {
        const s = troughScene({ h, T: 20 });
        const { water, thermal, store } = s;
        const columns = troughColumns();
        const xs = [28.1, 28.2, 28.3, 28.4];
        sinkLava(s, xs, 0.1);
        const lavaKg = xs.length * M_LAVA;
        const Q0 = lavaEnergy(s);
        for (let k = 0; k < Math.round(30 / DT); k++) s.step();
        for (let k = 0; k < 4000; k++) {
            thermal.step(1);
            const T = Math.max(...Array.from({ length: 4 }, (_, n) => thermal.temperature(store.kind[n], store.enthalpy[n])));
            if (T < 100 + 0.5) break;
        }
        const stoneT = Array.from({ length: 4 }, (_, n) => thermal.temperature(store.kind[n], store.enthalpy[n]));
        const Q = Q0 - lavaEnergy(s);
        const pending = columns.reduce((a, i) => a + water.boiled[i], 0);
        const evaporated = thermal.stats.emitted * M_W + pending / L_V;
        const waterMass = columns.reduce((a, i) => a + SIGMA_W * water.h[i] * water.dx, 0);
        const sensible = columns.reduce((a, i) => a + SIGMA_W * water.h[i] * water.dx * WATER.c * (water.temperatureOf(i) - 20), 0);
        const predicted = (Q - sensible - thermal.stats.emitted * M_W * WATER.c * 80) / L_V;
        const perKg = evaporated / lavaKg;
        const columnT = columns.map((i) => water.temperatureOf(i));
        t.diagnostic(
            `B2 (h = ${h} m): ${xs.length} partículas = ${fmt(lavaKg, 4)} kg cedieron ${fmt(Q / 1e6, 4)} MJ (${fmt(Q / lavaKg / 1e6, 4)} MJ/kg) hasta ${stoneT.map((x) => fmt(x, 1)).join(", ")} °C; ${fmt(waterMass, 2)} kg de agua al final, columnas entre ${fmt(Math.min(...columnT), 1)} y ${fmt(Math.max(...columnT), 1)} °C; evaporado ${fmt(evaporated, 4)} kg (${thermal.stats.emitted} vapores + pendiente) contra ${fmt(predicted, 4)} kg del balance; por kg de lava ${fmt(perKg, 4)} kg contra la cota 0,57 kg (ficha 5: ${fmt(Q / lavaKg / (WATER.c * 80 + L_V), 4)} si el agua calentada fuera toda la evaporada)`,
        );
        assert.ok(perKg <= 0.57 * 1.05, `${perKg} kg por kg de lava`);
        if (evaporated === 0) assert.ok(Math.abs(predicted) < 1e-3 * lavaKg);
        else assert.ok(Math.abs(evaporated - predicted) / predicted <= 0.05, `${evaporated} contra ${predicted}`);
        s.dispose();
    });
}

test("B3: un tanque de lava (180 partículas) repartido en la pileta la calienta en promedio lo que permite su energía (≤ 23,5 K)", (t) => {
    const s = poolScene();
    const { water, thermal } = s;
    const xs = Array.from({ length: 180 }, (_, k) => 18.05 + k * 0.11);
    sinkLava(s, xs, 0.2);
    const volume = water.volume();
    const poolMass = SIGMA_W * volume;
    const E0 = water.energy();
    const Q0 = lavaEnergy(s);
    const lavaKg = xs.length * M_LAVA;
    for (let k = 0; k < Math.round(30 / DT); k++) s.step();
    for (let k = 0; k < 3000; k++) thermal.step(1);
    const mean = (water.energy() - E0) / (poolMass * WATER.c);
    const hottest = Math.max(...Array.from({ length: water.N }, (_, i) => (water.h[i] > 0 ? water.temperatureOf(i) : 0)));
    const stone = Array.from({ length: 180 }, (_, n) => thermal.temperature(s.store.kind[n], s.store.enthalpy[n]));
    const lavaQ = Q0 - lavaEnergy(s);
    const bound = (lavaKg * ((LAVA.temperature - LAVA.solidus) * LAVA.c + LAVA.latentFusion + (LAVA.solidus - 20) * STONE.c)) / (poolMass * WATER.c);
    t.diagnostic(
        `B3: ${lavaKg.toFixed(2)} kg de lava en ${poolMass.toFixed(0)} kg de agua: calentamiento medio ${fmt(mean, 2)} K tras ${(30 + 3000) / 60} min (cota con la energía de los datos, enfriando la lava hasta 20 °C: ${fmt(bound, 2)} K; criterio del diseño ~27 K); lava cedió ${fmt(lavaQ / 1e6, 2)} MJ, la piedra quedó entre ${fmt(Math.min(...stone), 1)} y ${fmt(Math.max(...stone), 1)} °C; columna más caliente ${fmt(hottest, 1)} °C; vapores emitidos ${thermal.stats.emitted}; energía en columnas ${fmt((water.energy() - E0) / 1e6, 2)} MJ`,
    );
    assert.equal(thermal.stats.emitted, 0);
    assert.ok(mean <= bound + 1e-6);
    assert.ok(Math.abs(mean - (lavaQ / (poolMass * WATER.c))) / mean < 1e-3, "el calentamiento medio es el calor que cedió la lava");
    s.dispose();
});

test("T5: el vapor sube en aire quieto a la velocidad terminal √(2 g (ρ_a − ρ_s) A_p / (ρ_a C_d D)) ≈ 0,95 m/s ±15 %", (t) => {
    const s = thermalScene({ points: [{ x: 5, y: 1, kind: FLUID.STEAM }], airLosses: false });
    const D = 1.5 * 0.06;
    const air = MATERIALS.air.rho;
    const rho = MATERIALS.steam.rho;
    const terminal = Math.sqrt((2 * 10 * (air - rho) * A_P) / (air * MATERIALS.steam.Cd * D));
    const speeds = [];
    for (let k = 0; k < Math.round(6 / DT); k++) {
        s.step();
        if (s.time > 3) speeds.push(Box2D.HEAPF32[(Box2D.getPointer(s.system.GetVelocityBuffer()) >> 2) + 1]);
    }
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    t.diagnostic(`T5: velocidad terminal ${fmt(mean, 4)} m/s entre 3 y 6 s (analítica ${fmt(terminal, 4)} m/s, diseño 0,95), y a ${fmt(s.positions()[0].y, 2)} m de altura`);
    assert.ok(Math.abs(terminal - 0.95) / 0.95 < 0.01);
    assert.ok(Math.abs(mean - terminal) / terminal <= 0.15, `${mean} contra ${terminal}`);
    assert.ok(mean > 0);
    s.dispose();
});

test("el vapor que cae sobre agua a 20 °C se absorbe con su entalpía: el calor queda en la columna y no sale vapor", () => {
    const s = poolScene();
    const { water, thermal, store } = s;
    const x = POOL.x;
    const eta = water.surfaceAt(x);
    s.create({ x, y: eta + 0.03, kind: FLUID.STEAM });
    const column = POOL.column;
    const ledger0 = thermal.energy() + thermal.energyLost();
    const T0 = water.temperatureOf(column);
    for (let k = 0; k < 5; k++) s.step();
    assert.equal(store.destroyed[SINK.ABSORBED][FLUID.STEAM], 1);
    assert.equal(countKind(s, FLUID.STEAM), 0);
    assert.equal(thermal.stats.emitted, 0);
    assert.ok(water.temperatureOf(column) > T0 + 5, `la columna pasó de ${T0} a ${water.temperatureOf(column)} °C`);
    assert.ok(Math.abs(thermal.energy() + thermal.energyLost() - ledger0) / ledger0 < 1e-9);
    s.dispose();
});

test("el vapor sobre una columna a 100 °C no condensa y sigue subiendo", () => {
    const s = poolScene();
    const { water, store } = s;
    heatColumns(s, 270, 290, 100);
    s.create({ x: POOL.x, y: water.surfaceAt(POOL.x) + 0.03, kind: FLUID.STEAM });
    const y0 = s.positions()[0].y;
    for (let k = 0; k < 60; k++) s.step();
    assert.equal(store.destroyed[SINK.ABSORBED][FLUID.STEAM], 0);
    assert.equal(countKind(s, FLUID.STEAM), 1);
    assert.ok(s.positions()[0].y > y0 + 0.3, `subió de ${y0} a ${s.positions()[0].y}`);
    s.dispose();
});

test("la ebullición espera con el tope de 300 vapores, no deja la columna más fina que hMin y conserva la energía", () => {
    const s = poolScene();
    const { water, thermal } = s;
    const i = POOL.column;
    heatColumns(s, i, i, 100);
    water.E[i] += (5 * BATCH) / water.dx;
    const ledger0 = thermal.energy() + thermal.energyLost();
    const saved = THERMAL.maxSteam;
    try {
        THERMAL.maxSteam = 3;
        for (let k = 0; k < 20; k++) s.step();
    } finally {
        THERMAL.maxSteam = saved;
    }
    assert.equal(thermal.stats.emitted, 3, "con tope 3 salen solo 3 vapores");
    assert.ok(Math.abs(water.boiled[i] - 2 * BATCH) < 1e-6 * BATCH, `quedan ${water.boiled[i] / BATCH} lotes pendientes`);
    assert.ok(Math.abs(thermal.energy() + thermal.energyLost() - ledger0) / ledger0 < 1e-9);
    water.h[i] = water.config.hMin + (0.5 * A_P) / water.dx;
    water.E[i] = SIGMA_W * WATER.c * water.h[i] * 100;
    const hBefore = water.h[i];
    s.step();
    assert.equal(water.h[i], hBefore, "una columna que quedaría con h < hMin no emite");
    s.dispose();
});
