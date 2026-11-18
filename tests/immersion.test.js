// Puente agua del nivel -> disparos (#39, docs/design/07-sph.md §7.6): LiquidFun real, determinista
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadGame } from "./helpers/game.js";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");
globalThis.PIXI = {
    Container: class {
        addChild(child) {
            return child;
        }
        removeChild() {}
        destroy() {}
    },
};

const { LEVEL, buildLevel, fillPool } = await import("../js/level.js");
const { Flood } = await import("../js/flood.js");
const { Immersion } = await import("../js/immersion.js");
const { createParticleSystem } = await import("../js/particles.js");
const { WEAPONS, SHOT_SYSTEM, FLUID, fluidFromColor, CONTACT_LISTENER_PARTICLE } = await import("../js/weapons.js");
const { stepWorld } = await import("../lib/ragimporter.js");

const DT = 1 / 60;

function makeScene() {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    buildLevel(world);
    const pool = fillPool(world);
    const shots = createParticleSystem(world, SHOT_SYSTEM);
    const immersion = new Immersion(shots, pool);
    for (let i = 0; i < 120; i++) stepWorld(world, []);
    return { world, pool, shots, immersion };
}

function spawn(system, weapon, x, y, vx, vy) {
    const def = new Box2D.b2ParticleDef();
    const position = new Box2D.b2Vec2(x, y);
    const velocity = new Box2D.b2Vec2(vx, vy);
    const color = new Box2D.b2ParticleColor(...weapon.color, 255);
    def.set_flags(weapon.flags | CONTACT_LISTENER_PARTICLE);
    def.set_position(position);
    def.set_velocity(velocity);
    def.set_color(color);
    const index = system.CreateParticle(def);
    for (const o of [def, position, velocity, color]) Box2D.destroy(o);
    return index;
}

// Posición y velocidad de las partículas 0..n-1 del sistema
function read(system, n) {
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({
            x: Box2D.HEAPF32[pos + 2 * i],
            y: Box2D.HEAPF32[pos + 2 * i + 1],
            speed: Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]),
            vy: Box2D.HEAPF32[vel + 2 * i + 1],
        });
    }
    return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Resultado medido por fluido, para el informe
const measured = {};

function drop(weapon, bridge) {
    const { world, shots, immersion } = makeScene();
    for (let k = 0; k < 10; k++) spawn(shots, weapon, 28 + (k - 4.5) * 0.12, 6, 0, -10);
    const result = {};
    for (let step = 1; step <= 180; step++) {
        stepWorld(world, []);
        if (bridge) immersion.step(DT);
        if (step === 60) {
            assert.equal(shots.GetParticleCount(), 10, "no se destruye ninguna a 1 s");
            result.speed1 = mean(read(shots, 10).map((p) => p.speed));
            result.y1 = mean(read(shots, 10).map((p) => p.y));
        }
        if (step > 60 && step <= 180) {
            result.vy = (result.vy ?? 0) + mean(read(shots, 10).map((p) => p.vy)) / 120;
        }
    }
    assert.equal(shots.GetParticleCount(), 10, "no se destruye ninguna a 3 s");
    result.y3 = read(shots, 10).map((p) => p.y);
    result.y3mean = mean(result.y3);
    return result;
}

for (const weapon of WEAPONS) {
    test(`${weapon.name}: dentro de la pileta se frena, no se destruye y flota o se hunde según su tabla`, (t) => {
        const r = drop(weapon, true);
        measured[weapon.name] = r;
        t.diagnostic(
            `|v| a 1 s ${r.speed1.toFixed(2)} m/s, y a 1 s ${r.y1.toFixed(2)}, y a 3 s ${r.y3mean.toFixed(2)} ` +
                `(min ${Math.min(...r.y3).toFixed(2)}, max ${Math.max(...r.y3).toFixed(2)}), vy media 1-3 s ${r.vy.toFixed(3)}`,
        );
        assert.ok(r.speed1 < 2, `rapidez a 1 s ${r.speed1}`);
        if (weapon.id === FLUID.WATER || weapon.id === FLUID.ACID) {
            assert.ok(r.y3mean > 0.5 && r.y3mean < 3, `y a 3 s ${r.y3mean}`);
        } else if (weapon.id === FLUID.HONEY) {
            assert.ok(Math.abs(r.vy) < 0.5, `vy media ${r.vy}`);
            assert.ok(r.vy < 0.1, "no sube");
        } else if (weapon.id === FLUID.LAVA) {
            assert.ok(r.y3mean < 0.6, `y a 3 s ${r.y3mean}`);
        }
    });

    test(`${weapon.name}: control sin puente llega al fondo en menos de 1 s (después rebota)`, () => {
        const { world, shots } = makeScene();
        for (let k = 0; k < 10; k++) spawn(shots, weapon, 28 + (k - 4.5) * 0.12, 6, 0, -10);
        let lowest = Infinity;
        for (let step = 0; step < 60; step++) {
            stepWorld(world, []);
            lowest = Math.min(lowest, mean(read(shots, 10).map((p) => p.y)));
        }
        assert.ok(lowest < 1.2, `y media mínima ${lowest}`);
    });
}

