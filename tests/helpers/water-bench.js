import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.Box2D ??= require("../../vendor/liquidfun.js");
globalThis.PIXI ??= {
    Container: class {
        addChild(child) {
            return child;
        }
        removeChild() {}
        destroy() {}
    },
};

const { stepWorld } = await import("../../lib/ragimporter.js");
const { createParticleSystem } = await import("../../js/particles.js");
const { ShotEmitter, SHOT_SYSTEM, FLUID } = await import("../../js/weapons.js");
const { ParticleStore, ORIGIN } = await import("../../js/particleStore.js");
const { WallContact } = await import("../../js/wallContact.js");
const { SIGMA_W } = await import("../../js/materials.js");

/**
 * Bancos de #69 (docs/design/14-agua.md §14.16, P1 a P5): LiquidFun real, determinista, con `SHOT_SYSTEM` y
 * `stepWorld` (8 subpasos). Cada banco devuelve las magnitudes medidas; los criterios los comprueba el test.
 * `makeRecorder({ system, store, plate })` (opcional) devuelve el `Recorder` que graba el escenario.
 */
export const G = 10;
export const DT = 1 / 60;
export const RADIUS = SHOT_SYSTEM.radius;

/** Área que representa cada partícula en la rebanada 2D: `(1,5 r)²`. */
export const A_P = (1.5 * RADIUS) ** 2;

/** Masa de una partícula de agua del motor: `σ_w · A_p`. */
export const M_P = SIGMA_W * A_P;

const WATER_COLOR = [90, 170, 255];

function newWorld() {
    const gravity = new Box2D.b2Vec2(0, -G);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    return world;
}

/** Cajas estáticas { x, y, w, h } (centro y tamaño, en metros) sobre un solo cuerpo. */
function addSolids(world, solids) {
    const bodyDef = new Box2D.b2BodyDef();
    const ground = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(0, 0);
    for (const { x, y, w, h } of solids) {
        center.set_x(x);
        center.set_y(y);
        shape.SetAsBox(w / 2, h / 2, center, 0);
        ground.CreateFixture(shape, 0);
    }
    Box2D.destroy(center);
    Box2D.destroy(shape);
    return ground;
}

/**
 * Llena la caja [x0, x1] × [y0, y1] con partículas del `store`: el motor reparte las posiciones con un grupo
 * temporal, que se destruye, y cada posición se crea de nuevo por `ParticleStore` (con slot, que el contorno
 * necesita para corregir). `CreateParticleGroup` solo crearía partículas sin slot.
 */
function fillStore(world, system, store, x0, y0, x1, y1) {
    const groupDef = new Box2D.b2ParticleGroupDef();
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2((x0 + x1) / 2, (y0 + y1) / 2);
    shape.SetAsBox((x1 - x0) / 2, (y1 - y0) / 2, center, 0);
    groupDef.set_shape(shape);
    system.CreateParticleGroup(groupDef);
    Box2D.destroy(groupDef);
    Box2D.destroy(shape);
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const points = [];
    for (let i = 0; i < system.GetParticleCount(); i++) points.push(Box2D.HEAPF32[pos + 2 * i], Box2D.HEAPF32[pos + 2 * i + 1]);
    for (let i = system.GetParticleCount() - 1; i >= 0; i--) system.DestroyParticle(i);
    stepWorld(world, []);
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    const color = new Box2D.b2ParticleColor(...WATER_COLOR, 255);
    def.set_color(color);
    for (let k = 0; k < points.length; k += 2) {
        at.set_x(points[k]);
        at.set_y(points[k + 1]);
        def.set_position(at);
        store.create(def, { kind: FLUID.WATER, origin: ORIGIN.SHOT });
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
    Box2D.destroy(center);
    Box2D.destroy(color);
}
function positionsOf(system) {
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const n = system.GetParticleCount();
    const out = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) out[i] = Box2D.HEAPF32[pos + i];
    return out;
}

