import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");

const { WEAPONS, FLUID, LOADOUT, SHOT_SYSTEM, weaponById, particleDamage, equipLoadout, cycleWeapon, ShotEmitter } =
    await import("../js/weapons.js");
const { DamageSystem } = await import("../js/damage.js");
const { SIGMA_W, MATERIALS } = await import("../js/materials.js");
const { ParticleStore } = await import("../js/particleStore.js");
const { getRaycaster } = await import("../js/raycast.js");

const DT = 1 / 60;

test("la tabla de armas tiene los valores del diseño", () => {
    const row = (id) => {
        const w = weaponById(id);
        return [w.rate, w.speed, w.spread, w.tank, w.dps, w.lanes];
    };
    assert.deepEqual(row(FLUID.WATER), [155, 14, 0.035, 600, 0, 1]);
    assert.deepEqual(row(FLUID.ACID), [155, 14, 0.035, 272, 20, 1]);
    assert.deepEqual(row(FLUID.LAVA), [111, 10, 0.017, 180, 12, 1]);
    assert.deepEqual(row(FLUID.HONEY), [100, 18, 0.017, 152, 0, 1]);
    assert.equal(WEAPONS[0].id, FLUID.WATER, "el agua es la primera fila");
    assert.deepEqual(WEAPONS[0].color, [90, 170, 255]);
    assert.deepEqual(WEAPONS.map((w) => w.id), LOADOUT.weapons);
    assert.equal(LOADOUT.weapon, FLUID.WATER);
});

test("particleDamage es dps / caudal", () => {
    assert.ok(Math.abs(particleDamage(weaponById(FLUID.ACID)) - 20 / 155) < 1e-12);
    assert.equal(particleDamage(weaponById(FLUID.HONEY)), 0);
});

test("equipLoadout llena los tanques y equipa el agua", () => {
    const player = {};
    equipLoadout(player);
    assert.equal(player.weapon, FLUID.WATER);
    assert.equal(player.tanks.get(FLUID.WATER), 600);
    assert.deepEqual([...player.tanks], [[4, 600], [1, 272], [2, 180], [3, 152]]);
});

test("cycleWeapon da la vuelta sobre el inventario en el orden de la tabla", () => {
    const player = {};
    equipLoadout(player);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.ACID);
    cycleWeapon(player, 1);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.HONEY);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.WATER);
    cycleWeapon(player, -1);
    assert.equal(player.weapon, FLUID.HONEY);
    player.tanks.delete(FLUID.LAVA);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.WATER);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.ACID);
    cycleWeapon(player, 1);
    assert.equal(player.weapon, FLUID.HONEY);
});

/** Mundo sin gravedad y sin cuerpos: el chorro avanza en línea recta y se puede medir. */
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
    const store = new ParticleStore(system, SHOT_SYSTEM, maxCount);
    const damage = new DamageSystem(world, store);
    const emitter = new ShotEmitter(store, damage, WEAPONS);
    const player = { dead: false, muzzle: () => ({ x: 0, y: 5, dx: 1, dy: 0 }) };
    equipLoadout(player);
    player.weapon = FLUID.ACID;
    let now = 100;
    const fire = (wants, k = 0, p = player) => {
        now += DT;
        return emitter.fire(k, p, wants, DT, now);
    };
    return { world, system, store, damage, emitter, player, fire, tick: () => world.Step(DT, 8, 3, 3), time: () => now };
}

