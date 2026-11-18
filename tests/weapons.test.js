import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");

const { WEAPONS, FLUID, LOADOUT, weaponById, particleDamage, equipLoadout, cycleWeapon, ShotEmitter } = await import(
    "../js/weapons.js"
);
const { DamageSystem } = await import("../js/damage.js");

const DT = 1 / 60;

test("la tabla de armas tiene los valores del diseño", () => {
    const row = (id) => {
        const w = weaponById(id);
        return [w.rate, w.speed, w.spread, w.tank, w.dps];
    };
    assert.deepEqual(row(FLUID.ACID), [90, 14, 0.035, 135, 20]);
    assert.deepEqual(row(FLUID.LAVA), [60, 10, 0.017, 90, 12]);
    assert.deepEqual(row(FLUID.HONEY), [50, 8, 0.017, 75, 0]);
    assert.deepEqual(WEAPONS.map((w) => w.id), LOADOUT);
});

test("particleDamage es dps / caudal", () => {
    assert.ok(Math.abs(particleDamage(weaponById(FLUID.ACID)) - 20 / 90) < 1e-12);
    assert.equal(particleDamage(weaponById(FLUID.HONEY)), 0);
});

test("equipLoadout llena los tanques y equipa la primera arma", () => {
    const player = {};
    equipLoadout(player);
    assert.equal(player.weapon, FLUID.ACID);
    assert.deepEqual([...player.tanks], [[1, 135], [2, 90], [3, 75]]);
});

test("cycleWeapon da la vuelta sobre el inventario en el orden de la tabla", () => {
    const player = {};
    equipLoadout(player);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.LAVA);
    cycleWeapon(player, 1);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.ACID);
    cycleWeapon(player, -1);
    assert.equal(player.weapon, FLUID.HONEY);
    player.tanks.delete(FLUID.LAVA);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.ACID);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.HONEY);
});

// Mundo sin gravedad y sin cuerpos: el chorro avanza en línea recta y se puede medir
function setup({ maxCount = 1500, gravity = 0 } = {}) {
    const g = new Box2D.b2Vec2(0, gravity);
    const world = new Box2D.b2World(g);
    Box2D.destroy(g);
    const psDef = new Box2D.b2ParticleSystemDef();
    psDef.set_radius(0.1);
    psDef.set_maxCount(maxCount);
    psDef.set_destroyByAge(false);
    const system = world.CreateParticleSystem(psDef);
    Box2D.destroy(psDef);
    const damage = new DamageSystem(world, system);
    const emitter = new ShotEmitter(system, damage, WEAPONS);
    const player = { dead: false, muzzle: () => ({ x: 0, y: 5, dx: 1, dy: 0 }) };
    equipLoadout(player);
    let now = 100;
    const fire = (wants, k = 0, p = player) => {
        now += DT;
        return emitter.fire(k, p, wants, DT, now);
    };
    return { world, system, damage, emitter, player, fire, tick: () => world.Step(DT, 8, 3, 3), time: () => now };
}

test("1 s a 60 fps emite el caudal del arma y el tanque baja lo mismo", () => {
    for (const weapon of WEAPONS) {
        const { system, player, fire } = setup();
        player.weapon = weapon.id;
        let emitted = 0;
        for (let i = 0; i < 60; i++) emitted += fire(true);
        assert.ok(Math.abs(emitted - weapon.rate) <= 2, `${weapon.name}: ${emitted} partículas`);
        assert.equal(system.GetParticleCount(), emitted);
        assert.equal(player.tanks.get(weapon.id), weapon.tank - emitted);
    }
});

test("la primera partícula de la ráfaga sale en el primer frame", () => {
    const { fire } = setup();
    assert.equal(fire(true), 1);
});

test("un frame largo no larga un tapón: tope de ceil(caudal × 0,05) por frame", () => {
    const { emitter, player } = setup();
    emitter.fire(0, player, true, DT, 1);
    assert.equal(emitter.fire(0, player, true, 0.25, 1.25), 5);
});

test("con el tanque vacío deja de emitir y no pasa a negativo", () => {
    const { system, player, fire } = setup();
    player.tanks.set(FLUID.ACID, 20);
    let emitted = 0;
    for (let i = 0; i < 120; i++) emitted += fire(true);
    assert.equal(emitted, 20);
    assert.equal(system.GetParticleCount(), 20);
    assert.equal(player.tanks.get(FLUID.ACID), 0);
    assert.equal(player.tanks.get(FLUID.LAVA), 90, "el resto del inventario conserva lo suyo");
});

