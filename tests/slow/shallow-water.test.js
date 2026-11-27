/** Campo de alturas ShallowWater (#70, docs/design/14-agua.md §14.3 y criterios W1-W10 de §14.16), Node puro. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ShallowWater, WATER_FIELD } from "../../src/water/water.js";
import { LEVEL } from "../../src/level/level.js";
import { SIGMA_W, MATERIALS } from "../../src/fluids/materials.js";
import { fieldColor } from "../../src/render/render.js";
import { WaterView } from "../../src/render/waterView.js";
import { installFakePixi } from "../helpers/fake-pixi.js";
import { relativeError as rel } from "../../src/core/debug.js";

const G = 10;
const DT = 1 / 60;
const FRICTIONLESS = { ...WATER_FIELD, manning: 0 };
const runs = [];

/** Nivel de prueba: piso plano de `length` m entre paredes reflectivas, más los sólidos `floors` extra. */
function tank(length, floors = []) {
    return {
        bounds: { minX: 0, maxX: length, minY: 0, maxY: 32 },
        solids: [{ x: length / 2, y: -0.5, w: length, h: 1, kind: "floor" }, ...floors.map((f) => ({ ...f, kind: "floor" }))],
    };
}

function make(level, config = WATER_FIELD, name = "") {
    const water = new ShallowWater(level, config);
    runs.push({ name, water });
    return water;
}

function fill(water, fn) {
    for (let i = 0; i < water.N; i++) water.h[i] = Math.max(0, fn(water.center(i)) - water.b[i]);
}

function run(water, seconds, onStep) {
    const steps = Math.round(seconds / DT);
    for (let s = 0; s < steps; s++) {
        water.step(DT);
        if (onStep) onStep(s + 1);
    }
}

const fmt = (v) => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(3) : Number(v.toPrecision(5)).toString());
const report = (t, id, measured, expected, tolerance) =>
    t.diagnostic(`${id}: medido ${measured} | esperado ${expected} | tolerancia ${tolerance}`);

/** Tanque cerrado de 20 m con una isla de 0,5 m, columna de 2 m a la izquierda y lámina de 0,3 m: olas y frentes seco/mojado. */
function slosh(name) {
    const water = make(tank(20, [{ x: 14, y: 0, w: 4, h: 1 }]), WATER_FIELD, name);
    fill(water, (x) => (x < 5 ? 2 : x < 10 ? 0.3 : 0));
    for (let i = 0; i < water.N; i++) {
        const x = water.center(i);
        const T = 20 + 2 * x;
        const X = 0.5 + 0.4 * Math.sin(x);
        water.E[i] = SIGMA_W * MATERIALS.water.c * water.h[i] * T;
        water.M[i] = water.h[i] * X;
    }
    return water;
}

test("W1 volumen en tanque cerrado con olas y frentes secos, 60 s", (t) => {
    const water = slosh("W1");
    const v0 = water.volume();
    let worst = 0;
    run(water, 60, (s) => {
        if (s % 60 === 0) worst = Math.max(worst, rel(water.volume(), v0));
    });
    report(t, "W1", `error relativo máx ${fmt(worst)} (V0 = ${fmt(v0)} m²)`, "Σ h dx constante", "< 1e-4 (0,01 %)");
    assert.ok(worst < 1e-4);
});

test("W2 lago en reposo sobre el lecho real, 60 s", (t) => {
    const water = make(LEVEL, WATER_FIELD, "W2");
    run(water, 60);
    let maxU = 0;
    let maxEta = 0;
    for (let i = 0; i < water.N; i++) {
        maxU = Math.max(maxU, Math.abs(water.uOf(i)), Math.abs(water.q[i]));
        const xc = water.center(i);
        if (xc > LEVEL.pool.x1 && xc < LEVEL.pool.x2) maxEta = Math.max(maxEta, Math.abs(water.b[i] + water.h[i] - LEVEL.pool.surface));
    }
    report(t, "W2", `max|u| = ${fmt(maxU)} m/s, max|η − 3| = ${fmt(maxEta)} m`, "u = 0, η = 3 m", "max|u| < 1e-8 m/s");
    assert.ok(maxU < 1e-8);
    assert.ok(maxEta < 1e-8);
});