/**
 * Contorno inelástico del juego (`js/wallContact.js`) para `system`: todos los bancos lo usan igual que la raíz de
 * composición, como pseudo-instancia de `stepWorld`.
 */
function wallFor(system, store = new ParticleStore(system, SHOT_SYSTEM)) {
    return new WallContact(system, store, SHOT_SYSTEM);
}

/**
 * P1: rotura de presa. Columna de agua de `length` × `h0` separada `r` de las paredes (relleno por `ParticleStore`
 * de `length − 2 r` de ancho, con la altura corregida para conservar `h0` de agua), contra la pared izquierda y con
 * una compuerta a la derecha sin tapa, asentada `settle` s con el contorno y soltada al sacar la compuerta en
 * t = 0. Devuelve `vmaxSettle`, la rapidez máxima al soltar (precondición ≤ 0,2 m/s).
 * Frente: la x más lejana con profundidad (partículas · A_p / bin) ≥ δ = `1,5 r` (una capa) en bins de 0,36 m,
 * interpolada linealmente dentro del bin (desde la pared de la presa). Con capa mínima δ el frente avanza a
 * `c = 2√(g h₀) − 2√(g δ)`: `slope` es la pendiente por mínimos cuadrados del frente en la ventana
 * `t √(g/h₀)` ∈ [2, 3,4] (antes de 2 la caída no es hidrostática) y `lag` el retardo `t₀ √(g/h₀)` de la recta de
 * pendiente `c` que mejor ajusta esa ventana.
 */
export function damBreak({ h0 = 2, length = 8, settle = 4, makeRecorder = null } = {}) {
    const world = newWorld();
    addSolids(world, [
        { x: 20, y: -0.5, w: 60, h: 1 },
        { x: -0.5, y: 4, w: 1, h: 8 },
    ]);
    const gate = addSolids(world, [{ x: length + 0.5, y: 4, w: 1, h: 8 }]);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = wallFor(system, store);
    const inset = RADIUS;
    const fill = (h0 * length) / (length - 2 * inset);
    fillStore(world, system, store, inset, inset, length - inset, inset + fill);
    const initial = system.GetParticleCount();
    const recorder = makeRecorder?.({ system });
    const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    const maxSpeed = () => {
        let v = 0;
        for (let i = 0; i < system.GetParticleCount(); i++) v = Math.max(v, Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]));
        return v;
    };
    for (let step = 0; step < Math.round(settle / DT); step++) stepWorld(world, [wall]);
    const vmaxSettle = maxSpeed();
    world.DestroyBody(gate);
    wall.invalidate();
    const BIN = 0.36;
    const delta = 1.5 * RADIUS;
    const c0 = Math.sqrt(G * h0);
    const tScale = Math.sqrt(G / h0);
    const tEnd = 3.4 / tScale;
    const bins = new Float64Array(Math.ceil(40 / BIN) + 1);
    const curve = [];
    recorder?.capture();
    for (let step = 1; step <= Math.round((tEnd + 0.05) / DT); step++) {
        stepWorld(world, [wall]);
        recorder?.capture();
        const t = step * DT;
        const pos = positionsOf(system);
        bins.fill(0);
        for (let i = 0; i < pos.length; i += 2) {
            const b = Math.floor(pos[i] / BIN);
            if (b >= 0 && b < bins.length) bins[b]++;
        }
        const depth = (b) => (bins[b] * A_P) / BIN;
        let last = -1;
        for (let b = bins.length - 1; b >= 0; b--) {
            if (depth(b) >= delta) {
                last = b;
                break;
            }
        }
        let front = (last + 0.5) * BIN;
        if (last >= 0 && last + 1 < bins.length) front += (BIN * (depth(last) - delta)) / Math.max(1e-9, depth(last) - depth(last + 1));
        curve.push({ t, front: front - length });
    }
    const window = curve.filter((c) => c.t * tScale >= 2 && c.t * tScale <= 3.4);
    const mt = window.reduce((a, c) => a + c.t, 0) / window.length;
    const mx = window.reduce((a, c) => a + c.front, 0) / window.length;
    const slope = window.reduce((a, c) => a + (c.t - mt) * (c.front - mx), 0) / window.reduce((a, c) => a + (c.t - mt) ** 2, 0);
    const expected = 2 * c0 - 2 * Math.sqrt(G * delta);
    const lag = (mt - mx / expected) * tScale;
    wall.dispose();
    return { initial, vmaxSettle, curve, slope, expected, lag, samples: window.length, system, world };
}

