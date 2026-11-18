import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");

const { DamageSystem, FLUID } = await import("../js/damage.js");
const { weaponById, particleDamage } = await import("../js/weapons.js");

// Regla de fuego amigo (docs/design/12-decisiones.md): el fluido propio no daña a su dueño
// durante 0,4 s desde el disparo; después sí.
function setup() {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const destroyed = [];
    const particleSystem = { DestroyParticle: (i) => destroyed.push(i) };
    const damage = new DamageSystem(world, particleSystem);
    const hurts = [];
    const player = { hurt: (bodyId, amount) => hurts.push({ bodyId, amount }) };
    const owner = { player, index: 0, bodyId: "torso" };
    const hit = (shotOwner, shotTime, index = 1) => {
        const id = damage.shotId(shotOwner, FLUID.ACID, shotTime);
        damage.fluidHits.push({ owner, index, shot: damage.shots.get(id), kind: FLUID.ACID });
    };
    return { damage, hit, hurts, destroyed };
}

test("el ácido propio no daña al dueño dentro de los 0,4 s del disparo", () => {
    const { damage, hit, hurts, destroyed } = setup();
    hit(0, 10);
    damage.process(10.3);
    assert.equal(hurts.length, 0);
    assert.equal(destroyed.length, 0);
});

test("el ácido propio daña al dueño pasados los 0,4 s (charco propio)", () => {
    const { damage, hit, hurts, destroyed } = setup();
    hit(0, 10);
    damage.process(10.5);
    assert.equal(hurts.length, 1);
    assert.deepEqual(destroyed, [1]);
});

test("el ácido del rival daña sin período de gracia", () => {
    const { damage, hit, hurts } = setup();
    hit(1, 10);
    damage.process(10.01);
    assert.equal(hurts.length, 1);
});

// Mojado por nivel de inundación: process(now, waterLevel) moja a quien tenga el borde inferior de alguna pieza
// por debajo del agua (número fijo o función de la x del robot)
function wetSetup({ lowest, x = 10 }) {
    const { damage } = setup();
    let soaks = 0;
    const player = {
        dead: false,
        torso: { GetPosition: () => ({ get_x: () => x }) },
        lowestPoint: () => lowest,
        soak: (...args) => {
            soaks++;
            assert.equal(args.length, 0);
        },
    };
    damage.players = [player];
    return { damage, soaks: () => soaks, player };
}

test("el borde inferior de una pieza bajo el nivel moja al robot", () => {
    const { damage, soaks } = wetSetup({ lowest: 4.9 });
    damage.process(10, 5);
    assert.equal(soaks(), 1);
});

test("con el borde inferior apenas sobre el nivel no se moja", () => {
    const { damage, soaks } = wetSetup({ lowest: 5.05 });
    damage.process(10, 5);
    assert.equal(soaks(), 0);
});

test("sin nivel de agua (por defecto o -Infinity) no se moja a nadie", () => {
    const { damage, soaks } = wetSetup({ lowest: -3 });
    damage.process(10);
    damage.process(10, -Infinity);
    assert.equal(soaks(), 0);
});

test("un robot muerto no se moja", () => {
    const { damage, soaks, player } = wetSetup({ lowest: 1 });
    player.dead = true;
    damage.process(10, 5);
    assert.equal(soaks(), 0);
});

test("el nivel como función recibe la x del robot (agua local)", () => {
    const { damage, soaks } = wetSetup({ lowest: 4, x: 7.5 });
    const asked = [];
    damage.process(10, (x) => {
        asked.push(x);
        return -Infinity; // todavía no llegó el agua a esa columna
    });
    assert.deepEqual(asked, [7.5]);
    assert.equal(soaks(), 0);
    damage.process(10, (x) => (x === 7.5 ? 6 : -Infinity));
    assert.equal(soaks(), 1);
});

test("el ácido daña particleDamage(ácido) por partícula y la consume", () => {
    const { damage, hit, hurts, destroyed } = setup();
    hit(1, 10, 7);
    damage.process(10.01);
    assert.deepEqual(destroyed, [7]);
    assert.equal(hurts.length, 1);
    assert.equal(hurts[0].amount, particleDamage(weaponById(FLUID.ACID)));
    assert.ok(Math.abs(hurts[0].amount - 20 / 90) < 1e-12);
});

