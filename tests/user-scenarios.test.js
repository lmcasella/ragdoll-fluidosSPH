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
import { loadGame, giveAllWeapons } from "./helpers/game.js";
import { recordGame } from "./helpers/recorder.js";
import { HoneyProbe } from "./helpers/honey-probe.js";
import { runStandardScene, AREA_TOLERANCE, PARTICLE_AREA_TOLERANCE, AREA_SHARE, AREA_HARD_LIMIT, MATERIAL_NAMES, STEPS_PER_SECOND } from "./helpers/invariants-run.js";

const { LEVEL } = await import("../js/level.js");
const { MATERIALS, SIGMA_W } = await import("../js/materials.js");
const { SINK, ORIGIN } = await import("../js/particleStore.js");
const { FLUID, weaponById } = await import("../js/weapons.js");
const { PARTICLE } = await import("../js/particles.js");
const { WATER_FIELD } = await import("../js/water.js");
const render = await import("../js/render.js");

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

/** Un frame del juego; graba cada `RECORD_STRIDE` frames si hay grabador y llama a `onFrame` si se pasó. */
function tick(game, recorder, frame, onFrame = null) {
    game.frame();
    if (recorder && frame % RECORD_STRIDE === 0) recorder.capture();
    if (onFrame) onFrame();
}

