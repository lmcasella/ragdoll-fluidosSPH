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
const { LEVEL, buildLevel } = await import("../../js/level.js");
const { createParticleSystem } = await import("../../js/particles.js");
const { SHOT_SYSTEM, WEAPONS, FLUID } = await import("../../js/weapons.js");
const { ParticleStore, ORIGIN } = await import("../../js/particleStore.js");
const { WallContact } = await import("../../js/wallContact.js");
const { ShallowWater } = await import("../../js/water.js");
const { Immersion } = await import("../../js/immersion.js");
const { Flood, floodLevel, waterArea, levelOfArea } = await import("../../js/flood.js");
const { MATERIALS, SIGMA_W } = await import("../../js/materials.js");

/**
 * Escenario del agua de #71 (docs/design/14-agua.md §14.13) sin robots: el mundo del nivel real, el sistema de
 * disparos con su `ParticleStore` y el contorno inelástico, el campo de alturas, `Immersion` y `Flood`, conectados con
 * el orden del paso fijo de `index.html`. LiquidFun real y determinista.
 */
export const DT = 1 / 60;
export const G = 10;

/** Área que representa cada partícula del sistema de disparos (m²): `(1,5 r)²`. */
export const A_P = (1.5 * SHOT_SYSTEM.radius) ** 2;

/** Radio de las partículas (m). */
export const RADIUS = SHOT_SYSTEM.radius;

const COLORS = new Map(WEAPONS.map((w) => [w.id, w.color]));
const MISCIBLE = new Set([FLUID.WATER, FLUID.ACID, FLUID.HONEY]);

/** Crea el escenario. `fill` (opcional) es el nivel (m) con el que arranca el campo. */
export function makeScene({ fill = null } = {}) {
    const gravity = new Box2D.b2Vec2(0, -G);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    buildLevel(world);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = new WallContact(system, store, SHOT_SYSTEM);
    const water = new ShallowWater();
    if (fill !== null) fillField(water, fill);
    const immersion = new Immersion(system, store, water);
    const flood = new Flood(store, water);
    const def = new Box2D.b2ParticleDef();
    const position = new Box2D.b2Vec2(0, 0);
    const velocity = new Box2D.b2Vec2(0, 0);
    const colors = new Map([...COLORS].map(([id, rgb]) => [id, new Box2D.b2ParticleColor(...rgb, 255)]));
    const scene = {
        world,
        system,
        store,
        wall,
        water,
        immersion,
        flood,
        steps: 0,
        /** Un paso fijo, en el orden de `index.html`. */
        step(roundTime = 0) {
            flood.step(roundTime, DT);
            stepWorld(world, [wall]);
            store.afterStep();
            immersion.step(DT);
            water.step(DT);
            scene.steps++;
        },
        /** Crea una partícula de `kind` en `(x, y)` con velocidad `(vx, vy)`; devuelve su índice. */
        spawn(kind, x, y, vx = 0, vy = 0, props = {}) {
            position.set_x(x);
            position.set_y(y);
            velocity.set_x(vx);
            velocity.set_y(vy);
            def.set_position(position);
            def.set_velocity(velocity);
            def.set_color(colors.get(kind));
            return store.create(def, { kind, origin: ORIGIN.SHOT, ...props });
        },
        dispose() {
            Box2D.destroy(def);
            Box2D.destroy(position);
            Box2D.destroy(velocity);
            for (const color of colors.values()) Box2D.destroy(color);
            wall.dispose();
            flood.dispose();
        },
    };
    return scene;
}

/** Llena el campo hasta `level` (m) sobre el lecho, en reposo y a temperatura ambiente. */
export function fillField(water, level) {
    for (let i = 0; i < water.N; i++) {
        water.h[i] = Math.max(0, level - water.b[i]);
        water.q[i] = 0;
        water.E[i] = SIGMA_W * MATERIALS.water.c * water.h[i] * water.config.ambientT;
    }
}

/** Posición `(x, y)` y velocidad `(vx, vy)` de la partícula `i` del sistema. */
export function particle(system, i) {
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    return {
        x: Box2D.HEAPF32[pos + 2 * i],
        y: Box2D.HEAPF32[pos + 2 * i + 1],
        vx: Box2D.HEAPF32[vel + 2 * i],
        vy: Box2D.HEAPF32[vel + 2 * i + 1],
    };
}

/** Perfil `η` por celda del campo. */
export function profile(water) {
    const eta = new Float64Array(water.N);
    for (let i = 0; i < water.N; i++) eta[i] = water.b[i] + water.h[i];
    return eta;
}

