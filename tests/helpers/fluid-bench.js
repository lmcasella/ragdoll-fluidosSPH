// Banco de pruebas de los fluidos (docs/design/07-sph.md §7.5): LiquidFun real, determinista, sin Math.random.
// Cada función recibe los parámetros del sistema y las flags como argumento y devuelve las métricas.
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
const { ShotEmitter } = await import("../../js/weapons.js");
const { ParticleStore } = await import("../../js/particleStore.js");
const { LEVEL, buildLevel } = await import("../../js/level.js");

const DT = 1 / 60;
// Una partícula en reposo sobre el piso queda a ~1,65 radios (medido): con radio + 0,02 m la miel nunca "impactaba"
const IMPACT_HEIGHT = 2;

function newWorld() {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    return world;
}

function buffers(system) {
    return {
        pos: Box2D.getPointer(system.GetPositionBuffer()) >> 2,
        vel: Box2D.getPointer(system.GetVelocityBuffer()) >> 2,
    };
}

function percentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
}

// Piso estático de x -10 a 20 con tope en y = 0 y paredes de 2 m en los extremos
function buildBox(world) {
    const bodyDef = new Box2D.b2BodyDef();
    const ground = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(0, 0);
    for (const [x, y, w, h] of [[5, -0.5, 30, 1], [-10.5, 1, 1, 4], [20.5, 1, 1, 4]]) {
        center.set_x(x);
        center.set_y(y);
        shape.SetAsBox(w / 2, h / 2, center, 0);
        ground.CreateFixture(shape, 0);
    }
    Box2D.destroy(center);
    Box2D.destroy(shape);
}

// Banco 1. `weapon` es una fila de WEAPONS (o una copia con otras flags)
export function shotBench(systemParams, weapon) {
    const world = newWorld();
    buildBox(world);
    const system = createParticleSystem(world, systemParams);
    const radius = system.GetRadius();
    const fakeDamage = { shotId: () => 1 };
    const emitter = new ShotEmitter(new ParticleStore(system, systemParams), fakeDamage, [weapon]);
    const angle = (-30 * Math.PI) / 180;
    const player = {
        weapon: weapon.id,
        tanks: new Map([[weapon.id, weapon.tank]]),
        dead: false,
        muzzle: () => ({ x: -4, y: 1.5, dx: Math.cos(angle), dy: Math.sin(angle) }),
    };

    const STEPS = 60 * 6;
    const history = [];
    let now = 100;
    for (let step = 0; step < STEPS; step++) {
        now += DT;
        emitter.fire(0, player, step < 60, DT, now);
        stepWorld(world, []);
        const n = system.GetParticleCount();
        const { pos, vel } = buffers(system);
        const frame = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
            frame[i * 4] = Box2D.HEAPF32[pos + 2 * i];
            frame[i * 4 + 1] = Box2D.HEAPF32[pos + 2 * i + 1];
            frame[i * 4 + 2] = Box2D.HEAPF32[vel + 2 * i];
            frame[i * 4 + 3] = Box2D.HEAPF32[vel + 2 * i + 1];
        }
        history.push(frame);
    }
    const total = system.GetParticleCount();

    let sumArrival = 0;
    let sumRebound = 0;
    const ratios = [];
    let lastImpact = -1;
    let impacted = 0;
    for (let i = 0; i < total; i++) {
        let impact = -1;
        for (let s = 0; s < STEPS; s++) {
            if (i * 4 + 3 < history[s].length && history[s][i * 4 + 1] <= IMPACT_HEIGHT * radius) {
                impact = s;
                break;
            }
        }
        if (impact < 1) continue;
        impacted++;
        const arrival = Math.abs(history[impact - 1][i * 4 + 3]);
        let rebound = 0;
        for (let s = impact + 1; s <= Math.min(STEPS - 1, impact + 30); s++) rebound = Math.max(rebound, history[s][i * 4 + 3]);
        sumArrival += arrival;
        sumRebound += rebound;
        if (arrival > 0) ratios.push(rebound / arrival);
        lastImpact = Math.max(lastImpact, impact);
    }

    let isolated = 0;
    const at = Math.min(STEPS - 1, lastImpact + 60);
    const frame = history[at];
    for (let i = 0; i < total; i++) {
        let alone = true;
        for (let j = 0; j < total && alone; j++) {
            if (j !== i && Math.hypot(frame[i * 4] - frame[j * 4], frame[i * 4 + 1] - frame[j * 4 + 1]) < 0.2) alone = false;
        }
        if (alone) isolated++;
    }
    // Charco: partículas a menos de 0,5 m del piso en el paso medido (ancho p95 - p5 y rapidez p95)
    const puddleX = [];
    const puddleSpeed = [];
    for (let i = 0; i < total; i++) {
        if (frame[i * 4 + 1] > 0.5) continue;
        puddleX.push(frame[i * 4]);
        puddleSpeed.push(Math.hypot(frame[i * 4 + 2], frame[i * 4 + 3]));
    }
    const metrics = {
        emitted: total,
        spread: percentile(puddleX, 0.95) - percentile(puddleX, 0.05),
        restSpeedP95: percentile(puddleSpeed, 0.95),
        impacted,
        rebound: sumArrival > 0 ? sumRebound / sumArrival : 0,
        reboundP90: percentile(ratios, 0.9),
        isolatedPct: total ? (100 * isolated) / total : 0,
        measuredAtStep: at,
    };
    emitter.dispose();
    return metrics;
}

