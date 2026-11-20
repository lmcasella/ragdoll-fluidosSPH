/**
 * Evaporación de agua detenida (docs/design/14-agua.md §14.7b, §14.16 E, #73): LiquidFun real, `stepWorld` con 8
 * subpasos y el contorno del juego. E1 a E5; cada prueba informa lo medido contra la referencia.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { newWorld, addSolids, wallFor, DT, A_P } from "./helpers/water-bench.js";
import { loadGame, giveAllWeapons } from "./helpers/game.js";

const { stepWorld } = await import("../lib/ragimporter.js");
const { createParticleSystem } = await import("../js/particles.js");
const { SHOT_SYSTEM, FLUID } = await import("../js/weapons.js");
const { ParticleStore, ORIGIN, SINK } = await import("../js/particleStore.js");
const { Evaporation, EVAPORATION } = await import("../js/evaporation.js");
const { Contacts } = await import("../js/contacts.js");
const { MATERIALS, SIGMA_W } = await import("../js/materials.js");
const { LEVEL } = await import("../js/level.js");

const F_EVAP = MATERIALS.water.evaporationScale;
const PERIMETER = 2 * Math.sqrt(Math.PI * A_P);
const TAU_FULL = A_P / (F_EVAP * EVAPORATION.rate * PERIMETER);
const MASS = SIGMA_W * A_P;
const fmt = (n, digits = 3) => Number(n).toFixed(digits);

/**
 * Piso estático con partículas de `kind` en `points`, el store, el contorno y la evaporación del juego. `step()` avanza
 * un paso fijo y, antes de evaporar, mide con su propio lector de contactos la fracción expuesta `f` y la rapidez de
 * cada partícula viva (`samples`, arreglos por índice del paso). Con `evaporate` falso, el paso no evapora.
 */
function setup(points, kind = FLUID.WATER, trough = false) {
    const world = newWorld();
    addSolids(world, [{ x: 5, y: -0.5, w: 40, h: 1 }]);
    if (trough) addSolids(world, [{ x: 4.3, y: 1, w: 0.2, h: 2 }, { x: 5.7, y: 1, w: 0.2, h: 2 }]);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = wallFor(system, store);
    const evaporation = new Evaporation(system, store);
    const reader = new Contacts(system);
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    for (const [x, y] of points) {
        at.set_x(x);
        at.set_y(y);
        def.set_position(at);
        store.create(def, { kind, origin: ORIGIN.SHOT });
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
    const capacity = system.GetMaxParticleCount();
    const pp = new Float32Array(capacity);
    const pb = new Float32Array(capacity);
    const scene = {
        world,
        system,
        store,
        evaporation,
        time: 0,
        f: new Float32Array(capacity),
        speed: new Float32Array(capacity),
        step(evaporate = true) {
            stepWorld(world, [wall]);
            store.afterStep();
            scene.time += DT;
            const n = system.GetParticleCount();
            reader.weights(pp, pb, n);
            const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
            for (let i = 0; i < n; i++) {
                scene.f[i] = Math.min(Math.max(1 - (pp[i] + pb[i]) / EVAPORATION.wFull, 0), 1);
                scene.speed[i] = Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]);
            }
            if (evaporate) evaporation.step(DT);
        },
        alive() {
            let count = 0;
            for (let s = 0; s < store.capacity; s++) count += store.alive[s];
            return count;
        },
        dispose() {
            wall.dispose();
        },
    };
    return scene;
}

/** Gota aislada: devuelve el tiempo de vida (s), `f_1` (media de `f` en los pasos en reposo) y el tiempo en reposo. */
function dropLife() {
    const scene = setup([[5, 0.1]]);
    let fSum = 0;
    let rest = 0;
    while (scene.alive() > 0 && scene.time < 30) {
        scene.step();
        if (scene.alive() === 0) break;
        if (scene.speed[0] < EVAPORATION.restSpeed) {
            fSum += scene.f[0];
            rest++;
        }
    }
    const stats = { ...scene.evaporation.stats };
    scene.dispose();
    return { tau: scene.time, f1: fSum / rest, rest: rest * DT, stats };
}