test("la lluvia en vuelo no es agua: un disparo en el aire no figura en submerged", () => {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    buildLevel(world);
    const pool = fillPool(world);
    const shots = createParticleSystem(world, SHOT_SYSTEM);
    const flood = new Flood(world, pool);
    const immersion = new Immersion(shots, pool);
    for (let i = 0; i < 120; i++) stepWorld(world, []);
    // Disparo quieto a 10 m (sin gravedad propia no se puede: se repone cada paso), con lluvia cayendo cerca
    const water = WEAPONS.find((w) => w.id === FLUID.WATER);
    const x = 19; // columna sin plataformas encima: la lluvia pasa por acá
    let maxRainNear = 0;
    for (let step = 0; step < 120; step++) {
        flood.step(150, DT);
        const marker = spawn(shots, water, x, 10, 0, 0);
        stepWorld(world, []);
        immersion.step(DT);
        assert.ok(marker >= 0);
        for (let k = 0; k < immersion.count; k++) {
            const p = read(shots, shots.GetParticleCount())[immersion.submerged[k]];
            assert.ok(p.y < 3.5, `un disparo en y=${p.y.toFixed(2)} figura sumergido`);
        }
        for (const p of read(pool, pool.GetParticleCount())) {
            if (p.y > 8 && p.y < 12 && Math.abs(p.x - x) < 1.5) maxRainNear++;
        }
        // limpiar los disparos creados para que no caigan a la pileta
        for (let i = shots.GetParticleCount() - 1; i >= 0; i--) {
            if (read(shots, i + 1)[i].y > 5) shots.DestroyParticle(i);
        }
    }
    assert.ok(maxRainNear > 0, "hubo lluvia cerca del disparo");
});

test("interfaz: submerged y kinds tienen los disparos dentro de la pileta y ninguno de los de afuera", () => {
    const { world, shots, immersion } = makeScene();
    const [water, acid, lava] = [FLUID.WATER, FLUID.ACID, FLUID.LAVA].map((id) => WEAPONS.find((w) => w.id === id));
    const inside = [spawn(shots, water, 24, 1.5, 0, 0), spawn(shots, acid, 28, 1.5, 0, 0), spawn(shots, lava, 32, 1.5, 0, 0)];
    const outside = [spawn(shots, water, 28, 10, 0, 0), spawn(shots, acid, 5, 8, 0, 0), spawn(shots, lava, 50, 8, 0, 0)];
    immersion.step(DT);
    const got = new Map();
    for (let k = 0; k < immersion.count; k++) got.set(immersion.submerged[k], immersion.kinds[k]);
    assert.equal(immersion.count, 3);
    assert.equal(got.get(inside[0]), FLUID.WATER);
    assert.equal(got.get(inside[1]), FLUID.ACID);
    assert.equal(got.get(inside[2]), FLUID.LAVA);
    for (const i of outside) assert.ok(!got.has(i), `el ${i} no debería estar`);
    immersion.reset();
    assert.equal(immersion.count, 0);
});

test("fluidFromColor sale de la tabla de armas", () => {
    for (const w of WEAPONS) assert.equal(fluidFromColor(w.color[0], w.color[1]), w.id);
    assert.equal(fluidFromColor(40, 120), 0);
});

