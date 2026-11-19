/**
 * Invariantes globales de fluidos (docs/design/14-agua.md §14.16 G, #108) sobre la escena real del juego: masa por
 * especie (I1), identidad (I2), volumen dibujado igual al físico (I3) y espesor mínimo (I4). La escena corre una
 * vez (`runStandardScene`) y cada prueba lee su serie. Lo que falla hoy se marca `todo` con el issue que lo
 * arregla y la falla medida; si una medida pasa, la prueba pasa sin `todo`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    runStandardScene,
    MASS_TOLERANCE,
    AREA_TOLERANCE,
    MIN_WINDOW_SECONDS,
    WINDOW_SECONDS,
    SPECIES,
    MATERIAL_NAMES,
} from "./helpers/invariants-run.js";
import { UnionArea, CELL, polygonArea } from "./helpers/drawn-area.js";

const { ShallowWater } = await import("../js/water.js");
const { waterOutline, dropShape, SHOT_DRAW } = await import("../js/render.js");

const run = await runStandardScene();
const num = (v, digits = 3) => Number(v).toPrecision(digits);
const pct = (v) => `${num(v * 100, 3)} %`;
const books = run.books;
const cause = (name, material) => books.destroyed[name][material];

/**
 * Marca `todo` con los issues que explican la falla y la medida, y exige que no haya fallado. `causes` son pares
 * `[activa, issue]`: solo cuentan los issues cuya causa aparece en el libro de masa de la escena. Si la serie
 * falla y ninguna causa conocida está activa, la prueba falla sin `todo`.
 */
function verdict(t, track, causes, detail) {
    const issues = causes.filter(([active]) => active).map(([, issue]) => issue);
    if (track.fails > 0 && issues.length > 0) t.todo(`${issues.join(" y ")}: ${detail}`);
    assert.equal(track.fails, 0, `${track.name}: ${track.fails} de ${track.evals} evaluaciones fuera de tolerancia sin causa conocida; ${detail}`);
}

const massDetail = (track) =>
    `|R|/denominador máx ${num(track.max)} (paso ${track.maxStep}, R = ${num(track.maxInfo?.kg)} kg de ${num(track.maxInfo?.den)} kg), ` +
    `falla en ${track.fails} de ${track.evals} pasos (el primero, ${track.firstFail}); esperado < ${MASS_TOLERANCE}`;

const acidAbsorbed = cause("ABSORBED", "acid");
const expiredWaterAcid = cause("EXPIRED", "water") + cause("EXPIRED", "acid");
const hitAcid = cause("HIT", "acid");
const expiredLava = cause("EXPIRED", "lava");

test("escena estándar: la ventana dura el mínimo exigido y los sumideros de la escena", (t) => {
    t.diagnostic(
        `ventana ${num(run.seconds)} s de ${WINDOW_SECONDS} (${run.steps} pasos)${run.roundEnded ? `, la ronda terminó antes (primera muerte: jugador ${run.firstDeath?.player + 1} en el paso ${run.firstDeath?.step})` : ""}`,
    );
    t.diagnostic(`creadas ${JSON.stringify(books.created)}`);
    for (const name of ["ABSORBED", "OUT", "EXPIRED", "PERSIST_CAP", "HIT", "EVAPORATED"]) t.diagnostic(`${name} ${JSON.stringify(books.destroyed[name])}`);
    t.diagnostic(`pico de partículas vivas ${JSON.stringify(run.peak)}`);
    assert.ok(run.seconds >= MIN_WINDOW_SECONDS, `la ventana duró ${run.seconds} s, mínimo ${MIN_WINDOW_SECONDS} s`);
});

test("precondición: 1e-6 · denominador < 0,1 · masa de la partícula más liviana en cada evaluación", () => {
    for (const track of Object.values(run.guard)) {
        assert.ok(track.evals > 0, `${track.name}: sin evaluaciones`);
        assert.equal(track.fails, 0, `${track.name}: la tolerancia no distingue una partícula (razón máx ${num(track.max)}, paso ${track.maxStep})`);
    }
});

const ACID_CAUSES = [
    [acidAbsorbed > 0, "#98"],
    [expiredWaterAcid > 0, "#73"],
    [hitAcid > 0, "#19"],
];

const I1_CAUSES = {
    H2O: [ACID_CAUSES, () => `ácido absorbido sin trazador: ${acidAbsorbed} partículas depositadas como agua; vencimiento D5 de agua y ácido (EXPIRED): ${expiredWaterAcid}; ácido destruido al dañar (HIT): ${hitAcid}`],
    H2SO4: [ACID_CAUSES, () => `H2SO4 del ácido absorbido (${acidAbsorbed} partículas) desaparece sin trazador; EXPIRED agua y ácido: ${expiredWaterAcid}; HIT: ${hitAcid}`],
    honey: [[], () => `tope PERSIST_CAP: ${cause("PERSIST_CAP", "honey")} partículas`],
    basalt: [[[expiredLava > 0, "#75"]], () => `vencimiento D5 de la lava (EXPIRED): ${expiredLava} partículas`],
};