/** Pulso de onda larga (λ = 20 h) con a/h = 0,02: mide la velocidad del centroide de la onda que viaja a la derecha. */
function waveSpeed(h0) {
    const length = 400;
    const water = make(tank(length), FRICTIONLESS, `W3 h=${h0}`);
    const a = 0.02 * h0;
    const lambda = 20 * h0;
    const x0 = length / 2;
    fill(water, (x) => h0 + (Math.abs(x - x0) < lambda / 2 ? a * Math.cos((Math.PI * (x - x0)) / lambda) ** 2 : 0));
    const c = Math.sqrt(G * h0);
    const centroid = () => {
        let m = 0;
        let mx = 0;
        for (let i = 0; i < water.N; i++) {
            const x = water.center(i);
            if (x <= x0) continue;
            const e = water.h[i] - h0;
            m += e;
            mx += e * x;
        }
        return mx / m;
    };
    const t1 = 1.2 * (lambda / c) + 2;
    const t2 = t1 + 8;
    run(water, t1);
    const x1 = centroid();
    run(water, t2 - t1);
    const x2 = centroid();
    return { measured: (x2 - x1) / (t2 - t1), c };
}

test("W3 velocidad de una onda larga chica, h = 1 m y h = 3 m", (t) => {
    for (const h0 of [1, 3]) {
        const { measured, c } = waveSpeed(h0);
        report(t, `W3 h=${h0}`, `${fmt(measured)} m/s (error ${fmt((100 * (measured - c)) / c)} %)`, `${fmt(c)} m/s`, "±10 %");
        assert.ok(rel(measured, c) < 0.1);
    }
});

const C0 = Math.sqrt(G * 2);

/** Rotura de presa de Ritter: h0 = 2 m, presa en x = 15, dominio de 43 m, sin fricción. */
function damBreakDry(name) {
    const water = make(tank(43), FRICTIONLESS, name);
    fill(water, (x) => (x < 15 ? 2 : 0));
    return water;
}

function ritterMetrics(water, time) {
    const dam = 15;
    let front = NaN;
    for (let i = water.N - 1; i >= 1; i--) {
        if (water.h[i] >= 0.01 * 2) {
            const f = (0.02 - water.h[i + 1]) / (water.h[i] - water.h[i + 1]);
            front = water.center(i + 1) + f * water.dx - dam;
            break;
        }
    }
    let l1 = 0;
    for (let i = 0; i < water.N; i++) {
        const s = water.center(i) - dam;
        if (s < -C0 * time || s > 2 * C0 * time) continue;
        const exact = (2 * C0 - s / time) ** 2 / (9 * G);
        l1 += Math.abs(water.h[i] - exact) * water.dx;
    }
    return { front, expectedFront: 1.7 * C0 * time, l1, l1Limit: 0.05 * 2 * 3 * C0 * time };
}

test("W4 rotura de presa sobre lecho seco contra la solución de Ritter", (t) => {
    const water = damBreakDry("W4");
    let elapsed = 0;
    for (const time of [1, 2, 3]) {
        run(water, time - elapsed);
        elapsed = time;
        const m = ritterMetrics(water, time);
        report(
            t,
            `W4 t=${time} s`,
            `frente ${fmt(m.front)} m (error ${fmt((100 * (m.front - m.expectedFront)) / m.expectedFront)} %), L1 ${fmt(m.l1)} m² (${fmt((100 * m.l1) / (2 * 3 * C0 * time))} % de h0·L)`,
            `frente ${fmt(m.expectedFront)} m, L1 < 5 % de h0·L = ${fmt(m.l1Limit)} m²`,
            "frente ±10 %, L1 < 5 %"
        );
        assert.ok(rel(m.front, m.expectedFront) < 0.1);
        assert.ok(m.l1 < m.l1Limit);
    }
});