/**
 * Registra en cada `ShotEmitter.fire` la posición y la velocidad de nacimiento de las partículas nuevas, por slot
 * de `ParticleStore`.
 */
function trackBirths(store, births, clock) {
    const create = store.create.bind(store);
    store.create = (def, props) => {
        const index = create(def, props);
        if (index >= 0) {
            const pos = Box2D.getPointer(store.system.GetPositionBuffer()) >> 2;
            const vel = Box2D.getPointer(store.system.GetVelocityBuffer()) >> 2;
            const slot = store.slotAt(index);
            births.set(slot, {
                step: clock.step,
                x: Box2D.HEAPF32[pos + 2 * index],
                y: Box2D.HEAPF32[pos + 2 * index + 1],
                vx: Box2D.HEAPF32[vel + 2 * index],
                vy: Box2D.HEAPF32[vel + 2 * index + 1],
            });
        }
        return index;
    };
}

function emitterOn(world, weapon, muzzle, tank = Infinity) {
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const emitter = new ShotEmitter(store, { shotId: () => 1 }, [weapon]);
    const player = {
        weapon: weapon.id,
        tanks: new Map([[weapon.id, tank]]),
        dead: false,
        muzzle: () => muzzle,
    };
    return { system, store, emitter, player };
}

/**
 * P2: chorro horizontal de `weapon` en un carril durante `emit` s, sin sólidos. Compara cada partícula con su
 * tiro balístico: rapidez esperada `√(v₀² + (g t)²)` y desvío transversal a la parábola de su nacimiento, hasta
 * la edad `emit`. Devuelve los máximos y la cantidad de partículas fuera de tolerancia.
 */
export function jetBench(weapon, { emit = 0.5, makeRecorder = null } = {}) {
    const world = newWorld();
    const muzzle = { x: 0, y: 12, dx: 1, dy: 0 };
    const { system, store, emitter, player } = emitterOn(world, weapon, muzzle);
    const wall = wallFor(system, store);
    const recorder = makeRecorder?.({ system, store });
    const births = new Map();
    const clock = { step: 0 };
    trackBirths(store, births, clock);
    const steps = Math.round((emit * 2) / DT);
    let checked = 0;
    let outSpeed = 0;
    let outDeviation = 0;
    let maxExcess = -Infinity;
    let maxDeviation = 0;
    let now = 100;
    recorder?.capture();
    for (let step = 0; step < steps; step++) {
        clock.step = step;
        now += DT;
        if (step < Math.round(emit / DT)) emitter.fire(0, player, true, DT, now);
        stepWorld(world, [wall]);
        store.afterStep();
        recorder?.capture();
        const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
        const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        for (let i = 0; i < system.GetParticleCount(); i++) {
            const b = births.get(store.slotAt(i));
            const age = (step - b.step + 1) * DT;
            if (age > emit + 1e-9) continue;
            const speed = Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]);
            const expected = Math.sqrt(weapon.speed ** 2 + (G * age) ** 2);
            const ex = b.x + b.vx * age;
            const ey = b.y + b.vy * age - 0.5 * G * age * age;
            const tx = b.vx;
            const ty = b.vy - G * age;
            const dx = Box2D.HEAPF32[pos + 2 * i] - ex;
            const dy = Box2D.HEAPF32[pos + 2 * i + 1] - ey;
            const deviation = Math.abs(dx * ty - dy * tx) / Math.hypot(tx, ty);
            checked++;
            maxExcess = Math.max(maxExcess, speed - expected);
            maxDeviation = Math.max(maxDeviation, deviation);
            if (speed > expected + 1) outSpeed++;
            if (deviation >= RADIUS) outDeviation++;
        }
    }
    const result = { emitted: births.size, checked, outSpeed, outDeviation, maxExcess, maxDeviation };
    wall.dispose();
    emitter.dispose();
    return result;
}