/**
 * I3: `count` gotas de agua sueltas en reposo sobre la pileta, en una columna vertical en `x0` separadas `1,5 r` (el
 * paso de empaquetado), la primera 0,3 m sobre la superficie: caen en caída libre y llegan una tras otra. Corre
 * `seconds` s y devuelve `eta` (un perfil por paso) y los pasos de la primera (`firstAt`) y la última (`lastAt`)
 * absorción. `makeRecorder` (opcional) es una función `(scene) => Recorder` y graba un frame por paso.
 */
export function wavePulse({ x0 = 28, count = 20, seconds = 2, makeRecorder = null } = {}) {
    const scene = makeScene();
    const recorder = makeRecorder?.(scene);
    const surface = LEVEL.pool.surface;
    for (let k = 0; k < count; k++) scene.spawn(FLUID.WATER, x0, surface + 0.3 + k * 1.5 * RADIUS);
    const eta = [];
    let firstAt = -1;
    let lastAt = -1;
    recorder?.capture();
    for (let s = 0; s < Math.round(seconds * 60); s++) {
        scene.step();
        eta.push(profile(scene.water));
        const absorbed = scene.immersion.stats.absorbed;
        if (firstAt < 0 && absorbed > 0) firstAt = s;
        if (lastAt < 0 && absorbed === count) lastAt = s;
        recorder?.capture();
    }
    return { scene, eta, firstAt, lastAt };
}

/**
 * I4, I7 y W6: la inundación completa sobre el nivel real, sin robots. Corre `seconds` s de lluvia desde
 * `LEVEL.flood.start`, mide cada `sample` s y devuelve las muestras con el volumen total, lo retenido y lo que
 * vuela, el `η` medio contra la curva y los controles de positividad y de absorción. `makeRecorder` (opcional) es
 * una función `(scene) => Recorder` y graba un frame cada `stride` pasos.
 */
export function floodRun({ seconds = 170, sample = 10, makeRecorder = null, stride = 10 } = {}) {
    const scene = makeScene();
    const recorder = makeRecorder?.(scene);
    const { water, store, system, flood, immersion } = scene;
    const start = LEVEL.flood.start;
    const volume0 = water.volume();
    const samples = [];
    const miscibleBelow = { stepsWithOffenders: 0, maxOffenders: 0, maxBefore: 0 };
    let maxRetained = 0;
    let maxCount = 0;
    const offenders = () => {
        let n = 0;
        const count = system.GetParticleCount();
        for (let i = 0; i < count; i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || store.alive[slot] === 0 || !MISCIBLE.has(store.kind[slot])) continue;
            const p = particle(system, i);
            if (p.x < 0 || p.x > LEVEL.bounds.maxX) continue;
            if (p.y < water.surfaceAt(p.x) - 2 * RADIUS) n++;
        }
        return n;
    };
    const census = () => {
        let flying = 0;
        let retained = 0;
        const count = system.GetParticleCount();
        for (let i = 0; i < count; i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || store.alive[slot] === 0) continue;
            const p = particle(system, i);
            if (Math.hypot(p.vx, p.vy) < 1) retained++;
            else flying++;
        }
        return { flying, retained };
    };
    const original = immersion.step.bind(immersion);
    immersion.step = (dt) => {
        miscibleBelow.maxBefore = Math.max(miscibleBelow.maxBefore, offenders());
        original(dt);
        const n = offenders();
        if (n > 0) miscibleBelow.stepsWithOffenders++;
        miscibleBelow.maxOffenders = Math.max(miscibleBelow.maxOffenders, n);
    };
    const steps = Math.round(seconds * 60);
    const every = Math.round(sample * 60);
    recorder?.capture();
    for (let s = 1; s <= steps; s++) {
        const roundTime = start + s * DT;
        scene.step(roundTime);
        maxCount = Math.max(maxCount, system.GetParticleCount());
        if (recorder && s % stride === 0) recorder.capture();
        if (s % every === 0 || s === steps) {
            const { flying, retained } = census();
            maxRetained = Math.max(maxRetained, retained);
            const level = floodLevel(roundTime);
            const total = water.volume() + (flying + retained) * A_P;
            const fieldLevel = levelOfArea(water.volume() - volume0);
            let etaSum = 0;
            let etaCells = 0;
            for (let i = 0; i < water.N; i++) {
                if (water.b[i] >= fieldLevel) continue;
                etaSum += water.b[i] + water.h[i];
                etaCells++;
            }
            samples.push({
                realEta: etaSum / etaCells,
                t: s * DT,
                curveLevel: level,
                meanLevel: flood.meanLevel,
                fieldLevel,
                curveVolume: volume0 + waterArea(level),
                emittedVolume: volume0 + flood.emitted * A_P + water.stats.sourced,
                total,
                field: water.volume(),
                flying,
                retained,
                rate: flood.rate,
            });
        }
    }
    return { scene, samples, miscibleBelow, maxRetained, maxCount, volume0 };
}