test("las partículas salen con la velocidad, la dispersión y los flags del arma", () => {
    const { system, player, fire } = setup();
    player.weapon = FLUID.LAVA;
    fire(true);
    fire(true); // 2 partículas
    fire(true);
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    const lava = weaponById(FLUID.LAVA);
    for (let i = 0; i < system.GetParticleCount(); i++) {
        const speed = Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]);
        assert.ok(Math.abs(speed - lava.speed) < 1e-3);
        assert.ok(Math.abs(Math.atan2(Box2D.HEAPF32[vel + 2 * i + 1], Box2D.HEAPF32[vel + 2 * i])) <= lava.spread + 1e-6);
        assert.ok(Box2D.HEAPF32[pos + 2 * i] >= 0.15 - 1e-6);
    }
    const flags = system.GetParticleFlags(0);
    assert.equal(flags & (1 << 7), 1 << 7, "tensile");
    assert.equal(flags & (1 << 14), 1 << 14, "contact listener");
});

test("las n partículas de un frame se reparten sobre el tramo recorrido, separadas por velocidad / caudal", () => {
    const { system, player, emitter } = setup();
    emitter.fire(0, player, true, DT, 1);
    assert.equal(emitter.fire(0, player, true, 0.25, 2), 5);
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const step = 14 / 90;
    for (let j = 0; j < 5; j++) {
        const x = Box2D.HEAPF32[pos + 2 * (1 + j)];
        assert.ok(Math.abs(x - (0.15 + step * (4 - j))) < 1e-5, `partícula ${j}: x=${x}`);
    }
});

test("la dispersión es determinista y toma varios valores", () => {
    const run = () => {
        const { system, fire } = setup();
        for (let i = 0; i < 40; i++) fire(true);
        const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        return Array.from({ length: system.GetParticleCount() }, (_, i) => Box2D.HEAPF32[vel + 2 * i + 1]);
    };
    const a = run();
    const b = run();
    assert.deepEqual(a, b);
    assert.ok(new Set(a.map((v) => v.toFixed(3))).size > 10);
});

test("cada partícula queda marcada con el id de su tramo de disparo", () => {
    const { system, damage, fire } = setup();
    for (let i = 0; i < 30; i++) fire(true); // 0,5 s
    const tags = system.GetUserDataBuffer() >> 2;
    const seen = new Set();
    for (let i = 0; i < system.GetParticleCount(); i++) seen.add(Box2D.HEAP32[tags + i]);
    assert.ok(!seen.has(0));
    assert.equal(seen.size, damage.shots.size);
    assert.ok(seen.size >= 5 && seen.size <= 6, `${seen.size} tramos en 0,5 s`);
});

test("soltar el botón lleva el crédito a 0: la ráfaga siguiente arranca con 1", () => {
    const { fire } = setup();
    fire(true);
    fire(true);
    fire(false);
    assert.equal(fire(true), 1);
});

test("con el sistema lleno no emite, no descuenta y CreateParticle devuelve -1 sin romper", () => {
    const { world, system, player, fire, tick } = setup({ maxCount: 40 });
    let emitted = 0;
    for (let i = 0; i < 90; i++) emitted += fire(true);
    assert.equal(system.GetParticleCount(), 40);
    assert.equal(emitted, 40);
    assert.equal(player.tanks.get(FLUID.ACID), 135 - 40, "no descuenta lo que no pudo emitir");

    // el emisor se frena solo antes de pedirle algo al motor; se prueba el motor directo
    const def = new Box2D.b2ParticleDef();
    const index = system.CreateParticle(def);
    Box2D.destroy(def);
    console.log(`CreateParticle con el sistema lleno (maxCount 40, destroyByAge false): ${index}`);
    assert.equal(index, -1);
    assert.equal(system.GetParticleCount(), 40);
    for (let i = 0; i < 30; i++) tick();
    assert.equal(system.GetParticleCount(), 40);
    assert.ok(Number.isFinite(Box2D.HEAPF32[Box2D.getPointer(system.GetPositionBuffer()) >> 2]));
    void world;
});

test("si el motor devuelve un índice negativo, el emisor corta sin descontar de más", () => {
    const { system, player, emitter } = setup();
    let calls = 0;
    const real = system.CreateParticle.bind(system);
    system.CreateParticle = (def) => (++calls <= 2 ? real(def) : -1);
    emitter.fire(0, player, true, DT, 1);
    const made = emitter.fire(0, player, true, 0.25, 2); // pide 5
    assert.equal(made, 1, "una sale, la segunda devuelve -1 y corta");
    assert.equal(player.tanks.get(FLUID.ACID), 135 - 2);
});

test("después de reset() no emite hasta un frame con el botón suelto", () => {
    const { system, player, emitter, fire } = setup();
    for (let i = 0; i < 10; i++) fire(true);
    const before = system.GetParticleCount();
    emitter.reset();
    for (let i = 0; i < 30; i++) assert.equal(fire(true), 0, "el botón que pidió el reinicio sigue apretado");
    assert.equal(system.GetParticleCount(), before);
    fire(false);
    assert.equal(fire(true), 1);
    assert.ok(player.tanks.get(FLUID.ACID) < 135);
});

test("un robot muerto no emite", () => {
    const { player, fire } = setup();
    player.dead = true;
    assert.equal(fire(true), 0);
});

test("dispose libera lo nativo sin romper", () => {
    const { emitter } = setup();
    emitter.dispose();
});