/**
 * Pares (índice, índice, peso) del buffer de contactos del sistema: el binding no exporta `GetContacts`; el
 * offset (+54 palabras) sale del relevamiento de docs/design/14-agua.md §14.8 y se valida contra
 * `GetContactCount`. Devuelve `null` si no coincide.
 */
function contactsOf(system) {
    const base = Box2D.getPointer(system) >> 2;
    const count = system.GetContactCount();
    const data = Box2D.HEAP32[base + 54];
    if (Box2D.HEAP32[base + 55] !== count || data === 0) return null;
    const words = data >> 2;
    const out = [];
    for (let c = 0; c < count; c++) {
        const w = words + c * 6;
        out.push([Box2D.HEAP32[w], Box2D.HEAP32[w + 1], Box2D.HEAPF32[w + 2]]);
    }
    return out;
}

/**
 * P3: compresión en reposo. Tanque de `width` m con `depth` m de agua, relleno por `ParticleStore` separado `r` de
 * los sólidos (con la altura corregida para conservar `depth` de agua); ventana interior de 4 × 1 m (x centrada,
 * y de 1 a 2 m). Devuelve la densidad (partículas · A_p / área) promedio entre t = 6 y 8 s, `escaped` (partículas
 * fuera del tanque al final) y, si se pueden leer los contactos, `W_full`: la suma de pesos de contacto por
 * partícula de la ventana.
 */
export function restBench({ width = 12, depth = 3, makeRecorder = null } = {}) {
    const world = newWorld();
    addSolids(world, [
        { x: width / 2, y: -0.5, w: width + 2, h: 1 },
        { x: -0.5, y: 4, w: 1, h: 8 },
        { x: width + 0.5, y: 4, w: 1, h: 8 },
    ]);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = wallFor(system, store);
    fillStore(world, system, store, RADIUS, RADIUS, width - RADIUS, RADIUS + (depth * width) / (width - 2 * RADIUS));
    const recorder = makeRecorder?.({ system });
    const window = { x0: width / 2 - 2, x1: width / 2 + 2, y0: 1, y1: 2 };
    let densitySum = 0;
    let samples = 0;
    let weightSum = 0;
    let weightSamples = 0;
    const steps = Math.round(8 / DT);
    for (let step = 1; step <= steps; step++) {
        stepWorld(world, [wall]);
        recorder?.capture();
        if (step <= Math.round(6 / DT)) continue;
        const pos = positionsOf(system);
        const inside = new Set();
        for (let i = 0; i < pos.length; i += 2) {
            if (pos[i] >= window.x0 && pos[i] < window.x1 && pos[i + 1] >= window.y0 && pos[i + 1] < window.y1) inside.add(i / 2);
        }
        densitySum += (inside.size * A_P) / ((window.x1 - window.x0) * (window.y1 - window.y0));
        samples++;
        const contacts = contactsOf(system);
        if (contacts) {
            const perParticle = new Map();
            for (const [a, b, w] of contacts) {
                perParticle.set(a, (perParticle.get(a) ?? 0) + w);
                perParticle.set(b, (perParticle.get(b) ?? 0) + w);
            }
            for (const i of inside) {
                weightSum += perParticle.get(i) ?? 0;
                weightSamples++;
            }
        }
    }
    const final = positionsOf(system);
    let escaped = 0;
    for (let i = 0; i < final.length; i += 2) if (final[i] < 0 || final[i] > width || final[i + 1] < 0) escaped++;
    wall.dispose();
    return {
        density: densitySum / samples,
        particles: system.GetParticleCount(),
        escaped,
        wFull: weightSamples ? weightSum / weightSamples : null,
    };
}