test("1 s a 60 fps emite el caudal del arma y el tanque baja lo mismo", () => {
    for (const weapon of WEAPONS) {
        const { system, player, fire } = setup();
        player.weapon = weapon.id;
        let emitted = 0;
        for (let i = 0; i < 60; i++) emitted += fire(true);
        assert.ok(Math.abs(emitted - (1 + weapon.rate * 59 / 60)) <= 1, `${weapon.name}: ${emitted} partículas`);
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
    assert.equal(emitter.fire(0, player, true, 0.25, 1.25), Math.ceil(155 * 0.05));
});

test("con el tanque vacío deja de emitir y no pasa a negativo", () => {
    const { system, player, fire } = setup();
    player.tanks.set(FLUID.ACID, 20);
    let emitted = 0;
    for (let i = 0; i < 120; i++) emitted += fire(true);
    assert.equal(emitted, 20);
    assert.equal(system.GetParticleCount(), 20);
    assert.equal(player.tanks.get(FLUID.ACID), 0);
    assert.equal(player.tanks.get(FLUID.LAVA), 180, "el resto del inventario conserva lo suyo");
});

test("las partículas salen con la velocidad, la dispersión y los flags del arma", () => {
    const { system, player, fire } = setup();
    player.weapon = FLUID.LAVA;
    fire(true);
    fire(true);
    fire(true);
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    const lava = weaponById(FLUID.LAVA);
    for (let i = 0; i < system.GetParticleCount(); i++) {
        const speed = Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]);
        assert.ok(Math.abs(speed - lava.speed) < 1e-3);
        assert.ok(Math.abs(Math.atan2(Box2D.HEAPF32[vel + 2 * i + 1], Box2D.HEAPF32[vel + 2 * i])) <= lava.spread + 1e-6);
        assert.ok(Box2D.HEAPF32[pos + 2 * i] >= SHOT_SYSTEM.radius + 0.05 - 1e-6);
    }
    const flags = system.GetParticleFlags(0);
    assert.equal(flags & (1 << 7), 0, "agua pura: sin tensile");
    assert.equal(flags & (1 << 14), 1 << 14, "contact listener");
});