test("el chorro entero de ácido sobre el rival saca el DPS de la tabla", () => {
    const { damage, hit, hurts } = setup();
    for (let i = 0; i < 90; i++) {
        const t = 10 + i / 90;
        hit(1, t, i);
        damage.process(t);
    }
    const total = hurts.reduce((sum, h) => sum + h.amount, 0);
    assert.ok(Math.abs(total - 20) < 1e-9, `${total} en 1 s`);
});

test("FLUID se reexporta desde weapons.js", async () => {
    const weapons = await import("../js/weapons.js");
    assert.equal(FLUID, weapons.FLUID);
});

test("shotId: reutiliza el tramo del mismo jugador y arma dentro de 0,1 s y actualiza time", () => {
    const { damage } = setup();
    const a = damage.shotId(0, FLUID.ACID, 10);
    assert.equal(damage.shotId(0, FLUID.ACID, 10.05), a);
    assert.equal(damage.shots.get(a).time, 10.05);
    assert.notEqual(damage.shotId(0, FLUID.ACID, 10.11), a, "pasados 0,1 s desde la apertura se abre otro");
    assert.notEqual(damage.shotId(0, FLUID.LAVA, 10.1), damage.shotId(0, FLUID.ACID, 10.1));
    const other = damage.shotId(1, FLUID.ACID, 10.1);
    assert.equal(damage.shots.get(other).owner, 1);
});

test("shotId: la gracia de un chorro largo no envejece con la ráfaga", () => {
    const { damage, hurts, destroyed } = setup();
    // el dueño dispara 2 s seguidos; la partícula recién salida sigue en gracia aunque la ráfaga sea vieja
    for (let t = 10; t < 12; t += 1 / 60) damage.shotId(0, FLUID.ACID, t);
    const id = damage.shotId(0, FLUID.ACID, 12);
    damage.fluidHits.push({
        owner: { player: { hurt: (b, amount) => hurts.push(amount) }, index: 0, bodyId: "torso" },
        index: 3,
        shot: damage.shots.get(id),
        kind: FLUID.ACID,
    });
    damage.process(12.2);
    assert.equal(hurts.length, 0);
    assert.equal(destroyed.length, 0);
});

test("el Map de disparos no pasa de 122 entradas en 10 s con 2 jugadores disparando sin parar", () => {
    const { damage } = setup();
    let peak = 0;
    for (let i = 0; i < 600; i++) {
        const t = 10 + i / 60;
        damage.shotId(0, FLUID.ACID, t);
        damage.shotId(1, FLUID.LAVA, t);
        damage.process(t);
        peak = Math.max(peak, damage.shots.size);
    }
    assert.ok(peak <= 122, `pico ${peak}`);
    assert.ok(peak >= 100, `pico ${peak}: los ids viven 6 s`);
});

test("liveShotFloor: el id más chico vivo; nextShot si no queda ninguno", () => {
    const { damage } = setup();
    assert.equal(damage.liveShotFloor, damage.nextShot);
    const a = damage.shotId(0, FLUID.ACID, 10);
    const b = damage.shotId(0, FLUID.ACID, 10.2);
    assert.equal(damage.liveShotFloor, a);
    damage.process(16.1); // a venció (último tiro a las 10,0), b todavía no
    assert.equal(damage.liveShotFloor, b);
    damage.process(17);
    assert.equal(damage.liveShotFloor, damage.nextShot);
    assert.ok(damage.nextShot > b);
});

test("tagParticle escribe el id en el userData de la partícula", () => {
    const g = new Box2D.b2Vec2(0, 0);
    const world = new Box2D.b2World(g);
    Box2D.destroy(g);
    const psDef = new Box2D.b2ParticleSystemDef();
    const system = world.CreateParticleSystem(psDef);
    Box2D.destroy(psDef);
    const damage = new DamageSystem(world, system);
    const def = new Box2D.b2ParticleDef();
    const index = system.CreateParticle(def);
    Box2D.destroy(def);
    damage.tagParticle(index, 42);
    assert.equal(Box2D.HEAP32[(system.GetUserDataBuffer() >> 2) + index], 42);
});