import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");
// RagImporter necesita PIXI para la vista de cada instancia; en Node alcanza con un stub
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
const { Flood, floodLevel, waterArea, rainTarget, rainX, RAIN_MARK } = await import("../js/flood.js");
const { DamageSystem } = await import("../js/damage.js");
const { RagImporter, stepWorld } = await import("../lib/ragimporter.js");
const { ActiveRagdoll } = await import("../js/ActiveRagdoll.js");

const DT = 1 / 60;
const F = LEVEL.flood;

function levelWith(overrides) {
    return { ...LEVEL, flood: { ...LEVEL.flood, ...overrides } };
}

function makeWorld(level = LEVEL) {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const { killSensors } = buildLevel(world, level);
    const system = fillPool(world, level);
    return { world, system, killSensors };
}

// Partículas de lluvia vivas (marcadas) del sistema
function marked(system) {
    const marks = system.GetUserDataBuffer() >> 2;
    let n = 0;
    for (let i = 0; i < system.GetParticleCount(); i++) if (Box2D.HEAP32[marks + i] === RAIN_MARK) n++;
    return n;
}

// Superficie medida: percentil 97 de la altura de las partículas lentas en una columna sin plataformas
function measuredSurface(system, x1 = 47.3, x2 = 49.7) {
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    const ys = [];
    for (let i = 0; i < system.GetParticleCount(); i++) {
        const x = Box2D.HEAPF32[pos + 2 * i];
        const speed = Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]);
        if (x > x1 && x < x2 && speed < 0.8) ys.push(Box2D.HEAPF32[pos + 2 * i + 1]);
    }
    ys.sort((a, b) => a - b);
    return ys[Math.floor(ys.length * 0.97)];
}

test("floodLevel: pileta antes de start, sube a riseSpeed y se frena en maxLevel", () => {
    assert.equal(floodLevel(0), LEVEL.pool.surface);
    assert.equal(floodLevel(F.start), LEVEL.pool.surface);
    assert.ok(Math.abs(floodLevel(F.start + 20) - (LEVEL.pool.surface + F.riseSpeed * 20)) < 1e-9);
    assert.equal(floodLevel(10000), F.maxLevel);
});

test("waterArea: 0 en la pileta, ancho del hueco sobre ella y total coherente con el presupuesto", () => {
    assert.equal(waterArea(LEVEL.pool.surface), 0);
    // entre 3 y 4 m solo está libre el hueco central (islas hasta y = 4)
    const hole = LEVEL.pool.x2 - LEVEL.pool.x1;
    assert.ok(Math.abs(waterArea(4) - hole) < 0.01, `área ${waterArea(4)}`);
    let previous = 0;
    for (let h = 3; h <= F.maxLevel; h += 0.5) {
        const area = waterArea(h);
        assert.ok(area >= previous, "el área no decrece");
        previous = area;
    }
    // diseño: ~636 m² a nivel máximo
    assert.ok(waterArea(F.maxLevel) > 600 && waterArea(F.maxLevel) < 680, `área ${waterArea(F.maxLevel)}`);
});

test("rainTarget: 0 antes de start y density × área después", () => {
    assert.equal(rainTarget(0), 0);
    assert.equal(rainTarget(F.start), 0);
    const t = F.start + 40;
    assert.equal(rainTarget(t), Math.round(F.density * waterArea(floodLevel(t))));
    assert.ok(rainTarget(10000) < F.maxParticles);
});

test("rainX: determinista, dentro del emisor y bien repartida", () => {
    const xs = Array.from({ length: 1000 }, (_, i) => rainX(i, F));
    assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, (_, i) => rainX(i, F)));
    for (const x of xs) assert.ok(x >= F.emitX1 && x <= F.emitX2);
    const buckets = new Array(10).fill(0);
    for (const x of xs) buckets[Math.min(9, Math.floor(((x - F.emitX1) / (F.emitX2 - F.emitX1)) * 10))]++;
    for (const count of buckets) assert.ok(count > 80 && count < 120, `reparto ${buckets}`);
});

test("la pileta se crea con radio 0,25 y la cantidad de partículas esperada", () => {
    const { system } = makeWorld();
    const count = system.GetParticleCount();
    assert.ok(Math.abs(system.GetRadius() - LEVEL.pool.radius) < 1e-6);
    // medido: 477 (grupo inicial más denso que la lluvia en reposo)
    assert.ok(count >= 420 && count <= 520, `${count} partículas en la pileta`);
});