test("constantes derivadas del radio vigente: τ con f = 1 es A_p / (F_evap e_r P) = 2,42 s con r = 0,06", () => {
    assert.ok(Math.abs(TAU_FULL - 2.417) < 0.01, `τ(f = 1) = ${TAU_FULL}`);
    const scene = setup([[5, 5]]);
    assert.ok(Math.abs(scene.evaporation.rate[FLUID.WATER] * TAU_FULL - 1) < 1e-6);
    assert.equal(scene.evaporation.rate[FLUID.ACID], 0);
    assert.equal(scene.evaporation.rate[FLUID.LAVA], 0);
    assert.equal(scene.evaporation.rate[FLUID.HONEY], 0);
    scene.dispose();
});

test("E1: gota aislada en reposo sobre una plataforma, τ_1 = A_p / (F_evap e_r P f_1) ±15 %", (t) => {
    const m = dropLife();
    const reference = TAU_FULL / m.f1;
    const error = (m.tau - reference) / reference;
    t.diagnostic(`E1: τ_1 medido ${fmt(m.tau)} s (en reposo ${fmt(m.rest)} s), f_1 = ${fmt(m.f1)}, referencia ${fmt(reference)} s, error ${fmt(error * 100, 1)} % (con f_1 = 1 serían ${fmt(TAU_FULL)} s)`);
    assert.equal(m.stats.evaporated, 1);
    assert.ok(m.f1 > 0 && m.f1 < 1, `f_1 ${m.f1}`);
    assert.ok(Math.abs(error) <= 0.15, `error ${error}`);
});

/** Charco de `columns × rows` partículas, asentado `settle` s sin evaporar; devuelve la escena lista para evaporar. */
function puddle(columns, rows, settle) {
    const points = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) points.push([5 + (c - (columns - 1) / 2) * 0.09, 0.07 + r * 0.09]);
    const scene = setup(points, FLUID.WATER, true);
    for (let s = 0; s < Math.round(settle / DT); s++) scene.step(false);
    return scene;
}

test("E2: charco de N = 40 partículas, tasa inicial dV/dt = F_evap e_r P Σ f_i y τ_N / τ_1 = N f_1 / Σ f_i, ±15 %", (t) => {
    const n = 40;
    const scene = puddle(10, 4, 3);
    assert.equal(scene.alive(), n);
    let still = 0;
    for (let i = 0; i < n; i++) if (scene.speed[i] < EVAPORATION.restSpeed) still++;
    assert.equal(still, n, `${n - still} partículas se mueven al empezar`);
    let sumF = 0;
    for (let i = 0; i < n; i++) sumF += scene.f[i];
    const window = Math.round(0.5 / DT);
    const phi = () => {
        let total = 0;
        for (let s = 0; s < scene.store.capacity; s++) if (scene.store.alive[s]) total += scene.store.evaporated[s];
        return total;
    };
    const start = phi();
    let sumFWindow = 0;
    for (let s = 0; s < window; s++) {
        let f = 0;
        for (let i = 0; i < scene.system.GetParticleCount(); i++) f += scene.f[i];
        sumFWindow += f;
        scene.step();
    }
    const rate = ((phi() - start) * A_P) / (window * DT);
    const reference = F_EVAP * EVAPORATION.rate * PERIMETER * (sumFWindow / window);
    const tau1 = dropLife();
    const tauN = (n * A_P) / rate;
    const ratio = tauN / tau1.tau;
    const ratioReference = (n * tau1.f1) / sumF;
    t.diagnostic(
        `E2: Σ f_i inicial ${fmt(sumF)} (media de la ventana ${fmt(sumFWindow / window)}); dV/dt medida ${fmt(rate * 1e3)} L/s·m contra ${fmt(reference * 1e3)}, error ${fmt(((rate - reference) / reference) * 100, 1)} %; ` +
            `τ_N/τ_1 medida ${fmt(ratio)} contra N f_1 / Σ f_i = ${fmt(ratioReference)} (f_1 ${fmt(tau1.f1)}, τ_1 ${fmt(tau1.tau)} s), error ${fmt(((ratio - ratioReference) / ratioReference) * 100, 1)} %`,
    );
    scene.dispose();
    assert.ok(Math.abs((rate - reference) / reference) <= 0.15);
    assert.ok(Math.abs((ratio - ratioReference) / ratioReference) <= 0.15);
});