/**
 * P5: chorro de `weapon` contra una placa dinámica a `gap` m de la boca, en una junta prismática normal al
 * chorro con el motor a velocidad 0. La fuerza es el impulso del motor, `GetMotorForce(inv_dt) / inv_dt` sumado en
 * todos los subpasos de `stepWorld` (una pseudo-instancia después del contorno) entre `from` y `to` s, dividido por
 * el tiempo medido, con `inv_dt` el de un subpaso. `balance` es la misma fuerza por conservación del momento:
 * `(Σ m_p v_nacimiento − ΔP) / T`, con `ΔP` la variación del momento horizontal de las partículas vivas en esa
 * ventana; el test exige que ambas coincidan.
 */
export function plateBench(weapon, { gap = 1, from = 1, to = 2, makeRecorder = null } = {}) {
    const world = newWorld();
    const muzzle = { x: 0, y: 12, dx: 1, dy: 0 };
    const anchor = addSolids(world, []);
    const plateDef = new Box2D.b2BodyDef();
    plateDef.set_type(Box2D.b2_dynamicBody);
    const at = new Box2D.b2Vec2(gap + 0.1, muzzle.y);
    plateDef.set_position(at);
    const plate = world.CreateBody(plateDef);
    Box2D.destroy(plateDef);
    const shape = new Box2D.b2PolygonShape();
    shape.SetAsBox(0.1, 3);
    plate.CreateFixture(shape, 10);
    Box2D.destroy(shape);
    const axis = new Box2D.b2Vec2(1, 0);
    const jointDef = new Box2D.b2PrismaticJointDef();
    jointDef.Initialize(anchor, plate, at, axis);
    jointDef.set_enableMotor(true);
    jointDef.set_motorSpeed(0);
    jointDef.set_maxMotorForce(1e5);
    const joint = Box2D.castObject(world.CreateJoint(jointDef), Box2D.b2PrismaticJoint);
    Box2D.destroy(jointDef);
    Box2D.destroy(axis);
    Box2D.destroy(at);

    const { system, store, emitter, player } = emitterOn(world, weapon, muzzle);
    const wall = wallFor(system, store);
    const recorder = makeRecorder?.({ system, store, plate });
    const invDt = 8 / DT;
    const window = { on: false, impulse: 0, substeps: 0, births: 0 };
    const motor = {
        update() {
            if (!window.on) return;
            window.impulse += Math.abs(joint.GetMotorForce(invDt)) / invDt;
            window.substeps++;
        },
    };
    const momentum = () => {
        const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        let sum = 0;
        for (let i = 0; i < system.GetParticleCount(); i++) sum += Box2D.HEAPF32[vel + 2 * i];
        return sum * M_P;
    };
    const create = store.create.bind(store);
    store.create = (def, props) => {
        const index = create(def, props);
        if (index >= 0 && window.on) window.births += def.get_velocity().get_x() * M_P;
        return index;
    };
    let p0 = null;
    let travel = 0;
    let now = 100;
    recorder?.capture();
    for (let step = 1; step <= Math.round(to / DT); step++) {
        now += DT;
        window.on = step * DT > from + 1e-9;
        if (window.on && p0 === null) p0 = momentum();
        emitter.fire(0, player, true, DT, now);
        stepWorld(world, [wall, motor]);
        store.afterStep();
        recorder?.capture();
        travel = Math.max(travel, Math.abs(plate.GetPosition().get_x() - (gap + 0.1)));
    }
    const time = window.substeps / invDt;
    const result = {
        force: window.impulse / time,
        balance: (window.births - (momentum() - p0)) / time,
        travel,
        particles: system.GetParticleCount(),
        plate,
    };
    wall.dispose();
    emitter.dispose();
    return result;
}