test("las n partículas de un frame se reparten sobre el tramo recorrido, separadas por velocidad / caudal", () => {
    const { system, player, emitter } = setup();
    emitter.fire(0, player, true, DT, 1);
    assert.equal(emitter.fire(0, player, true, 0.25, 2), 8);
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const step = 14 / 155;
    const credit = 0.25 * 155 - 38;
    for (let j = 0; j < 8; j++) {
        const x = Box2D.HEAPF32[pos + 2 * (1 + j)];
        assert.ok(Math.abs(x - (SHOT_SYSTEM.radius + 0.05 + step * (credit + 7 - j))) < 1e-5, `partícula ${j}: x=${x}`);
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
    const { system, store, damage, fire } = setup();
    for (let i = 0; i < 30; i++) fire(true);
    const seen = new Set();
    for (let i = 0; i < system.GetParticleCount(); i++) {
        const slot = store.slotAt(i);
        assert.ok(slot >= 0, "toda partícula tiene slot");
        assert.equal(store.kind[slot], FLUID.ACID);
        seen.add(store.shot[slot]);
    }
    assert.ok(!seen.has(0));
    assert.equal(seen.size, damage.shots.size);
    assert.ok(seen.size >= 4 && seen.size <= 6, `${seen.size} tramos en 0,5 s`);
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
    assert.equal(player.tanks.get(FLUID.ACID), 272 - 40, "no descuenta lo que no pudo emitir");

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
    const made = emitter.fire(0, player, true, 0.25, 2);
    assert.equal(made, 1, "una sale, la segunda devuelve -1 y corta");
    assert.equal(player.tanks.get(FLUID.ACID), 272 - 2);
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
    assert.ok(player.tanks.get(FLUID.ACID) < 272);
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

test("con raycaster, el chorro se recorta al primer obstáculo y no emite lo que caería detrás", () => {
    const { world, system, store, damage, player } = setup();
    const bodyDef = new Box2D.b2BodyDef();
    const wall = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    shape.SetAsBox(0.1, 2, new Box2D.b2Vec2(0.5, 5), 0);
    wall.CreateFixture(shape, 0);
    Box2D.destroy(shape);
    const emitter = new ShotEmitter(store, damage, WEAPONS, getRaycaster(world));
    emitter.fire(0, player, true, DT, 1);
    const made = emitter.fire(0, player, true, 0.25, 2);
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    for (let i = 0; i < system.GetParticleCount(); i++) {
        assert.ok(Box2D.HEAPF32[pos + 2 * i] <= 0.4 - SHOT_SYSTEM.radius + 1e-5, `partícula ${i} en x=${Box2D.HEAPF32[pos + 2 * i]}`);
    }
    assert.ok(made < 8, `emitió ${made}`);
    assert.equal(player.tanks.get(FLUID.ACID), 272 - system.GetParticleCount(), "solo descuenta lo emitido");
});

test("con raycaster y sin obstáculos emite igual que sin él", () => {
    const { world, store, damage, player } = setup();
    const emitter = new ShotEmitter(store, damage, WEAPONS, getRaycaster(world));
    emitter.fire(0, player, true, DT, 1);
    assert.equal(emitter.fire(0, player, true, 0.25, 2), 8);
});

test("el raycaster ignora los cuerpos propios del jugador", () => {
    const { world, store, damage, player } = setup();
    const bodyDef = new Box2D.b2BodyDef();
    const own = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    shape.SetAsBox(0.1, 2, new Box2D.b2Vec2(0.5, 5), 0);
    own.CreateFixture(shape, 0);
    Box2D.destroy(shape);
    player.ownBodies = new Set([Box2D.getPointer(own)]);
    const emitter = new ShotEmitter(store, damage, WEAPONS, getRaycaster(world));
    emitter.fire(0, player, true, DT, 1);
    assert.equal(emitter.fire(0, player, true, 0.25, 2), 8);
});

test("cada arma emite un carril por carril: rate / lanes <= speed / (1,5 r)", () => {
    for (const weapon of WEAPONS) {
        assert.ok(Number.isInteger(weapon.lanes) && weapon.lanes >= 1);
        const cap = weapon.speed / (1.5 * SHOT_SYSTEM.radius);
        const perLane = weapon.rate / weapon.lanes;
        assert.ok(perLane <= cap, `${weapon.name}: ${perLane}/s por carril contra tope ${cap.toFixed(1)}/s`);
        assert.ok(weapon.speed / perLane >= 1.5 * SHOT_SYSTEM.radius - 1e-12);
    }
});

test("el DPS de cada arma no cambia con el caudal nuevo: dps / caudal por caudal", () => {
    const dps = new Map([[FLUID.WATER, 0], [FLUID.ACID, 20], [FLUID.LAVA, 12], [FLUID.HONEY, 0]]);
    for (const weapon of WEAPONS) {
        assert.equal(weapon.dps, dps.get(weapon.id));
        assert.ok(Math.abs(particleDamage(weapon) * weapon.rate - dps.get(weapon.id)) < 1e-9);
    }
    assert.ok(Math.abs(particleDamage(weaponById(FLUID.ACID)) - 20 / 155) < 1e-12, "dps / caudal con el caudal de un carril");
});

test("SHOT_SYSTEM es agua pura con la masa física de la rebanada", () => {
    assert.equal(SHOT_SYSTEM.radius, 0.06);
    assert.equal(SHOT_SYSTEM.density, SIGMA_W);
    assert.equal(SHOT_SYSTEM.maxCount, 12000);
    assert.equal(SHOT_SYSTEM.destroyByAge, false);
    assert.deepEqual(
        [SHOT_SYSTEM.dampingStrength, SHOT_SYSTEM.pressureStrength, SHOT_SYSTEM.viscousStrength],
        [0.5, 0.1, 0.6],
    );
    assert.equal(SHOT_SYSTEM.surfaceTensionPressureStrength, 0);
    assert.equal(SHOT_SYSTEM.surfaceTensionNormalStrength, 0);
    for (const weapon of WEAPONS) assert.equal(weapon.flags & (1 << 7), 0, `${weapon.name} sin TENSILE`);
    assert.equal(weaponById(FLUID.HONEY).flags, 1 << 5);
    assert.equal(MATERIALS.water.SG, 1.0);
});