async function start() {
    const game = await loadGame();
    giveAllWeapons(game);
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
 * partículas emitidas. Con `tank` el tanque arranca con esa cantidad (la miel de #214 sale a 200/s con 304: las pruebas
 * de #110 miden los 152 de antes).
 */
function fireTank(game, kind, targetX, targetY, seconds, recorder, onFrame = null, tank = null) {
    const player = game.state.players[0];
    if (tank !== null) player.tanks.set(kind, tank);
    const weapon = weaponById(kind);
    let guard = 0;
    while (player.weapon !== kind && guard++ < WEAPON_ORDER.length) {
        game.setPad(0, { buttons: [BUTTON_NEXT_WEAPON] });
        tick(game, recorder, 0, onFrame);
        game.setPad(0);
        tick(game, recorder, 0, onFrame);
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
        tick(game, recorder, f, onFrame);
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

/**
 * U1 suelta las gotas 4 m sobre la isla con la velocidad inicial de la lluvia (impactan a ~12 m/s): medido, una gota
 * que llega a 8,9 m/s o menos queda apoyada en el piso (y ≈ 4,11 m contra η + r = 4,06 m) y el campo no la absorbe.
 *
 * Mide el campo sobre la isla seca: ancho mojado (celdas con `b > 0` y `h > hDry`), celdas interiores de cada
 * franja mojada más finas que `hMin` y `h` mínima interior (Infinity si no hay interiores).
 */
function wetSurvey(water) {
    const { h, b, dx, N } = water;
    const { hDry, hMin } = water.config;
    let wet = 0;
    let thin = 0;
    let minInterior = Infinity;
    let i = 0;
    while (i < N) {
        if (!(b[i] > 0 && h[i] > hDry)) {
            i++;
            continue;
        }
        let end = i;
        while (end + 1 < N && b[end + 1] > 0 && h[end + 1] > hDry) end++;
        wet += (end - i + 1) * dx;
        for (let k = i + 1; k < end; k++) {
            if (h[k] < hMin) thin++;
            minInterior = Math.min(minInterior, h[k]);
        }
        i = end + 1;
    }
    return { wet, thin, minInterior };
}

test("U1 (#111): 10 gotas sobre una isla seca; en t = 10, 30 y 60 s el ancho mojado es ≤ V/h_min + 2 dx, no hay interiores entre hDry y h_min y el volumen se conserva (< 1e-6)", async (t) => {
    const game = await start();
    const { water, store, immersion } = game.state;
    const recorder = recorderFor(game, "u1-gotas-isla-seca");
    const drops = dropper(game);
    const v0 = water.volume();
    const islandTop = LEVEL.solids[1].y + LEVEL.solids[1].h / 2;
    for (let k = 0; k < 10; k++) drops.spawn(FLUID.WATER, 11 + 0.5 * k, islandTop + 4, 0, -LEVEL.flood.dropSpeed);
    drops.dispose();
    const created = store.created[FLUID.WATER];
    const checkpoints = [10, 30, 60];
    const checks = [];
    let frame = 0;
    for (const seconds of checkpoints) {
        while (frame < seconds * STEPS_PER_SECOND) tick(game, recorder, frame++);
        const absorbed = store.destroyed[SINK.ABSORBED][FLUID.WATER];
        const injected = absorbed * immersion.area;
        const gained = water.volume() - v0 - water.stats.sourced;
        const { wet, thin, minInterior } = wetSurvey(water);
        const limit = injected / WATER_FIELD.hMin + 2 * water.dx;
        const conserved = Math.abs(gained - injected) / injected;
        t.diagnostic(`t = ${seconds} s: ${absorbed} de ${created} gotas absorbidas, ancho mojado ${num(wet)} m, h mínima interior ${Number.isFinite(minInterior) ? num(minInterior) : "sin interiores"} m, límite ${num(limit)} m`);
        checks.push(
            { name: `t = ${seconds} s, ancho mojado ≤ V/h_min + 2 dx`, issue: "#111", ok: wet <= limit, detail: `${num(wet)} m contra ≤ ${num(limit)} m, V = ${num(injected)} m²` },
            { name: `t = ${seconds} s, columnas interiores con hDry < h < hMin`, issue: "#111", ok: thin === 0, detail: `${thin} columnas, h mínima interior ${Number.isFinite(minInterior) ? num(minInterior) : "sin interiores"} m contra 0 columnas` },
            { name: `t = ${seconds} s, volumen conservado < 1e-6`, issue: "#111", ok: conserved < 1e-6, detail: `${conserved.toExponential(2)} contra < 1e-6` },
        );
    }
    save(recorder, "u1-gotas-isla-seca");
    assert.equal(store.destroyed[SINK.ABSORBED][FLUID.WATER], created, "todas las gotas se absorbieron en el campo");
    strict(t, checks);
});
/** Controles de H2 sobre el juego en curso: miel viva = inyectada − `OUT`, 0 absorbida y `SG · σ_w · Σ M dx` < 1e-6 · `I_honey`. */
function honeyConservation(game, label) {
    const { water, store, particleSystem } = game.state;
    let alive = 0;
    for (let i = 0; i < particleSystem.GetParticleCount(); i++) {
        const slot = store.slotAt(i);
        if (slot >= 0 && store.alive[slot] === 1 && store.kind[slot] === FLUID.HONEY) alive++;
    }
    const injected = store.created[FLUID.HONEY];
    const out = store.destroyed[SINK.OUT][FLUID.HONEY];
    const absorbed = store.destroyed[SINK.ABSORBED][FLUID.HONEY];
    const fieldKg = MATERIALS.honey.SG * SIGMA_W * water.honey();
    const injectedKg = injected * MATERIALS.honey.SG * SIGMA_W * game.state.immersion.area;
    return [
        { name: `${label}, partículas de miel vivas = inyectadas − OUT`, issue: "#110", ok: alive === injected - out, detail: `${alive} contra ${injected} − ${out}` },
        { name: `${label}, miel absorbida`, issue: "#110", ok: absorbed === 0, detail: `${absorbed} partículas contra 0` },
        { name: `${label}, SG · σ_w · Σ M dx < 1e-6 · I_honey`, issue: "#110", ok: fieldKg <= 1e-6 * injectedKg, detail: `${fieldKg.toExponential(3)} kg contra < ${(1e-6 * injectedKg).toExponential(3)} kg` },
    ];
}

test("U2 (#110): un tanque de miel a la pileta; H2 a los 10 y 60 s, H4 a los 10 s del último disparo y H6 en 60 s (desplazamiento del fondo ≤ 0,5 m)", async (t) => {
    const game = await start();
    const { store, particleSystem } = game.state;
    const recorder = recorderFor(game, "u2-miel-en-pileta");
    const probe = new HoneyProbe(game);
    let frame = 0;
    let lastShot = 0;
    let created = store.created[FLUID.HONEY];
    const onFrame = () => {
        frame++;
        if (store.created[FLUID.HONEY] > created) {
            created = store.created[FLUID.HONEY];
            lastShot = frame;
        }
        probe.sample();
    };
    const injected = fireTank(game, FLUID.HONEY, 24, LEVEL.pool.surface, 10, recorder, onFrame, 152);
    assert.ok(injected > 0, "el tanque disparó miel");
    const checks = honeyConservation(game, "t = 10 s");

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
    checks.push({ name: "t = 10 s, centroide de la miel bajo la mitad de la profundidad", issue: "#110", ok: centroid < half, detail: `y = ${num(centroid)} m de ${alive} partículas contra < ${half} m` });

    let settledAt = null;
    const total = Math.round(60 * STEPS_PER_SECOND);
    while (frame < total) {
        tick(game, recorder, frame, onFrame);
        if (settledAt === null && frame >= lastShot + 10 * STEPS_PER_SECOND) {
            settledAt = { fraction: probe.settledFraction, submerged: probe.submerged, settled: probe.settled, seconds: (frame - lastShot) / STEPS_PER_SECOND };
        }
    }
    save(recorder, "u2-miel-en-pileta");
    checks.push(...honeyConservation(game, "t = 60 s"));
    checks.push(
        { name: "H4, a los 10 s del último disparo ≥ 90 % de la miel sumergida está a y < pool.bottom + 0,5 m", issue: "#110", ok: settledAt !== null && settledAt.fraction >= 0.9, detail: settledAt ? `${settledAt.settled} de ${settledAt.submerged} (${pct(settledAt.fraction)}) a los ${num(settledAt.seconds)} s del último disparo` : "no se llegó a la medición" },
        { name: "H4, 0 pasos con y > η − 2r desde que toca el fondo", issue: "#110", ok: probe.resurfaced === 0, detail: `${probe.resurfaced} pasos-partícula (${probe.resurfacedParticles.size} partículas)` },
    );
    t.diagnostic(`H6: desplazamiento medio máx de la miel apoyada ${num(probe.maxShift)} m (paso ${probe.maxShiftStep}), final ${num(probe.shift)} m; |u_c| máx de las columnas del fondo ${num(probe.maxColumnSpeed)} m/s`);
    const h6 = { name: "H6, desplazamiento horizontal del centroide de la miel apoyada en 60 s ≤ 0,5 m", issue: "#110", ok: probe.maxShift <= 0.5, detail: `${num(probe.maxShift)} m, |u_c| máx ${num(probe.maxColumnSpeed)} m/s` };
    const failed = checks.filter((c) => !c.ok);
    for (const c of checks.concat(h6)) t.diagnostic(`${c.ok ? "ok" : "FALLA"} ${c.name}: ${c.detail}`);
    assert.equal(failed.length, 0, failed.map((c) => `${c.name}: ${c.detail}`).join(" | "));
    assert.ok(h6.ok, `${h6.name}: ${h6.detail}`);
});

test("U2b (#110): H6 con ola: 150 gotas de agua pasan sobre la capa de miel del fondo; desplazamiento del centroide apoyado ≤ 0,5 m", async (t) => {
    const game = await start();
    const { store } = game.state;
    const injected = fireTank(game, FLUID.HONEY, 24, LEVEL.pool.surface, 10, null, null, 152);
    for (let f = 0; f < 20 * STEPS_PER_SECOND; f++) game.frame();
    const recorder = recorderFor(game, "u2b-ola-sobre-miel");
    const probe = new HoneyProbe(game);
    probe.sample();
    const initial = probe.centroid;
    const drops = dropper(game);
    const x0 = initial - 6;
    for (let k = 0; k < 150; k++) drops.spawn(FLUID.WATER, x0, LEVEL.pool.surface + 0.3 + k * 0.09);
    drops.dispose();
    for (let frame = 0; frame < 25 * STEPS_PER_SECOND; frame++) tick(game, recorder, frame, () => probe.sample());
    save(recorder, "u2b-ola-sobre-miel");
    const alive = store.created[FLUID.HONEY] - store.destroyed[SINK.OUT][FLUID.HONEY];
    t.diagnostic(`ola desde x = ${num(x0)} m sobre la capa apoyada (centroide inicial ${num(initial)} m): desplazamiento medio máx ${num(probe.maxShift)} m, final ${num(probe.shift)} m; |u_c| máx de las columnas bajo la capa ${num(probe.maxColumnSpeed)} m/s; miel viva ${alive} de ${injected}; absorbidas ${store.destroyed[SINK.ABSORBED][FLUID.HONEY]}`);
    assert.equal(store.destroyed[SINK.ABSORBED][FLUID.HONEY], 0);
    assert.ok(probe.touchedEver > 0, "la capa de miel no llegó al fondo");
    assert.ok(probe.maxColumnSpeed >= 0.3, `la ola no pasó sobre la capa: |u_c| máx ${probe.maxColumnSpeed} m/s`);
    assert.ok(probe.maxShift <= 0.5, `desplazamiento ${probe.maxShift} m`);
});
/** Cierra una prueba sin `todo`: deja constancia de cada criterio y falla si alguno no se cumplió. */
function strict(t, checks) {
    for (const c of checks) t.diagnostic(`${c.ok ? "ok" : "FALLA"} ${c.name}: ${c.detail}`);
    const failed = checks.filter((c) => !c.ok);
    assert.equal(failed.length, 0, failed.map((c) => `${c.name}: ${c.detail}`).join(" | "));
}

test("U3 (#98): un tanque de ácido a la pileta; Q1b en cada paso durante 60 s, Q2 (w medio ±1 %, ρ_col ±0,1 %) y Q5 (color) a los 10 s del último disparo, Q6c en cada paso", async (t) => {
    const game = await start();
    const { water, store, immersion } = game.state;
    const recorder = recorderFor(game, "u3-acido-en-pileta");
    const v0 = water.volume();
    const impactX = 24;
    const acidMass = MATERIALS.acid.SG * SIGMA_W * immersion.area;
    const wAcid = MATERIALS.acid.species.H2SO4;
    const sgAcid = MATERIALS.acid.SG;
    const pure = render.fieldColor(water, impactX);

    let frame = 0;
    let firstShot = -1;
    let lastShot = 0;
    let created = store.created[FLUID.ACID];
    let worstBalance = 0;
    let worstBalanceFrame = -1;
    let q6cBad = 0;
    let snapshot = null;
    const onFrame = () => {
        frame++;
        if (store.created[FLUID.ACID] > created) {
            created = store.created[FLUID.ACID];
            lastShot = frame;
            if (firstShot < 0) firstShot = frame;
        }
        let alive = 0;
        for (let slot = 0; slot < store.capacity; slot++) if (store.alive[slot] === 1 && store.kind[slot] === FLUID.ACID) alive++;
        let gone = 0;
        for (const [cause, id] of Object.entries(SINK)) if (cause !== "ABSORBED") gone += store.destroyed[id][FLUID.ACID];
        if (created > 0) {
            const balance = Math.abs((alive + gone) * acidMass * wAcid + water.acid() - created * acidMass * wAcid) / (created * acidMass * wAcid);
            if (balance > worstBalance) {
                worstBalance = balance;
                worstBalanceFrame = frame;
            }
        }
        for (let i = 0; i < water.N; i++) {
            if (water.h[i] > water.config.hDry && (water.A[i] < -1e-12 || water.acidRatio(i) > wAcid + 1e-9)) q6cBad++;
        }
        if (snapshot === null && lastShot > 0 && frame >= lastShot + 10 * STEPS_PER_SECOND) {
            const absorbed = store.destroyed[SINK.ABSORBED][FLUID.ACID];
            let mass = 0;
            let columns = 0;
            let worstRho = 0;
            for (let i = 0; i < water.N; i++) {
                const h = water.h[i];
                if (h <= 0) continue;
                const va = water.A[i] / (sgAcid * SIGMA_W * wAcid);
                mass += SIGMA_W * (h + (sgAcid - 1) * va + (MATERIALS.honey.SG - 1) * water.M[i]) * water.dx;
                if (water.b[i] === 0 && h > water.config.hDry) {
                    const expected = 1 + (6.8 * 100 * water.acidFraction(i)) / 998.2;
                    worstRho = Math.max(worstRho, Math.abs(water.densityAt(water.center(i)) / 1000 - expected) / expected);
                    columns++;
                }
            }
            snapshot = {
                absorbed,
                measuredW: water.acid() / mass,
                expectedW: (absorbed * acidMass * wAcid) / (SIGMA_W * v0 + absorbed * acidMass),
                worstRho,
                columns,
                colour: render.fieldColor(water, impactX),
                wImpact: water.acidFractionAt(impactX),
                seconds: (frame - lastShot) / STEPS_PER_SECOND,
            };
        }
    };
    const injected = fireTank(game, FLUID.ACID, 24, LEVEL.pool.surface, 10, recorder, onFrame);
    while (firstShot < 0 || frame < firstShot + 60 * STEPS_PER_SECOND) tick(game, recorder, frame, onFrame);
    save(recorder, "u3-acido-en-pileta");

    assert.ok(injected > 0, "el tanque disparó ácido");
    assert.ok(snapshot !== null, "se llegó a la medición de los 10 s");
    assert.ok(snapshot.absorbed > 0, "el ácido llegó al campo");
    const wError = Math.abs(snapshot.measuredW - snapshot.expectedW) / snapshot.expectedW;
    strict(t, [
        { name: "Q1b, balance de H2SO4 (partículas + campo + destruidas ≠ ABSORBED = creadas) en cada paso", ok: worstBalance < 1e-6, detail: `error relativo máx ${worstBalance.toExponential(2)} (frame ${worstBalanceFrame}) contra < 1e-6; ${injected} partículas disparadas` },
        { name: "Q2a, w medio = m_H2SO4 / m_total a los 10 s del último disparo", ok: wError <= 0.01, detail: `w = ${pct(snapshot.measuredW)} contra ${pct(snapshot.expectedW)} (${snapshot.absorbed} de ${injected} partículas absorbidas, medido a ${num(snapshot.seconds)} s del último disparo), error relativo ${pct(wError)} contra ±1 %` },
        { name: "Q2b, ρ_col/ρ_w = 1 + 6,8 · (100 w) / 998,2 en cada columna mojada de la pileta", ok: snapshot.worstRho <= 0.001, detail: `error relativo máx ${pct(snapshot.worstRho)} en ${snapshot.columns} columnas contra ±0,1 %` },
        { name: "Q5, color del campo en el impacto con agua pura = draw.color exacto", ok: pure.every((c, k) => c === WATER_FIELD.draw.color[k]), detail: `[${pure}] contra [${WATER_FIELD.draw.color}]` },
        { name: "Q5, color del campo en el impacto tras el disparo distinto del agua pura", ok: snapshot.colour.some((c, k) => c !== pure[k]), detail: `[${snapshot.colour}] contra agua pura [${pure}], w en el impacto ${pct(snapshot.wImpact)}` },
        { name: "Q6c, columnas con h > hDry y A < −1e-12 o w > w_a + 1e-9", ok: q6cBad === 0, detail: `${q6cBad} columnas-paso contra 0` },
    ]);
});
test("U4 (#101): lluvia y disparos durante 30 s; el área dibujada = la física por material (±10 % en el 95 % de los pasos, ninguno fuera de ±15 %), con la medición de I3p e I3f", async (t) => {
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
        const near = run.i3pNear[n] / track.evals;
        checks.push({
            name: `partículas de ${n}`,
            issue: "#101",
            ok: near >= AREA_SHARE && track.fails === 0,
            detail: `dibujado ${num(info.drawn)} m² contra n · A_p = ${num(info.physical)} m² (n = ${info.n}) en el peor paso: ${pct(track.max)}; ${pct(near)} de ${track.evals} pasos dentro de ±${pct(PARTICLE_AREA_TOLERANCE)} (esperado ${pct(AREA_SHARE)}); fuera de ±${pct(AREA_HARD_LIMIT)} en ${track.fails} pasos`,
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