test("nunca se supera maxParticles", () => {
    const level = levelWith({ maxParticles: 700, maxRate: 400 });
    const { world, system } = makeWorld(level);
    const flood = new Flood(world, system, level);
    let peak = 0;
    for (let i = 0; i < 1200; i++) {
        flood.step(150, DT);
        peak = Math.max(peak, system.GetParticleCount());
    }
    assert.ok(peak <= 700, `pico ${peak}`);
    assert.ok(peak >= 690, "debería llegar al tope");
    flood.dispose();
});

test("el agua asentada queda a ±0,4 m del nivel y no hay charcos altos", () => {
    const { world, system } = makeWorld();
    const flood = new Flood(world, system);
    const roundTime = F.start + 30; // nivel 7,5 m
    const level = floodLevel(roundTime);
    for (let i = 0; i < 60 * 40; i++) {
        flood.step(roundTime, DT);
        stepWorld(world, []);
    }
    const surface = measuredSurface(system);
    assert.ok(Math.abs(surface - level) < 0.4, `superficie ${surface?.toFixed(2)} vs nivel ${level}`);
    const local = flood.surfaceAt(48.5);
    assert.ok(Math.abs(local - level) < 0.5, `surfaceAt ${local} vs nivel ${level}`);
    assert.equal(flood.surfaceAt(48.5), flood.measureSurface(48.5));
    assert.ok(marked(system) <= rainTarget(roundTime), "no hay más gotas que las necesarias");

    const marks = system.GetUserDataBuffer() >> 2;
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    let pooled = 0;
    for (let i = 0; i < system.GetParticleCount(); i++) {
        const y = Box2D.HEAPF32[pos + 2 * i + 1];
        const speed = Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]);
        if (Box2D.HEAP32[marks + i] === RAIN_MARK && y > level + F.drainHeight + 0.5 && speed < F.drainSpeed) pooled++;
    }
    assert.ok(pooled < 5, `${pooled} gotas quietas muy por encima del agua`);
    flood.dispose();
});

test("surfaceAt: -Infinity antes de la inundación y sin agua en la columna", () => {
    const { world, system } = makeWorld();
    const flood = new Flood(world, system);
    for (let i = 0; i < 120; i++) {
        flood.step(10, DT);
        stepWorld(world, []);
    }
    assert.equal(flood.surfaceAt(7.5), -Infinity);
    // ya activa, pero todavía no cayó agua sobre la isla izquierda (la lluvia tarda en llegar)
    flood.step(95, DT);
    assert.equal(flood.active, true);
    assert.equal(flood.surfaceAt(7.5), -Infinity);
    // sobre la pileta sí hay agua
    assert.ok(Math.abs(flood.surfaceAt(28) - LEVEL.pool.surface) < 0.6);
    flood.dispose();
});

test("reset destruye la lluvia y devuelve la pileta a su estado inicial, aunque se haya salpicado", () => {
    const { world, system } = makeWorld();
    const flood = new Flood(world, system);
    const poolCount = system.GetParticleCount();
    for (let i = 0; i < 600; i++) {
        flood.step(130, DT);
        stepWorld(world, []);
    }
    assert.ok(marked(system) > 100);
    assert.equal(flood.active, true);

    // salpicadura: se sacan 60 partículas de la pileta (las primeras, que no son lluvia) fuera del hueco
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const marks = system.GetUserDataBuffer() >> 2;
    let moved = 0;
    for (let i = 0; i < system.GetParticleCount() && moved < 60; i++) {
        if (Box2D.HEAP32[marks + i] === RAIN_MARK) continue;
        Box2D.HEAPF32[pos + 2 * i] = 5 + moved * 0.01;
        Box2D.HEAPF32[pos + 2 * i + 1] = 9;
        moved++;
    }
    assert.equal(moved, 60);
    for (let i = 0; i < 30; i++) {
        flood.step(130, DT);
        stepWorld(world, []);
    }

    flood.reset();
    stepWorld(world, []);
    assert.equal(marked(system), 0);
    assert.equal(system.GetParticleCount(), poolCount);
    const { x1, x2, bottom, surface } = LEVEL.pool;
    const after = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    for (let i = 0; i < system.GetParticleCount(); i++) {
        const x = Box2D.HEAPF32[after + 2 * i];
        const y = Box2D.HEAPF32[after + 2 * i + 1];
        assert.ok(x > x1 && x < x2 && y > bottom && y < surface + 0.3, `partícula ${i} fuera del hueco: (${x}, ${y})`);
    }
    assert.equal(flood.active, false);
    assert.equal(flood.level, -Infinity);
    assert.equal(flood.drops, 0);
    flood.step(0, DT);
    assert.equal(system.GetParticleCount(), poolCount);
    flood.dispose();
});

