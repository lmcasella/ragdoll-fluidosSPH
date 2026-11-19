/**
 * Escenarios del usuario del 19/11 (#109) sobre la escena real: el script de `index.html` con LiquidFun real y
 * gamepad simulado. U1 (gotas sobre una isla seca, #111), U2 (tanque de miel en la pileta, #110), U3 (tanque de
 * ácido en la pileta, #98) y U4 (lluvia y disparos durante 30 s, #101). Cada prueba mide lo que existe hoy y, si
 * un criterio falla, se marca `todo` con el issue que lo arregla y el valor medido contra el esperado. Con
 * `USER_SCENARIOS_RECORD=<carpeta>` cada escenario se graba con el grabador de #67 (un registro cada
 * `RECORD_STRIDE` frames) para reproducirlo en `tests/tools/viewer.html`; sin la variable no se graba.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadGame } from "./helpers/game.js";
import { recordGame } from "./helpers/recorder.js";
import { runStandardScene, AREA_TOLERANCE, MATERIAL_NAMES, STEPS_PER_SECOND } from "./helpers/invariants-run.js";

const { LEVEL } = await import("../js/level.js");
const { MATERIALS, SIGMA_W } = await import("../js/materials.js");
const { SINK, ORIGIN } = await import("../js/particleStore.js");
const { FLUID, weaponById } = await import("../js/weapons.js");
const { PARTICLE } = await import("../js/particles.js");
const { WATER_FIELD } = await import("../js/water.js");

/** Carpeta de grabación (vacía: no se graba) y frames entre registros grabados. */
const RECORD_DIR = process.env.USER_SCENARIOS_RECORD ?? "";
const RECORD_STRIDE = 3;

/** Botones del mapeo "standard": gatillo derecho (disparo) y RB (arma siguiente). */
const BUTTON_FIRE = 7;
const BUTTON_NEXT_WEAPON = 5;

const G = 10;
const WEAPON_ORDER = [FLUID.WATER, FLUID.ACID, FLUID.LAVA, FLUID.HONEY];

const num = (v, digits = 3) => Number(v).toPrecision(digits);
const pct = (v) => `${num(v * 100, 3)} %`;

function recorderFor(game, name) {
    return RECORD_DIR ? recordGame(game, name, { dt: RECORD_STRIDE / STEPS_PER_SECOND }) : null;
}

function save(recorder, name) {
    if (recorder) recorder.save(join(RECORD_DIR, `${name}.json`));
}

/** Un frame del juego; graba cada `RECORD_STRIDE` frames si hay grabador. */
function tick(game, recorder, frame) {
    game.frame();
    if (recorder && frame % RECORD_STRIDE === 0) recorder.capture();
}

async function start() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

/** Crea partículas sueltas en el sistema de disparos con el `ParticleStore` del juego; `dispose` libera lo nativo. */
function dropper(game) {
    const { store } = game.state;
    const def = new Box2D.b2ParticleDef();
    const position = new Box2D.b2Vec2(0, 0);
    const velocity = new Box2D.b2Vec2(0, 0);
    const colors = new Map(WEAPON_ORDER.map((id) => [id, new Box2D.b2ParticleColor(...weaponById(id).color, 255)]));
    return {
        spawn(kind, x, y, vx = 0, vy = 0) {
            position.set_x(x);
            position.set_y(y);
            velocity.set_x(vx);
            velocity.set_y(vy);
            def.set_position(position);
            def.set_velocity(velocity);
            def.set_color(colors.get(kind));
            def.set_flags(weaponById(kind).flags | PARTICLE.CONTACT_LISTENER);
            return store.create(def, { kind, origin: ORIGIN.SHOT });
        },
        dispose() {
            Box2D.destroy(def);
            Box2D.destroy(position);
            Box2D.destroy(velocity);
            for (const color of colors.values()) Box2D.destroy(color);
        },
    };
}

/**
 * Dispara el tanque entero de `kind` del jugador 0 hacia `(targetX, targetY)` con el tiro balístico de ángulo
 * bajo, equipando el arma con RB, y sigue hasta `seconds` desde que empezó a apretar el gatillo. Devuelve las
 * partículas emitidas.
 */
function fireTank(game, kind, targetX, targetY, seconds, recorder) {
    const player = game.state.players[0];
    const weapon = weaponById(kind);
    let guard = 0;
    while (player.weapon !== kind && guard++ < WEAPON_ORDER.length) {
        game.setPad(0, { buttons: [BUTTON_NEXT_WEAPON] });
        tick(game, recorder, 0);
        game.setPad(0);
        tick(game, recorder, 0);
    }
    assert.equal(player.weapon, kind, "el arma quedó equipada");
    const muzzle = player.muzzle();
    const dx = targetX - muzzle.x;
    const dy = targetY - muzzle.y;
    const v2 = weapon.speed ** 2;
    const root = v2 * v2 - G * (G * dx * dx + 2 * dy * v2);
    assert.ok(root >= 0, "el blanco está al alcance del arma");
    const angle = Math.atan((v2 - Math.sqrt(root)) / (G * dx));
    const before = game.state.store.created[kind];
    const frames = Math.round(seconds * STEPS_PER_SECOND);
    for (let f = 0; f < frames; f++) {
        const empty = (player.tanks.get(kind) ?? 0) === 0;
        game.setPad(0, { buttons: empty ? [] : [BUTTON_FIRE], axes: [0, 0, Math.cos(angle), -Math.sin(angle)] });
        tick(game, recorder, f);
    }
    game.setPad(0);
    return game.state.store.created[kind] - before;
}