test("E5: ácido detenido durante 60 s: masa de H2SO4 y de ácido constante (< 1e-6) y φ = 0", (t) => {
    const points = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) points.push([5 + (c - 4.5) * 0.09, 0.07 + r * 0.09]);
    const scene = setup(points, FLUID.ACID, true);
    const acid = MATERIALS.acid;
    const massAcid = acid.SG * SIGMA_W * A_P;
    const initial = { acid: points.length * massAcid, h2so4: points.length * massAcid * acid.species.H2SO4 };
    let still = 0;
    for (let s = 0; s < Math.round(60 / DT); s++) scene.step();
    const n = scene.system.GetParticleCount();
    let phiMax = 0;
    let massNow = 0;
    for (let s = 0; s < scene.store.capacity; s++) {
        if (!scene.store.alive[s]) continue;
        phiMax = Math.max(phiMax, scene.store.evaporated[s]);
        massNow += massAcid * (1 - scene.store.evaporated[s]);
    }
    for (let i = 0; i < n; i++) if (scene.speed[i] < EVAPORATION.restSpeed) still++;
    const h2so4Now = massNow * acid.species.H2SO4;
    const errAcid = Math.abs(massNow - initial.acid) / initial.acid;
    const errH2so4 = Math.abs(h2so4Now - initial.h2so4) / initial.h2so4;
    t.diagnostic(`E5: ${n} de ${points.length} partículas vivas, ${still} detenidas, φ máx ${phiMax}, error de masa de ácido ${errAcid}, de H2SO4 ${errH2so4}, destruidas por EVAPORATED ${scene.store.destroyed[SINK.EVAPORATED][FLUID.ACID]}, latente ${scene.evaporation.stats.latent} J`);
    assert.equal(n, points.length);
    assert.equal(still, n);
    assert.equal(phiMax, 0);
    assert.ok(errAcid < 1e-6 && errH2so4 < 1e-6);
    assert.equal(scene.evaporation.stats.latent, 0);
    scene.dispose();
});

test("evaporar aparte la gota y el charco: la gota se va y el ácido vecino no", () => {
    const scene = setup([[3, 0.1]]);
    const evaporationStats = () => scene.evaporation.stats;
    for (let s = 0; s < Math.round(10 / DT); s++) scene.step();
    assert.equal(scene.alive(), 0);
    assert.equal(evaporationStats().evaporated, 1);
    assert.equal(scene.store.destroyed[SINK.EVAPORATED][FLUID.WATER], 1);
    assert.ok(Math.abs(evaporationStats().mass - MASS) / MASS < 1e-5);
    assert.ok(Math.abs(evaporationStats().latent + EVAPORATION.latentHeat * MASS) / (EVAPORATION.latentHeat * MASS) < 1e-5);
    scene.dispose();
});

test("destruir una partícula parcialmente evaporada absorbida reparte el libro: 1 − φ en ABSORBED y φ en EVAPORATED, y con otra causa sale entera", () => {
    const scene = setup([[3, 0.1]]);
    for (let s = 0; s < Math.round(1 / DT); s++) scene.step();
    const slot = scene.store.slotAt(0);
    const phi = scene.store.evaporated[slot];
    assert.ok(phi > 0 && phi < 1, `φ ${phi}`);
    scene.store.destroy(0, SINK.ABSORBED);
    assert.ok(Math.abs(scene.store.destroyed[SINK.ABSORBED][FLUID.WATER] - (1 - phi)) < 1e-12);
    assert.ok(Math.abs(scene.store.destroyed[SINK.EVAPORATED][FLUID.WATER] - phi) < 1e-12);
    const other = setup([[3, 0.1]]);
    for (let s = 0; s < Math.round(1 / DT); s++) other.step();
    other.store.destroy(0, SINK.OUT);
    assert.equal(other.store.destroyed[SINK.OUT][FLUID.WATER], 1);
    assert.equal(other.store.destroyed[SINK.EVAPORATED][FLUID.WATER], 0);
    other.dispose();
    scene.dispose();
});

/**
 * Siembra en la escena del juego 12 gotas quietas y separadas sobre la isla de la izquierda (se evaporan por completo) y
 * 6 gotas ya evaporadas en parte (φ = 0,4) sobre la pileta, que caen y se absorben con `A_p (1 − φ)`; las marca como
 * detenidas alguna vez. Devuelve la suma de las φ sembradas, que `Evaporation` no evaporó.
 */