test("W5 rotura de presa sobre lecho mojado contra la solución de Stoker", (t) => {
    const water = make(tank(120), FRICTIONLESS, "W5");
    fill(water, (x) => (x < 60 ? 2 : 0.5));
    const plateau = (time) => {
        let sh = 0;
        let su = 0;
        let n = 0;
        for (let i = 0; i < water.N; i++) {
            const s = water.center(i) - 60;
            if (s < -4 || s > 0.7 * 4.207 * time) continue;
            sh += water.h[i];
            su += water.uOf(i);
            n++;
        }
        return { hm: sh / n, um: su / n };
    };
    const shockAt = () => {
        for (let i = water.N - 1; i > 0; i--) {
            if (water.h[i] >= 1.0) {
                const f = (1.0 - water.h[i + 1]) / (water.h[i] - water.h[i + 1]);
                return water.center(i + 1) + f * water.dx - 60;
            }
        }
        return NaN;
    };
    run(water, 6);
    const x1 = shockAt();
    run(water, 4);
    const x2 = shockAt();
    const { hm, um } = plateau(10);
    const shock = (x2 - x1) / 4;
    report(t, "W5 h_m", `${fmt(hm)} m (error ${fmt((100 * (hm - 1.1035)) / 1.1035)} %)`, "1,1035 m", "±5 %");
    report(t, "W5 u_m", `${fmt(um)} m/s (error ${fmt((100 * (um - 2.3)) / 2.3)} %)`, "2,300 m/s", "±5 % (supuesta: el criterio no fija la de u_m)");
    report(t, "W5 resalto", `${fmt(shock)} m/s (error ${fmt((100 * (shock - 4.207)) / 4.207)} %)`, "4,207 m/s", "±5 %");
    assert.ok(rel(hm, 1.1035) < 0.05);
    assert.ok(rel(um, 2.3) < 0.05);
    assert.ok(rel(shock, 4.207) < 0.05);
});

test("W6 positividad y tope de subpasos en W1-W5 y en el nivel real con lluvia", (t) => {
    const water = make(LEVEL, WATER_FIELD, "nivel con lluvia");
    let seed = 12345;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    run(water, 60, () => {
        for (let k = 0; k < 20; k++) water.deposit(1 + 54 * random(), 0.0324, 0, 0, 0);
    });
    let minH = Infinity;
    let caps = 0;
    let halvings = 0;
    for (const { name, water: w } of runs) {
        t.diagnostic(`W6 ${name}: minH ${fmt(w.stats.minH)} m, subpasos ${w.stats.substeps} en ${w.stats.steps} pasos, repeticiones dt/2 ${w.stats.halvings}, tope ${w.stats.capHits}`);
        minH = Math.min(minH, w.stats.minH);
        caps += w.stats.capHits;
        halvings += w.stats.halvings;
    }
    report(t, "W6", `min h = ${fmt(minH)} m, activaciones del tope = ${caps}, repeticiones dt/2 = ${halvings}`, "min h ≥ 0, 0 activaciones", "0 violaciones");
    assert.ok(minH >= 0);
    assert.equal(caps, 0);
});

test("W7 energía y miel advectadas en el tanque cerrado, 60 s", (t) => {
    const water = slosh("W7");
    const e0 = water.energy();
    const m0 = water.honey();
    let worstE = 0;
    let worstM = 0;
    run(water, 60, (s) => {
        if (s % 60 === 0) {
            worstE = Math.max(worstE, rel(water.energy(), e0));
            worstM = Math.max(worstM, rel(water.honey(), m0));
        }
    });
    report(t, "W7", `error relativo máx ΣE ${fmt(worstE)}, ΣM ${fmt(worstM)}`, "ΣE y ΣM constantes", "< 1e-4 (0,01 %)");
    assert.ok(worstE < 1e-4);
    assert.ok(worstM < 1e-4);
});

test("W7b T y X_v uniformes se mantienen uniformes en la rotura de presa", (t) => {
    const water = damBreakDry("W7b");
    const T0 = 37;
    const X0 = 0.3;
    for (let i = 0; i < water.N; i++) {
        water.E[i] = SIGMA_W * MATERIALS.water.c * water.h[i] * T0;
        water.M[i] = water.h[i] * X0;
    }
    const worst = () => {
        let eT = 0;
        let eX = 0;
        for (let i = 0; i < water.N; i++) {
            if (water.h[i] < water.config.hDry) continue;
            eT = Math.max(eT, Math.abs(water.temperatureOf(i) - T0));
            eX = Math.max(eX, Math.abs(water.honeyFraction(i) - X0));
        }
        return { eT, eX };
    };
    run(water, 1);
    const at1 = worst();
    run(water, 2);
    const at3 = worst();
    report(t, "W7b t=1 s", `max|T − T0| = ${fmt(at1.eT)} °C, max|X_v − X0| = ${fmt(at1.eX)}`, "constantes", "< 1e-12");
    report(t, "W7b t=3 s", `max|T − T0| = ${fmt(at3.eT)} °C, max|X_v − X0| = ${fmt(at3.eX)}`, "constantes", "< 1e-12");
    assert.ok(at1.eT < 1e-12 && at1.eX < 1e-12);
});