for (const s of SPECIES) {
    test(`I1 masa de ${s}: |R_s| / Σ w (F_k(0) + I_k) < 1e-6 en cada paso`, (t) => {
        const track = run.i1[s];
        assert.ok(track.evals > 0, `${s}: la especie nunca entró en la escena`);
        const [causes, why] = I1_CAUSES[s];
        verdict(t, track, causes, `${massDetail(track)}; ${why()}`);
    });
}

test("I2a identidad: store.kind no cambia entre create y destroy (0 cambios)", () => {
    assert.ok(run.i2a.creations > 0);
    assert.equal(run.i2a.changes, 0, `${run.i2a.changes} cambios de kind en ${run.i2a.creations} partículas`);
});

const I2_CAUSES = {
    water: [[[acidAbsorbed > 0, "#98"], [cause("EXPIRED", "water") > 0, "#73"]], () => `el ácido absorbido (${acidAbsorbed} partículas) entra como agua; EXPIRED agua: ${cause("EXPIRED", "water")}`],
    acid: [ACID_CAUSES, () => `ácido absorbido sin trazador (${acidAbsorbed} partículas); EXPIRED: ${cause("EXPIRED", "acid")}; HIT: ${hitAcid}`],
    honey: [[], () => `tope PERSIST_CAP: ${cause("PERSIST_CAP", "honey")} partículas`],
    lava: [[[expiredLava > 0, "#75"]], () => `vencimiento D5 de la lava (EXPIRED): ${expiredLava} partículas`],
};

for (const n of MATERIAL_NAMES) {
    test(`I2b balance de ${n}: |P + F + OUT − F(0) − I| / (F(0) + I) < 1e-6 en cada paso`, (t) => {
        const track = run.i2b[n];
        assert.ok(track.evals > 0, `${n}: el material nunca entró en la escena`);
        const [causes, why] = I2_CAUSES[n];
        verdict(t, track, causes, `${massDetail(track)}; ${why()}`);
    });
}

test("calibración de I3: la grilla de 2,5 mm mide un círculo de r = 0,07 m con error < 1 %", () => {
    const union = new UnionArea();
    const out = new Float64Array(4);
    union.addCircle(0, 12.3456, 4.7891, 0.07);
    union.areas(out);
    const exact = Math.PI * 0.07 ** 2;
    assert.equal(CELL, 0.0025);
    assert.ok(Math.abs(out[0] - exact) / exact < 0.01, `área ${out[0]} contra ${exact}`);
});

test("calibración de I3: la unión no cuenta dos veces lo solapado y separa materiales; la cápsula mide largo · ancho + extremos", () => {
    const union = new UnionArea();
    const out = new Float64Array(4);
    union.addCircle(0, 5, 5, 0.07);
    union.addCircle(0, 5, 5, 0.07);
    union.addCircle(1, 5, 5, 0.07);
    union.addCapsule(2, 8, 5, 8, 5.7, 0.025);
    union.areas(out);
    const circle = Math.PI * 0.07 ** 2;
    assert.ok(Math.abs(out[0] - circle) / circle < 0.01);
    assert.equal(out[1], out[0]);
    const capsule = 0.7 * 0.025 + Math.PI * 0.0125 ** 2;
    assert.ok(Math.abs(out[2] - capsule) / capsule < 0.02, `cápsula ${out[2]} contra ${capsule}`);
});

test("waterOutline: el área del polígono es exactamente Σ h dx de las celdas mojadas", () => {
    const water = new ShallowWater();
    const hDry = water.config.hDry;
    for (let i = 0; i < water.N; i++) water.h[i] = 0;
    for (let i = 100; i < 140; i++) water.h[i] = 0.5 + 0.01 * (i % 7);
    for (let i = 300; i < 303; i++) water.h[i] = 2;
    water.h[400] = 5e-4;
    water.h[401] = 0.2;
    const outline = {};
    waterOutline(water, outline);
    let area = 0;
    for (let s = 0; s < outline.count; s++) area += polygonArea(outline.xs, outline.ys, outline.start[s], outline.size[s]);
    let expected = 0;
    for (let i = 0; i < water.N; i++) if (water.h[i] > hDry) expected += water.h[i] * water.dx;
    assert.equal(outline.count, 3);
    assert.ok(Math.abs(area - expected) < 1e-9, `área ${area} contra ${expected}`);
});

test("dropShape: círculo, segundo círculo junto a un cuerpo y trazo de lluvia", () => {
    const out = {};
    dropShape(10, 20, 0, 0, false, SHOT_DRAW, out);
    assert.deepEqual([out.capsule, out.count, out.radius], [false, 1, SHOT_DRAW.radius]);
    dropShape(10, 20, 0, -8, false, SHOT_DRAW, out);
    assert.equal(out.capsule, false, "una gota que no es de lluvia nunca se dibuja como trazo");
    dropShape(10, 20, 0, -8, true, SHOT_DRAW, out);
    assert.equal(out.capsule, true);
    assert.equal(out.width, SHOT_DRAW.streakWidth);
    assert.ok(Math.abs(Math.hypot(out.x1 - out.x0, out.y1 - out.y0) - 8 * SHOT_DRAW.streakScale) < 1e-12);
    dropShape(10, 20, 0, -2, true, SHOT_DRAW, out);
    assert.equal(out.capsule, false, "la lluvia lenta se dibuja como círculo");
});