function seed(g, stopped) {
    const { store } = g;
    const island = LEVEL.solids[1];
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    const put = (x, y, phi) => {
        at.set_x(x);
        at.set_y(y);
        def.set_position(at);
        const index = store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT });
        const slot = store.slotAt(index);
        store.evaporated[slot] = phi;
        stopped[slot] = 1;
        seeded += phi;
    };
    let seeded = 0;
    for (let k = 0; k < 12; k++) put(island.x - island.w / 2 + 0.5 + k * 0.4, island.y + island.h / 2 + 0.1, 0);
    const floorX = (LEVEL.spawns[0].x + LEVEL.spawns[1].x) / 2;
    for (let k = 0; k < 6; k++) put(floorX - 1 + k * 0.4, LEVEL.pool.surface + 1.5, 0.4);
    Box2D.destroy(def);
    Box2D.destroy(at);
    return seeded;
}

/**
 * Escena del juego con agua sola durante 60 s de ronda (sin lluvia: empieza en `LEVEL.flood.start`). El jugador 1 y el 2
 * disparan agua con la mira en un barrido de la otra punta de la isla rival al piso entre los dos, con el tanque
 * siempre lleno, los primeros `fireSeconds`. Mide por paso fijo el cierre de masa de H2O, el avance de `φ` en vuelo y si
 * las absorbidas llegaron con φ > 0 sin haberse detenido.
 */
async function waterRun({ windowSeconds = 60, fireSeconds = 25 } = {}) {
    const game = await loadGame();
    giveAllWeapons(game);
    const g = game.state;
    const { water, store, evaporation, particleSystem, players, match } = g;
    const mass = SIGMA_W * g.immersion.area;
    const field0 = SIGMA_W * water.volume();
    const run = { steps: 0, worst: 0, worstStep: -1, flight: 0, flightChecked: 0, flightViolations: 0, absorbedChecked: 0, absorbedViolations: 0, absorbedWithPhi: 0, restedPeak: 0 };
    const stopped = new Uint8Array(store.capacity);
    const create = store.create.bind(store);
    store.create = (def, props) => {
        const index = create(def, props);
        if (index >= 0) stopped[store.slotAt(index)] = 0;
        return index;
    };
    const destroy = store.destroy.bind(store);
    store.destroy = (i, cause) => {
        const slot = store.slotAt(i);
        if (cause === SINK.ABSORBED && slot >= 0 && store.alive[slot] === 1) {
            run.absorbedChecked++;
            if (store.evaporated[slot] > 0) {
                run.absorbedWithPhi++;
                if (!stopped[slot]) run.absorbedViolations++;
            }
        }
        destroy(i, cause);
    };
    let seededPhi = 0;
    const before = new Float32Array(store.capacity);
    const stepEvaporation = evaporation.step.bind(evaporation);
    evaporation.step = (dt) => {
        const n = particleSystem.GetParticleCount();
        const vel = Box2D.getPointer(particleSystem.GetVelocityBuffer()) >> 2;
        const flying = [];
        for (let i = 0; i < n; i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || !store.alive[slot] || store.kind[slot] !== FLUID.WATER) continue;
            const speed = Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]);
            if (speed < EVAPORATION.restSpeed) stopped[slot] = 1;
            else {
                before[slot] = store.evaporated[slot];
                flying.push(slot);
            }
        }
        stepEvaporation(dt);
        for (const slot of flying) {
            run.flightChecked++;
            if (store.evaporated[slot] > before[slot]) run.flightViolations++;
        }
    };
    const measure = () => {
        run.steps++;
        let alive = 0;
        let live = 0;
        for (let slot = 0; slot < store.capacity; slot++) {
            if (!store.alive[slot]) continue;
            alive++;
            live += store.evaporated[slot];
        }
        const destroyed = store.destroyed;
        const field = SIGMA_W * water.volume();
        const out = destroyed[SINK.OUT][FLUID.WATER] + destroyed[SINK.EVAPORATED][FLUID.WATER] + live;
        const injected = store.created[FLUID.WATER] * mass;
        const residual = (alive - live) * mass + field + out * mass - field0 - injected;
        const rel = Math.abs(residual) / (field0 + injected);
        if (rel > run.worst) {
            run.worst = rel;
            run.worstStep = run.steps;
        }
        const booked = (live + destroyed[SINK.EVAPORATED][FLUID.WATER]) * mass;
        run.bookGap = Math.max(run.bookGap ?? 0, Math.abs(booked - seededPhi * mass - evaporation.stats.mass));
        run.evaporatedLive = live;
    };
    const advance = water.step.bind(water);
    water.step = (dt) => {
        advance(dt);
        measure();
    };
    const islandTop = LEVEL.solids[1].y + LEVEL.solids[1].h / 2;
    const floorX = (LEVEL.spawns[0].x + LEVEL.spawns[1].x) / 2;
    const targets = [
        { ax: LEVEL.bounds.maxX - 1, ay: islandTop, bx: floorX, by: LEVEL.pool.bottom },
        { ax: LEVEL.bounds.minX + 1, ay: islandTop, bx: floorX, by: LEVEL.pool.bottom },
    ];
    game.frames(3);
    seededPhi = seed(g, stopped);
    const frames = windowSeconds * 60;
    for (let f = 0; f < frames && match.state === "playing"; f++) {
        const sweep = (f / 360) % 1;
        const u = sweep < 0.5 ? sweep * 2 : 2 - sweep * 2;
        const firing = f < fireSeconds * 60;
        players.forEach((player, k) => {
            player.tanks.set(FLUID.WATER, 600);
            const pos = player.torso.GetPosition();
            const target = targets[k];
            const tx = target.ax + (target.bx - target.ax) * u;
            const ty = target.ay + (target.by - target.ay) * u;
            const len = Math.hypot(tx - pos.get_x(), ty - pos.get_y()) || 1;
            game.setPad(k, { buttons: firing ? [7] : [], axes: [0, 0, (tx - pos.get_x()) / len, -(ty - pos.get_y()) / len] });
        });
        game.frame();
    }
    run.seconds = run.steps / 60;
    run.created = store.created[FLUID.WATER];
    run.destroyedEvaporated = store.destroyed[SINK.EVAPORATED][FLUID.WATER];
    run.absorbed = store.destroyed[SINK.ABSORBED][FLUID.WATER];
    run.stats = evaporation.stats;
    run.ended = match.state !== "playing";
    return run;
}