test("DestroyParticle difiere el borrado al próximo Step: los índices del paso siguen valiendo", () => {
    const { world, shots, immersion } = makeScene();
    const water = WEAPONS.find((w) => w.id === FLUID.WATER);
    for (let k = 0; k < 5; k++) spawn(shots, water, 26 + k, 1.5, 0, 0);
    stepWorld(world, []);
    immersion.step(DT);
    assert.equal(immersion.count, 5);
    shots.DestroyParticle(2);
    assert.equal(shots.GetParticleCount(), 5, "el conteo no baja hasta el próximo Step");
    assert.doesNotThrow(() => immersion.step(DT));
    assert.equal(immersion.count, 5, "sigue leyendo los mismos índices");
    stepWorld(world, []);
    assert.equal(shots.GetParticleCount(), 4);
    immersion.step(DT);
    assert.equal(immersion.count, 4);
});

test("costo: inundación al tope y dos jugadores disparando agua al agua (300 frames)", async () => {
    const savedRate = LEVEL.flood.maxRate;
    LEVEL.flood.maxRate = 1500; // solo para llenar rápido el mapa en el test; la config se comparte por referencia
    try {
        const game = await loadGame();
        const { world, match, immersion, flood, damage, particleSystem, poolSystem, players } = game.state;
        game.setPad(0);
        game.setPad(1);
        game.frames(10);
        match.roundTime = 170;
        game.frames(60 * 20);
        assert.ok(flood.drops >= 3500, `la inundación no llegó al tope: ${flood.drops} gotas`);

        // performance.now del juego es un reloj simulado: los tiempos se miden con hrtime
        const ms = { step: 0, flood: 0, immersion: 0, process: 0 };
        const timed = (owner, name, key) => {
            const original = owner[name].bind(owner);
            owner[name] = (...args) => {
                const t0 = process.hrtime.bigint();
                const result = original(...args);
                ms[key] += Number(process.hrtime.bigint() - t0) / 1e6;
                return result;
            };
        };
        timed(world, "Step", "step");
        timed(flood, "step", "flood");
        timed(immersion, "step", "immersion");
        timed(damage, "process", "process");
        let steps = 0;
        let wet = 0;
        const originalStep = immersion.step;
        immersion.step = (dt) => {
            originalStep(dt);
            steps++;
            wet += immersion.count;
        };

        // Cada jugador apunta hacia abajo y al centro: el chorro cae al agua; los tanques se reponen
        game.setPad(0, { buttons: [0], axes: [0, 0, 0.7, 0.7] });
        game.setPad(1, { buttons: [0], axes: [0, 0, -0.7, 0.7] });
        let maxShots = 0;
        let wallMs = 0;
        for (let i = 0; i < 300; i++) {
            if (i % 30 === 0) players.forEach((p) => p.tanks.set(4, 300));
            const t0 = process.hrtime.bigint();
            game.frame();
            wallMs += Number(process.hrtime.bigint() - t0) / 1e6;
            maxShots = Math.max(maxShots, particleSystem.GetParticleCount());
        }
        const frames = 300;
        const physics = (ms.step + ms.flood + ms.immersion + ms.process) / frames;
        console.log(
            `costo #39: física+lógica ${physics.toFixed(2)} ms/frame (world.Step ${(ms.step / frames).toFixed(2)}, ` +
                `flood.step ${(ms.flood / frames).toFixed(3)}, immersion.step ${(ms.immersion / frames).toFixed(3)} ` +
                `[${(ms.immersion / steps).toFixed(3)} ms/paso], damage.process ${(ms.process / frames).toFixed(3)}); ` +
                `frame completo ${(wallMs / frames).toFixed(2)} ms; ${poolSystem.GetParticleCount()} partículas de agua ` +
                `(${flood.drops} gotas), hasta ${maxShots} disparos, ${(wet / steps).toFixed(0)} sumergidos de media`,
        );
        assert.ok(wet > 0, "algún disparo llegó al agua");
        assert.ok(ms.immersion / frames < 0.5, `immersion.step ${(ms.immersion / frames).toFixed(3)} ms/frame`);
        assert.ok(physics < 16, `${physics.toFixed(2)} ms por frame`);
    } finally {
        LEVEL.flood.maxRate = savedRate;
    }
});