/**
 * Cierra la prueba: si algún criterio falló, la marca `todo` con los issues y las medidas contra lo esperado, y
 * deja constancia de la falla; si todos pasaron, la prueba pasa.
 */
function verdict(t, checks) {
    const failed = checks.filter((c) => !c.ok);
    for (const c of checks) t.diagnostic(`${c.ok ? "ok" : "FALLA"} ${c.name}: ${c.detail}`);
    if (failed.length > 0) t.todo(failed.map((c) => `${c.issue}: ${c.name}, medido ${c.detail}`).join(" | "));
    assert.equal(failed.length, 0, failed.map((c) => `${c.name}: ${c.detail}`).join(" | "));
}

test("U1 (#111): 10 gotas sobre una isla seca; a los 10 s el ancho mojado es ≤ V/h_min + 2 dx y el volumen se conserva (< 1e-6)", async (t) => {
    const game = await start();
    const { water, store, immersion } = game.state;
    const recorder = recorderFor(game, "u1-gotas-isla-seca");
    const drops = dropper(game);
    const v0 = water.volume();
    for (let k = 0; k < 10; k++) drops.spawn(FLUID.WATER, 13 + 0.12 * k, 9 + 0.4 * k);
    drops.dispose();
    for (let f = 0; f < 10 * STEPS_PER_SECOND; f++) tick(game, recorder, f);
    save(recorder, "u1-gotas-isla-seca");

    const absorbed = store.destroyed[SINK.ABSORBED][FLUID.WATER];
    const injected = absorbed * immersion.area;
    const gained = water.volume() - v0;
    const { h, b, dx } = water;
    const { hDry, hMin } = water.config;
    let wet = 0;
    let thin = 0;
    for (let i = 0; i < water.N; i++) {
        if (b[i] > 0 && h[i] > hDry) {
            wet += dx;
            if (h[i] < hMin) thin++;
        }
    }
    const limit = injected / WATER_FIELD.hMin + 2 * dx;
    const conserved = Math.abs(gained - injected) / injected;
    assert.ok(absorbed > 0, "al menos una gota llegó al campo");
    t.diagnostic(`gotas: ${store.created[FLUID.WATER]} creadas, ${absorbed} absorbidas por el campo, ${Object.entries(SINK).map(([cause, id]) => `${cause} ${store.destroyed[id][FLUID.WATER]}`).join(", ")}`);
    verdict(t, [
        { name: "ancho mojado ≤ V/h_min + 2 dx", issue: "#111", ok: wet <= limit, detail: `${num(wet)} m (${thin} celdas más finas que h_min) contra ≤ ${num(limit)} m, V = ${num(injected)} m²` },
        { name: "volumen conservado < 1e-6", issue: "#111", ok: conserved < 1e-6, detail: `${conserved.toExponential(2)} contra < 1e-6` },
    ]);
});

test("U2 (#110): un tanque de miel a la pileta; a los 10 s la masa de miel en partículas = inyectada (< 1e-6), Σ M dx = 0 y el centroide queda bajo la mitad de la profundidad", async (t) => {
    const game = await start();
    const { water, store, particleSystem } = game.state;
    const recorder = recorderFor(game, "u2-miel-en-pileta");
    const injected = fireTank(game, FLUID.HONEY, 24, LEVEL.pool.surface, 10, recorder);
    save(recorder, "u2-miel-en-pileta");

    const pos = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    let alive = 0;
    let sumY = 0;
    for (let i = 0; i < particleSystem.GetParticleCount(); i++) {
        const slot = store.slotAt(i);
        if (slot < 0 || store.alive[slot] === 0 || store.kind[slot] !== FLUID.HONEY) continue;
        alive++;
        sumY += Box2D.HEAPF32[pos + 2 * i + 1];
    }
    const half = LEVEL.pool.bottom + (LEVEL.pool.surface - LEVEL.pool.bottom) / 2;
    const centroid = alive > 0 ? sumY / alive : NaN;
    const missing = Math.abs(alive - injected) / injected;
    const field = water.honey();
    assert.ok(injected > 0, "el tanque disparó miel");
    verdict(t, [
        { name: "masa de miel en partículas = inyectada", issue: "#110", ok: missing < 1e-6, detail: `${alive} de ${injected} partículas, error relativo ${missing.toExponential(2)} contra < 1e-6` },
        { name: "Σ M dx = 0", issue: "#110", ok: field === 0, detail: `${field.toExponential(3)} m² (${num(field / game.state.immersion.area, 4)} partículas) contra 0` },
        { name: "centroide de la miel bajo la mitad de la profundidad", issue: "#110", ok: centroid < half, detail: `${Number.isNaN(centroid) ? "sin partículas de miel" : `y = ${num(centroid)} m de las ${alive} partículas que quedan`} contra < ${half} m` },
    ]);
});