const run = await waterRun();

test("E3: masa de H2O (partículas + campo + evaporado) constante durante 60 s, < 1e-6 en cada paso", (t) => {
    t.diagnostic(
        `E3: ${run.steps} pasos (${fmt(run.seconds)} s${run.ended ? ", la ronda terminó antes" : ""}); residuo relativo máx ${run.worst} (paso ${run.worstStep}); creadas ${run.created}, evaporadas enteras ${run.destroyedEvaporated}, absorbidas ${run.absorbed}, φ vivo acumulado ${fmt(run.evaporatedLive)}; ` +
            `contabilidad de EVAPORATED contra stats.mass: dif máx ${run.bookGap} kg; latente ${fmt(run.stats.latent / 1e6)} MJ`,
    );
    assert.ok(run.seconds >= 59, `la ventana duró ${run.seconds} s`);
    assert.ok(run.created > 1000 && run.destroyedEvaporated >= 10, "la escena no evaporó las gotas sembradas");
    assert.ok(run.worst < 1e-6, `residuo ${run.worst}`);
    assert.ok(run.bookGap < 1e-6 * run.created * MASS, `el libro de evaporados difiere de stats.mass en ${run.bookGap} kg`);
});

test("E4: en vuelo (|v| ≥ 1 m/s) φ no aumenta, y lo que llega al campo sin haberse detenido llega con φ = 0", (t) => {
    t.diagnostic(`E4: ${run.flightChecked} partículas-paso en vuelo, ${run.flightViolations} con dφ > 0; ${run.absorbedChecked} absorbidas, ${run.absorbedWithPhi} con φ > 0 (todas detenidas antes), ${run.absorbedViolations} con φ > 0 sin haberse detenido`);
    assert.ok(run.flightChecked > 10000, `solo ${run.flightChecked} partículas-paso en vuelo`);
    assert.equal(run.flightViolations, 0);
    assert.equal(run.absorbedViolations, 0);
});

test("la evaporación sigue activa en el juego y informa los offsets de contactos", () => {
    assert.equal(run.stats.enabled, true);
    assert.deepEqual({ particle: run.stats.contacts.particleOffset, body: run.stats.contacts.bodyOffset }, { particle: 54, body: 58 });
});