test("W8 costo de step con h = 15 m y flujo de 5 m/s", (t) => {
    const water = make(LEVEL, WATER_FIELD, "W8");
    fill(water, () => 15);
    for (let i = 0; i < water.N; i++) water.q[i] = 5 * water.h[i];
    for (let s = 0; s < 30; s++) water.step(DT);
    const before = water.stats.substeps;
    const stepsMeasured = 300;
    const times = new Array(stepsMeasured);
    for (let s = 0; s < stepsMeasured; s++) {
        const t0 = performance.now();
        water.step(DT);
        times[s] = performance.now() - t0;
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / stepsMeasured;
    report(
        t,
        "W8",
        `media ${fmt(mean)} ms, mediana ${fmt(times[150])} ms, p99 ${fmt(times[296])} ms, ${fmt((water.stats.substeps - before) / stepsMeasured)} subpasos por paso`,
        "media ≤ 0,6 ms por paso fijo",
        "media ≤ 0,6 ms, p99 se informa; assert solo con PERF=1 (corrida aislada)"
    );
    if (process.env.PERF === "1") assert.ok(mean <= 0.6);
});

test("W9 seiche fundamental de la pileta de 20 x 3 m", (t) => {
    const length = 20;
    const water = make(tank(length), WATER_FIELD, "W9");
    fill(water, (x) => 3 + 0.02 * Math.cos((Math.PI * x) / length));
    const mode = () => {
        let sum = 0;
        for (let i = 0; i < water.N; i++) sum += (water.h[i] - 3) * Math.cos((Math.PI * water.center(i)) / length);
        return sum;
    };
    const crossings = [];
    let prev = mode();
    run(water, 24, (s) => {
        const cur = mode();
        if (prev * cur < 0) crossings.push(((s - 1) + prev / (prev - cur)) * DT);
        prev = cur;
    });
    const period = 2 * ((crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1));
    const expected = (2 * length) / Math.sqrt(G * 3);
    report(
        t,
        "W9",
        `T = ${fmt(period)} s (error ${fmt((100 * (period - expected)) / expected)} % contra Saint-Venant, ${fmt((100 * (period - 7.56)) / 7.56)} % contra Airy 7,56 s)`,
        `${fmt(expected)} s`,
        "±2 %"
    );
    assert.ok(crossings.length >= 4);
    assert.ok(rel(period, expected) < 0.02);
});

/** Vertedero de cresta ancha de 20 m sobre un escalón de `step` m: caudal de la cresta contra `√g·(2H/3)^1,5` con la carga total H en x = 30 m. */
for (const step of [0.5, 1, 2, 4]) {
    test(`W10 vertedero de cresta ancha sobre el escalón de ${step} m`, (t) => {
        const flow = Math.sqrt(G) * ((2 * 0.5) / 3) ** 1.5;
        const water = make(tank(400, [{ x: 50, y: step / 2, w: 20, h: step }]), FRICTIONLESS, `W10 ${step} m`);
        fill(water, (x) => (x < 40 ? step + 0.5 : 0));
        const crest = [];
        for (let i = 0; i < water.N; i++) {
            const x = water.center(i);
            if (x > 43 && x < 57) crest.push(i);
        }
        const upstream = Math.round((30 - water.x0) / water.dx);
        const crestMean = () => crest.reduce((a, i) => a + water.q[i], 0) / crest.length;
        let steady = -1;
        let sumQ = 0;
        let sumH = 0;
        let n = 0;
        run(water, 240, (s) => {
            water.deposit(5, flow * DT, 0, 0, 0);
            const qc = crestMean();
            if (steady < 0 && Math.abs(qc / flow - 1) < 0.01) steady = s;
            if (steady >= 0 && s - steady >= 0 && s - steady < 10 * 60 && s % 6 === 0) {
                const u = water.uOf(upstream);
                sumQ += qc;
                sumH += water.b[upstream] + water.h[upstream] - step + (u * u) / (2 * G);
                n++;
            }
        });
        assert.ok(steady >= 0 && n > 0, "el caudal de la cresta no alcanzó el aporte");
        const q = sumQ / n;
        const head = sumH / n;
        const expected = Math.sqrt(G) * ((2 * head) / 3) ** 1.5;
        report(
            t,
            `W10 escalón ${step} m`,
            `q en la cresta ${fmt(q)} m²/s con H = ${fmt(head)} m (aporte ${fmt(flow)} m²/s), cociente ${fmt(q / expected)}`,
            `q(H) = ${fmt(expected)} m²/s`,
            `±15 % (error ${fmt((100 * (q - expected)) / expected)} %)`
        );
        assert.ok(rel(q, expected) < 0.15);
    });
}

const SG_A = MATERIALS.acid.SG;
const W_A = MATERIALS.acid.species.H2SO4;

/** Pone en la columna `i` el `A` que da la fracción másica `w` con su `h` actual y sin miel (inversa de `acidRatio`). */
function setAcid(water, i, w) {
    water.A[i] = (w * SIGMA_W * water.h[i]) / (1 - (w * (SG_A - 1)) / (SG_A * W_A));
}

/** Cantidad de columnas con `h > hDry` y `A` o `w` fuera del principio del máximo (A < −1e-12 o w > w_a + 1e-9). */
function maxPrincipleViolations(water) {
    let bad = 0;
    for (let i = 0; i < water.N; i++) {
        if (water.h[i] <= water.config.hDry) continue;
        if (water.A[i] < -1e-12 || water.acidRatio(i) > W_A + 1e-9) bad++;
    }
    return bad;
}

test("Q1a conservación de la masa de H2SO4 en la rotura de presa con ácido del lado alto y 20 depósitos por paso, 60 s", (t) => {
    const water = damBreakDry("Q1a");
    for (let i = 0; i < water.N; i++) if (water.h[i] > 0) setAcid(water, i, 0.04);
    const areaP = 0.0081;
    const acidP = SG_A * SIGMA_W * areaP * W_A;
    let seed = 777;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const start = water.acid();
    let deposited = 0;
    let worst = 0;
    run(water, 60, () => {
        for (let k = 0; k < 20; k++) {
            water.deposit(1 + 41 * random(), areaP, 0, 0, 0, acidP);
            deposited += acidP;
        }
        water.step(DT);
        worst = Math.max(worst, rel(water.acid(), start + deposited));
    });
    report(t, "Q1a", `error relativo máx de Σ A dx ${fmt(worst)} (inicial ${fmt(start)} kg, depositado ${fmt(deposited)} kg)`, "Σ A dx = inicial + depositado", "< 1e-6");
    assert.ok(worst < 1e-6);
});

test("Q2b la densidad de la columna es ρ_w (1 + 6,8 · (100 w) / 998,2) y coincide con tres puntos de la tabla CRC (±0,1 %)", (t) => {
    const water = make(LEVEL, WATER_FIELD, "Q2b");
    const points = [[0.01, 1.00671], [0.04, 1.02686], [0.08, 1.0541]];
    points.forEach(([w, crc], k) => {
        const i = Math.round((24 + k * 2 - water.x0) / water.dx);
        setAcid(water, i, w);
        const ratio = water.densityAt(water.center(i)) / 1000;
        const formula = 1 + (6.8 * 100 * w) / 998.2;
        report(t, `Q2b w ${100 * w} %`, `ρ_col/ρ_w = ${fmt(ratio)} (fórmula ${fmt(formula)}, CRC ${crc})`, `${crc} (CRC)`, "±0,1 % contra CRC y contra la fórmula");
        assert.ok(rel(ratio, formula) < 1e-3);
        assert.ok(rel(ratio, crc) < 1e-3);
    });
    assert.equal(water.densityAt(water.center(Math.round((30 - water.x0) / water.dx))), 1000);
});

test("Q3 pileta en reposo con ácido al 8 % en x 18 a 28: |Δw| de las columnas vecinas a x 28 < 8e-4 en 10 s", (t) => {
    const water = make(LEVEL, WATER_FIELD, "Q3");
    for (let i = 0; i < water.N; i++) {
        const x = water.center(i);
        if (x > 18 && x < 28) setAcid(water, i, W_A);
    }
    const left = Math.round((27.95 - water.x0 - 0.05) / water.dx);
    const right = left + 1;
    const before = [water.acidRatio(left), water.acidRatio(right)];
    let worst = 0;
    run(water, 10, () => {
        worst = Math.max(worst, Math.abs(water.acidRatio(left) - before[0]), Math.abs(water.acidRatio(right) - before[1]));
    });
    report(t, "Q3", `máx |Δw| ${fmt(worst)} (columnas x = ${fmt(water.center(left))} y ${fmt(water.center(right))}; w inicial ${fmt(before[0])} y ${fmt(before[1])})`, "difusión numérica 0 con u = 0", "< 8e-4");
    assert.ok(before[0] > 0.0799 && before[1] === 0);
    assert.ok(worst < 8e-4);
});

test("Q4 conductividad lineal en w: 32 S/m al 8 % (±5 %), la del agua con w = 0 y residuo de la recta < 1e-9", (t) => {
    const water = make(LEVEL, WATER_FIELD, "Q4");
    const ws = [0, 0.003, 0.04, 0.08];
    const xs = ws.map((w, k) => {
        const i = Math.round((22 + 2 * k - water.x0) / water.dx);
        setAcid(water, i, w);
        return { w: water.acidFraction(i), sigma: water.conductivityAt(water.center(i)) };
    });
    const n = xs.length;
    const mw = xs.reduce((a, p) => a + p.w, 0) / n;
    const ms = xs.reduce((a, p) => a + p.sigma, 0) / n;
    const slope = xs.reduce((a, p) => a + (p.w - mw) * (p.sigma - ms), 0) / xs.reduce((a, p) => a + (p.w - mw) ** 2, 0);
    const residual = Math.max(...xs.map((p) => Math.abs(p.sigma - (ms + slope * (p.w - mw)))));
    report(t, "Q4", `σ_e = ${xs.map((p) => fmt(p.sigma)).join(", ")} S/m para w = ${ws.join(", ")}; residuo ${fmt(residual)}`, "32 S/m al 8 %, 5e-3 S/m con w = 0, lineal", "±5 % al 8 %, residuo < 1e-9");
    assert.ok(rel(xs[3].sigma, 32) < 0.05);
    assert.equal(xs[0].sigma, MATERIALS.water.sigmaE);
    assert.ok(residual < 1e-9);
});

test("Q6 principio del máximo del trazador de ácido: (a) rotura de presa con ácido al 8 % solo del lado alto y (b) w uniforme se mantiene uniforme", (t) => {
    const dry = damBreakDry("Q6a");
    for (let i = 0; i < dry.N; i++) if (dry.h[i] > 0) setAcid(dry, i, W_A);
    let violations = 0;
    let worstExcess = 0;
    run(dry, 6, () => {
        violations += maxPrincipleViolations(dry);
        for (let i = 0; i < dry.N; i++) if (dry.h[i] > dry.config.hDry) worstExcess = Math.max(worstExcess, dry.acidRatio(i) - W_A, -dry.A[i]);
    });
    report(t, "Q6a", `${violations} columnas fuera del principio del máximo en 6 s (exceso máx ${fmt(worstExcess)})`, "0 columnas con A < −1e-12 o w > w_a + 1e-9", "margen 1e-9");
    assert.equal(violations, 0);

    const uniform = damBreakDry("Q6b");
    for (let i = 0; i < uniform.N; i++) if (uniform.h[i] > 0) setAcid(uniform, i, 0.04);
    for (const seconds of [1, 3]) {
        run(uniform, seconds === 1 ? 1 : 2);
        let worst = 0;
        for (let i = 0; i < uniform.N; i++) if (uniform.h[i] > uniform.config.hDry) worst = Math.max(worst, Math.abs(uniform.acidRatio(i) - 0.04));
        report(t, `Q6b t=${seconds} s`, `max|w − 0,04| = ${fmt(worst)}`, "w constante", "< 1e-12");
        assert.ok(worst < 1e-12);
    }
});

test("Q5 fieldColor: con w = 0 es exactamente draw.color, crece monótona hacia el tinte con w y no comparte buffer entre llamadas", (t) => {
    const water = make(LEVEL, WATER_FIELD, "Q5");
    const base = WATER_FIELD.draw.color;
    const tint = MATERIALS.acid.tint;
    const x = (i) => water.center(i);
    const ws = [0, 0.003, 0.02, 0.04, 0.08];
    ws.forEach((w, k) => setAcid(water, 190 + 3 * k, w));
    const colors = ws.map((w, k) => fieldColor(water, x(190 + 3 * k)));
    assert.deepEqual(colors[0], base);
    for (let k = 1; k < colors.length; k++) {
        for (let c = 0; c < 3; c++) {
            const lo = Math.min(base[c], tint[c]);
            const hi = Math.max(base[c], tint[c]);
            assert.ok(colors[k][c] >= lo && colors[k][c] <= hi);
            assert.ok(Math.abs(colors[k][c] - tint[c]) <= Math.abs(colors[k - 1][c] - tint[c]), `canal ${c} no monótono en w = ${ws[k]}`);
        }
    }
    assert.notStrictEqual(colors[0], colors[1]);
    const out = [0, 0, 0];
    assert.strictEqual(fieldColor(water, x(190), out), out);
    report(t, "Q5 fieldColor", ws.map((w, k) => `w ${100 * w} %: [${colors[k]}]`).join("; "), "w = 0 → draw.color; monótono hacia el tinte", "igualdad exacta");
});

test("WaterView: relleno plano sin ácido y degradado con una parada cada colorStep celdas y en las dos caras en el tramo con ácido", () => {
    const PIXI = installFakePixi();
    const water = make(LEVEL, WATER_FIELD, "WaterView");
    const view = new WaterView({ parent: new PIXI.Container(), pixelsPerMeter: 32 });
    const SCREEN_SCALE = 20;
    view.draw(water, SCREEN_SCALE);
    assert.equal(view.gradients.length, 0);
    assert.equal(view.graphics.fills[0].color, `rgb(${WATER_FIELD.draw.color.join(", ")})`);
    const i = Math.round((24 - water.x0) / water.dx);
    setAcid(water, i, 0.04);
    view.draw(water, SCREEN_SCALE);
    assert.equal(view.gradients.length, 1);
    const [gradient] = view.gradients;
    assert.strictEqual(view.graphics.fills[0].fill, gradient);
    const wet = [];
    for (let c = 0; c < water.N; c++) if (water.h[c] > water.config.hDry) wet.push(c);
    const cells = wet.filter((c) => c >= Math.round((18 - water.x0) / water.dx) && c < Math.round((38 - water.x0) / water.dx)).length;
    assert.equal(gradient.colorStops.length, 2 + Math.ceil(cells / WATER_FIELD.draw.colorStep));
    assert.equal(gradient.colorStops[0].offset, 0);
    assert.equal(gradient.colorStops.at(-1).offset, 1);
    for (let k = 1; k < gradient.colorStops.length; k++) assert.ok(gradient.colorStops[k].offset >= gradient.colorStops[k - 1].offset);
    view.draw(water, SCREEN_SCALE);
    assert.equal(gradient.destroyed, true, "el degradado del frame anterior se destruye");
});
test("C1 (#111) consolidate: película fina en varias celdas sobre lecho plano deja las mojadas en ≥ hMin o aisladas y conserva h, q, E, M y A (1e-12)", (t) => {
    const water = make(tank(20), WATER_FIELD, "C1");
    const { hMin } = water.config;
    const start = Math.round(8 / water.dx);
    const heights = [0.3, 0.4, 0.5, 0.2, 0.7, 0.35, 0.6, 0.45];
    heights.forEach((f, k) => {
        const i = start + k;
        water.h[i] = f * hMin;
        water.q[i] = 1e-3 * (k + 1);
        water.E[i] = 5 * water.h[i];
        water.M[i] = 0.1 * water.h[i];
        water.A[i] = 0.2 * water.h[i];
    });
    const sums = () => [water.volume(), water.momentum(), water.energy(), water.honey(), water.acid()];
    const before = sums();
    water.consolidate();
    const after = sums();
    const dropped = water.stats.droppedMomentum;
    let thin = 0;
    for (let i = 0; i < water.N; i++) {
        if (water.h[i] <= 0 || water.h[i] >= hMin) continue;
        const lonely = (i === 0 || water.h[i - 1] <= 0) && (i === water.N - 1 || water.h[i + 1] <= 0);
        if (!lonely) thin++;
    }
    const errors = before.map((v, k) => rel(after[k] + (k === 1 ? dropped : 0), v));
    report(t, "C1", `${thin} columnas finas con vecina mojada; errores relativos de las cinco sumas ${errors.map(fmt).join(", ")}`, "0 columnas finas con vecina mojada; sumas conservadas", "≤ 1e-12");
    assert.equal(thin, 0);
    for (const e of errors) assert.ok(e <= 1e-12);
});