const i3Detail = (track) => {
    const info = track.maxInfo;
    return `dibujado ${num(info.drawn)} m² contra n · A_p = ${num(info.physical)} m² (n = ${info.n}) en el paso de mayor error: ${pct(track.max)}; falla en ${track.fails} de ${track.evals} pasos (el primero, ${track.firstFail}); esperado ±${pct(AREA_TOLERANCE)}`;
};

for (const n of MATERIAL_NAMES) {
    test(`I3p partículas de ${n}: área dibujada de la unión de primitivas = n · A_p (1 − φ) ±5 %`, (t) => {
        const track = run.i3p[n];
        assert.ok(track.evals > 0, `${n}: no hubo partículas`);
        verdict(t, track, [[true, "#101"]], i3Detail(track));
    });
}

test("I3f campo, agua: área de waterOutline = volumen físico de agua del campo (incluida h ≤ hDry) ±5 %", (t) => {
    const track = run.i3f.water;
    assert.ok(track.evals > 0);
    const info = track.maxInfo;
    t.diagnostic(`error máx ${pct(track.max)} en el paso ${track.maxStep}: dibujado ${num(info.drawn)} m², físico ${num(info.physical)} m², miel en el campo ${num(info.honey)} m²`);
    verdict(t, track, [], `${pct(track.max)} de error con ${num(info.honey)} m² de miel en el campo`);
});

test("I4 espesor mínimo: 0 columnas interiores con hDry < h < hMin al final de cada paso", (t) => {
    const track = run.i4;
    const tips = run.i4tips;
    t.diagnostic(
        `puntas de tramo mojado (excluidas): ${tips.cells} celdas, ${tips.thin} con h < hMin, h mínima ${num(tips.minH)} m; h interior mínima en el peor paso ${num(track.maxInfo?.minInterior)} m`,
    );
    verdict(
        t,
        track,
        [[true, "#111"]],
        `película más fina que hMin: hasta ${track.max} columnas interiores en el paso ${track.maxStep}, en ${track.fails} de ${track.evals} pasos (el primero, ${track.firstFail}); esperado 0`,
    );
});

test("PERSIST_CAP: el tope de miel no se activa en la escena estándar (0 partículas destruidas)", () => {
    assert.equal(cause("PERSIST_CAP", "honey"), 0);
});

test("H2 miel conservada como miel en cada paso: vivas = inyectadas − OUT, 0 absorbidas y SG · σ_w · Σ M dx < 1e-6 · I_honey", () => {
    for (const track of Object.values(run.h2)) assert.ok(track.evals > 0, `${track.name}: sin evaluaciones`);
    const { alive, absorbed, field } = run.h2;
    assert.equal(alive.fails, 0, `partículas de miel vivas distintas de inyectadas − OUT en ${alive.fails} de ${alive.evals} pasos (el primero, ${alive.firstFail}; desvío máx ${alive.max})`);
    assert.equal(absorbed.fails, 0, `miel absorbida (ABSORBED) hasta ${absorbed.max} partículas en ${absorbed.fails} pasos`);
    assert.equal(field.fails, 0, `Σ M dx de miel en el campo hasta ${num(field.max)} kg contra I_honey en ${field.fails} pasos`);
    assert.equal(run.i1.honey.fails, 0);
    assert.equal(run.i2b.honey.fails, 0);
});

test("H6 escena estándar: desplazamiento horizontal del centroide de la miel apoyada en el fondo en 60 s ≤ 0,5 m", (t) => {
    const probe = run.probe;
    t.diagnostic(`partículas de miel que tocaron el fondo de la pileta: ${probe.touchedEver}; máx de miel sumergida en el mismo paso: ${probe.maxSubmerged}`);
    t.diagnostic(`desplazamiento medio máx ${num(probe.maxShift)} m (paso ${probe.maxShiftStep}); |u_c| máx de las columnas bajo la miel del fondo ${num(probe.maxColumnSpeed)} m/s; partículas que volvieron a la superficie desde el fondo: ${probe.resurfacedParticles.size} (${probe.resurfaced} pasos-partícula)`);
    if (probe.touchedEver === 0) {
        t.skip("la escena estándar no lleva miel al fondo de la pileta (0 partículas apoyadas): H6 se mide en U2 y U2b");
        return;
    }
    assert.ok(probe.maxShift <= 0.5, `desplazamiento ${probe.maxShift} m`);
});
test("costo de la suite de invariantes", (t) => {
    const c = run.cost;
    t.diagnostic(
        `total ${num(c.total / 1000)} s; medición ${num((c.mass + c.drawnParticles + c.drawnField + c.thickness) / 1000)} s: masa ${num(c.mass)} ms, I3 partículas ${num(c.drawnParticles)} ms, I3 campo ${num(c.drawnField)} ms, I4 ${num(c.thickness)} ms en ${run.steps} pasos`,
    );
    assert.ok(c.total > 0);
});