// Banco 2: rotura de presa en la pileta real. `flags` se aplica al grupo
export function poolBench(physics, flags = 0) {
    const world = newWorld();
    buildLevel(world, LEVEL);
    const system = createParticleSystem(world, { radius: LEVEL.pool.radius, maxCount: LEVEL.flood.maxParticles, ...physics });

    const groupDef = new Box2D.b2ParticleGroupDef();
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(25.5, 1.95);
    shape.SetAsBox(7.5 - 0.1, 1.95, center, 0);
    groupDef.set_shape(shape);
    groupDef.set_flags(flags);
    system.CreateParticleGroup(groupDef);
    Box2D.destroy(center);
    Box2D.destroy(shape);
    Box2D.destroy(groupDef);

    let front = Infinity;
    let meanSum = 0;
    let p95Sum = 0;
    let restSteps = 0;
    const speeds = [];
    const COLUMNS = 19;
    let surface = [];
    for (let step = 1; step <= 60 * 9; step++) {
        stepWorld(world, []);
        const n = system.GetParticleCount();
        const { pos, vel } = buffers(system);
        if (front === Infinity) {
            for (let i = 0; i < n; i++) {
                if (Box2D.HEAPF32[pos + 2 * i] >= 37) {
                    front = step * DT;
                    break;
                }
            }
        }
        if (step === 60 * 8) {
            const columns = Array.from({ length: COLUMNS }, () => []);
            for (let i = 0; i < n; i++) {
                const c = Math.floor(Box2D.HEAPF32[pos + 2 * i] - 18.5);
                if (c >= 0 && c < COLUMNS) columns[c].push(Box2D.HEAPF32[pos + 2 * i + 1]);
            }
            surface = columns.map((col) => percentile(col, 0.9));
        }
        if (step > 60 * 8) {
            speeds.length = 0;
            for (let i = 0; i < n; i++) speeds.push(Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]));
            meanSum += speeds.reduce((a, b) => a + b, 0) / n;
            p95Sum += percentile(speeds, 0.95);
            restSteps++;
        }
    }
    const mean = surface.reduce((a, b) => a + b, 0) / surface.length;
    return {
        particles: system.GetParticleCount(),
        front,
        surfaceStd: Math.sqrt(surface.reduce((a, b) => a + (b - mean) ** 2, 0) / surface.length),
        surfaceRange: Math.max(...surface) - Math.min(...surface),
        speedMean: meanSum / restSteps,
        speedP95: p95Sum / restSteps,
    };
}
