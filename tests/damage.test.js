import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");

const { DamageSystem } = await import("../src/combat/damage.js");
const { FLUID, weaponById, particleDamage } = await import("../src/combat/weapons.js");

// Regla de fuego amigo (docs/design/12-decisiones.md): el fluido propio no daña a su dueño
// durante 0,4 s desde el disparo; después sí.
function setup() {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const destroyed = [];
    const store = { system: { GetParticleCount: () => 0 }, destroy: (i) => destroyed.push(i) };
    const damage = new DamageSystem(world, store);
    const hurts = [];
    const sigmas = [];
    const player = { hurt: (bodyId, amount) => hurts.push({ bodyId, amount }), soak: (sigma) => sigmas.push(sigma) };
    const owner = { player, index: 0, bodyId: "torso" };
    const hit = (shotOwner, shotTime, index = 1) => {
        const id = damage.shotId(shotOwner, FLUID.ACID, shotTime);
        damage.fluidHits.push({ owner, index, shot: damage.shots.get(id), kind: FLUID.ACID });
    };
    return { damage, hit, hurts, destroyed, sigmas };
}

test("el ácido que toca al robot lo moja con la conductividad del ácido", () => {
    const { damage, hit, sigmas } = setup();
    hit(1, 10);
    damage.process(10.01);
    assert.deepEqual(sigmas, [32]);
});

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
    const sigmas = [];
    const player = {
        dead: false,
        torso: { GetPosition: () => ({ get_x: () => x }) },
        lowestPoint: () => lowest,
        soak: (sigma) => {
            soaks++;
            sigmas.push(sigma);
        },
    };
    damage.players = [player];
    return { damage, soaks: () => soaks, player, sigmas };
}

test("el robot en el campo se moja con la conductividad de su columna", () => {
    const { damage, soaks, sigmas } = wetSetup({ lowest: 4, x: 7.5 });
    damage.process(10, 5, (x) => (x === 7.5 ? 12.5 : 0));
    assert.equal(soaks(), 1);
    assert.deepEqual(sigmas, [12.5]);
});

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
    assert.ok(Math.abs(hurts[0].amount - 20 / 155) < 1e-12);
});

test("el chorro entero de ácido sobre el rival saca el DPS de la tabla", () => {
    const { damage, hit, hurts } = setup();
    for (let i = 0; i < 155; i++) {
        const t = 10 + i / 155;
        hit(1, t, i);
        damage.process(t);
    }
    const total = hurts.reduce((sum, h) => sum + h.amount, 0);
    assert.ok(Math.abs(total - 20) < 1e-9, `${total} en 1 s`);
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

test("resetShots olvida los disparos y los tramos abiertos pero no reutiliza ids", () => {
    const { damage } = setup();
    const a = damage.shotId(0, FLUID.ACID, 10);
    damage.resetShots();
    assert.equal(damage.shots.size, 0);
    const b = damage.shotId(0, FLUID.ACID, 10.01);
    assert.ok(b > a, "el tramo abierto se olvidó: se abre uno nuevo");
    assert.equal(damage.liveShotFloor, b);
});

test("el daño por partícula sale de la tabla de armas dada, calculado una vez", () => {
    const g = new Box2D.b2Vec2(0, 0);
    const world = new Box2D.b2World(g);
    Box2D.destroy(g);
    const damage = new DamageSystem(world, { system: { GetParticleCount: () => 0 }, destroy() {} }, [{ id: FLUID.ACID, rate: 50, dps: 10 }]);
    assert.equal(damage.particleDamage.get(FLUID.ACID), 0.2);
    const hurts = [];
    const owner = { player: { hurt: (b, amount) => hurts.push(amount), soak: () => {} }, index: 0, bodyId: "torso" };
    damage.fluidHits.push({ owner, index: 1, shot: { owner: 1, weapon: FLUID.ACID, time: 0 }, kind: FLUID.ACID });
    damage.process(1);
    assert.deepEqual(hurts, [0.2]);
});

// Agua: no daña, aplica soak() y no se consume (el charco sigue mojando)
function waterSetup() {
    const { damage, destroyed } = setup();
    const soaks = [];
    const player = { soak: () => soaks.push(1), hurt: () => assert.fail("el agua no daña") };
    const owner = { player, index: 0, bodyId: "torso" };
    const hit = (shotOwner, shotTime) => {
        const id = damage.shotId(shotOwner, FLUID.WATER, shotTime);
        damage.fluidHits.push({ owner, index: 1, shot: damage.shots.get(id), kind: FLUID.WATER });
    };
    return { damage, hit, soaks, destroyed };
}

test("el agua del rival moja con soak() y la partícula no se consume", () => {
    const { damage, hit, soaks, destroyed } = waterSetup();
    hit(1, 10);
    damage.process(10.01);
    assert.equal(soaks.length, 1);
    assert.equal(destroyed.length, 0);
});

test("el agua propia no moja antes de 0,4 s y sí después", () => {
    const { damage, hit, soaks } = waterSetup();
    hit(0, 10);
    damage.process(10.3);
    assert.equal(soaks.length, 0);
    hit(0, 10);
    damage.process(10.5);
    assert.equal(soaks.length, 1);
});

test("el agua sin disparo asociado se reconoce por el color", () => {
    const { damage, soaks } = waterSetup();
    const owner = { player: { soak: () => soaks.push(1) }, index: 0, bodyId: "torso" };
    damage.fluidHits.push({ owner, index: 2, shot: undefined, kind: FLUID.WATER });
    damage.process(10);
    assert.equal(soaks.length, 1);
});

test("el daño por partícula del agua es 0", () => {
    assert.equal(particleDamage(weaponById(FLUID.WATER)), 0);
});