// Dos robots en las islas, con el loop de index.html (sin render ni cámara)
async function setupMatch(level) {
    const { world, system, killSensors } = makeWorld(level);
    RagImporter.configure({ Box2D, PIXI });
    const json = JSON.parse(readFileSync(new URL("../assets/robot.rag.json", import.meta.url), "utf8"));
    const def = RagImporter.parse(json);
    const rig = {
        rootBody: json.ragdoll.rootBody,
        aimJoints: ["joint_11", "joint_11_copy"],
        aimOffset: 0,
        clips: { walk: "walk", jump: "jump", dead: "dead" },
        feet: ["b_4", "b_16"],
    };
    const players = [
        new ActiveRagdoll(def, world, 7.5, 4.05, rig, false),
        new ActiveRagdoll(def, world, 48.5, 4.05, rig, true),
    ];
    const damage = new DamageSystem(world, { DestroyParticle() {} });
    damage.killSensors = killSensors;
    damage.register(players);
    const flood = new Flood(world, system, level);
    const idle = { left: false, right: false, up: false };
    const instances = players.map((p) => p.rag);
    let now = 0;
    const timing = { process: 0 };
    const frame = (roundTime) => {
        players.forEach((p) => {
            p.move(idle);
            p.updateStatus(DT);
        });
        flood.step(roundTime, DT);
        stepWorld(world, instances);
        now += DT;
        const t0 = performance.now();
        damage.process(now, flood.surfaceAt);
        timing.process += performance.now() - t0;
    };
    return { players, flood, system, frame, timing };
}

test("un robot quieto bajo el agua pierde vida por cortocircuito; en seco, no", async () => {
    const dry = await setupMatch(LEVEL);
    for (let i = 0; i < 180; i++) dry.frame(50);
    dry.players.forEach((p) => assert.equal(p.hp, 100));

    // la curva (4,5 m) ya cubre los pies, pero el agua todavía no cayó: no se moja
    const early = await setupMatch(LEVEL);
    for (let i = 0; i < 30; i++) early.frame(100);
    early.players.forEach((p) => assert.equal(p.hp, 100));

    // con el agua asentada a ~7,5 m sobre las islas, un robot quieto pierde 3 de vida por segundo
    const wet = await setupMatch(LEVEL);
    for (let i = 0; i < 60 * 50; i++) wet.frame(120);
    assert.ok(wet.players.every((p) => p.wet), "el agua ya los alcanzó");
    wet.players.forEach((p) => (p.hp = 100)); // el agua ya los dañó mientras se asentaba
    const before = wet.players.map((p) => p.hp);
    for (let i = 0; i < 180; i++) wet.frame(120);
    wet.players.forEach((p, k) => {
        const lost = before[k] - p.hp;
        assert.ok(lost > 8 && lost < 9.2, `J${k + 1}: perdió ${lost.toFixed(2)} en 3 s (esperado ~9)`);
    });
});

test("costo: nivel al tope con dos robots (300 pasos)", async () => {
    // maxRate alto solo para llenar rápido el mapa en el test
    const level = levelWith({ maxRate: 1500 });
    const { players, flood, system, frame, timing } = await setupMatch(level);
    const roundTime = 170;
    for (let i = 0; i < 60 * 15; i++) frame(roundTime);
    timing.process = 0;
    const times = [];
    for (let i = 0; i < 300; i++) {
        const t0 = performance.now();
        frame(roundTime);
        times.push(performance.now() - t0);
    }
    const average = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(
        `costo: ${average.toFixed(2)} ms/frame con ${system.GetParticleCount()} partículas (${flood.drops} gotas); ` +
            `damage.process (agua local + borde inferior, 2 robots): ${(timing.process / 300).toFixed(3)} ms`,
    );
    assert.ok(system.GetParticleCount() <= F.maxParticles);
    assert.ok(Number.isFinite(players[0].torso.GetPosition().get_x()));
    assert.ok(average < 16, `${average.toFixed(2)} ms por frame`);
});