test("U3 (#98 y #110): un tanque de ácido a la pileta; concentración media = m_H2SO4 / m_total (±1 %) y ρ_col = 998 + 6,8 · w[%] (±0,1 %)", async (t) => {
    const game = await start();
    const { water, store, immersion } = game.state;
    const recorder = recorderFor(game, "u3-acido-en-pileta");
    const v0 = water.volume();
    const injected = fireTank(game, FLUID.ACID, 24, LEVEL.pool.surface, 10, recorder);
    save(recorder, "u3-acido-en-pileta");

    const absorbed = store.destroyed[SINK.ABSORBED][FLUID.ACID];
    const acidMass = MATERIALS.acid.SG * SIGMA_W * immersion.area;
    const acidInH2SO4 = absorbed * acidMass * MATERIALS.acid.species.H2SO4;
    const total = SIGMA_W * v0 + absorbed * acidMass;
    const expectedW = acidInH2SO4 / total;
    const fieldH2SO4 = 0;
    const measuredW = fieldH2SO4 / total;
    let sum = 0;
    let columns = 0;
    for (let i = 0; i < water.N; i++) {
        if (water.b[i] === 0 && water.h[i] > water.config.hDry) {
            sum += water.densityAt(water.center(i));
            columns++;
        }
    }
    const rho = sum / columns;
    const expectedRho = 998 + 6.8 * expectedW * 100;
    const rhoError = Math.abs(rho - expectedRho) / expectedRho;
    const wError = Math.abs(measuredW - expectedW) / expectedW;
    assert.ok(injected > 0, "el tanque disparó ácido");
    assert.ok(absorbed > 0, "el ácido llegó al campo");
    verdict(t, [
        { name: "concentración media de H2SO4 = m_H2SO4 / m_total", issue: "#98", ok: wError <= 0.01, detail: `w = ${pct(measuredW)} (el campo no tiene trazador de H2SO4: 0 kg) contra ${pct(expectedW)} (${num(acidInH2SO4)} kg de ${num(total)} kg; ${absorbed} de ${injected} partículas absorbidas), error relativo ${pct(wError)} contra ±1 %` },
        { name: "ρ_col = 998 + 6,8 · w[%]", issue: "#98", ok: rhoError <= 0.001, detail: `${num(rho, 6)} kg/m³ contra ${num(expectedRho, 6)} kg/m³, error relativo ${pct(rhoError)} contra ±0,1 %` },
    ]);
});

test("U4 (#101): lluvia y disparos durante 30 s; el área dibujada = la física por material (±5 %), con la medición de I3p e I3f", async (t) => {
    const name = "u4-lluvia-y-disparos";
    let recorder = null;
    const run = await runStandardScene({
        windowSeconds: 30,
        leadSeconds: 5,
        onStart: (game) => {
            recorder = recorderFor(game, name);
        },
        onFrame: (game, frame) => {
            if (recorder && frame % RECORD_STRIDE === 0) recorder.capture();
        },
    });
    save(recorder, name);
    t.diagnostic(`ventana ${num(run.seconds)} s de 30 (${run.steps} pasos)${run.roundEnded ? ", la ronda terminó antes" : ""}; pico de partículas ${JSON.stringify(run.peak)}`);
    assert.ok(run.seconds >= 29, `la ventana duró ${run.seconds} s`);

    const checks = [];
    for (const n of MATERIAL_NAMES) {
        const track = run.i3p[n];
        if (track.evals === 0) continue;
        const info = track.maxInfo;
        checks.push({
            name: `partículas de ${n}`,
            issue: "#101",
            ok: track.fails === 0,
            detail: `dibujado ${num(info.drawn)} m² contra n · A_p = ${num(info.physical)} m² (n = ${info.n}) en el peor paso: ${pct(track.max)}; fuera de ±${pct(AREA_TOLERANCE)} en ${track.fails} de ${track.evals} pasos`,
        });
    }
    const field = run.i3f.water;
    checks.push({
        name: "campo, agua",
        issue: "#101",
        ok: field.fails === 0,
        detail: `waterOutline ${num(field.maxInfo.drawn)} m² contra Σ h dx = ${num(field.maxInfo.physical)} m² en el peor paso: ${pct(field.max)}; fuera de tolerancia en ${field.fails} de ${field.evals} pasos`,
    });
    verdict(t, checks);
});
