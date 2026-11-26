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
const { createParticleSystem } = await import("../../src/fluids/particles.js");
const { SHOT_SYSTEM } = await import("../../src/combat/weapons.js");
const { ParticleStore } = await import("../../src/fluids/particleStore.js");
const { WallContact } = await import("../../src/fluids/wallContact.js");

/**
 * Bancos de #100 (docs/design/14-agua.md §14.16, grupo C): LiquidFun real, `SHOT_SYSTEM`, `WallContact` en
 * `stepWorld` (8 subpasos). Cada banco devuelve las magnitudes medidas; los criterios los comprueba el test.
 */
export const G = 10;
export const DT = 1 / 60;
export const SUBSTEP = DT / 8;
export const RADIUS = SHOT_SYSTEM.radius;
export const DIAMETER = 2 * RADIUS;
export const WIDTH_DROP = 1.5 * RADIUS;
export const M_P = SHOT_SYSTEM.density * WIDTH_DROP ** 2;
const BOX_HALF_HEIGHT = 0.25;

function newScene({ escape = true } = {}) {
    const gravity = new Box2D.b2Vec2(0, -G);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const bodyDef = new Box2D.b2BodyDef();
    const ground = world.CreateBody(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(0, -0.5);
    shape.SetAsBox(20, 0.5, center, 0);
    ground.CreateFixture(shape, 0);
    Box2D.destroy(center);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = new WallContact(system, store, SHOT_SYSTEM);
    if (!escape) wall.escape = () => {};
    return { world, bodyDef, shape, ground, system, store, wall };
}

function dropsAt(store, drops, rows, base = 0) {
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    for (let j = 0; j < rows; j++) {
        for (let k = 0; k < drops; k++) {
            at.set_x(-((drops - 1) * WIDTH_DROP) / 2 + k * WIDTH_DROP);
            at.set_y(base + RADIUS + j * WIDTH_DROP);
            def.set_position(at);
            store.create(def, {});
        }
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
}

function settle(world, wall, store, steps = 60) {
    for (let s = 0; s < steps; s++) {
        stepWorld(world, [wall]);
        store.afterStep();
    }
}

function addBox({ world, bodyDef, shape }, { width, mass, bottom, fixedRotation = true }) {
    bodyDef.set_type(Box2D.b2_dynamicBody);
    const at = new Box2D.b2Vec2(0, bottom + BOX_HALF_HEIGHT);
    bodyDef.set_position(at);
    Box2D.destroy(at);
    const box = world.CreateBody(bodyDef);
    box.SetFixedRotation(fixedRotation);
    const center = new Box2D.b2Vec2(0, 0);
    shape.SetAsBox(width / 2, BOX_HALF_HEIGHT, center, 0);
    Box2D.destroy(center);
    box.CreateFixture(shape, mass / (width * 2 * BOX_HALF_HEIGHT));
    return box;
}

/**
 * Tiempo de referencia de la película de apriete (C3): desde el primer contacto (borde inferior a `yc` con velocidad
 * hacia abajo `vc`) hasta que el borde queda a 0,05 m del piso, integrando
 * `½ (M + m_a(h)) ḣ² = ½ (M + m_a(h₁)) v₁² + M g (h₁ − h)` con `m_a = σ_w W_c³/(12 h)` y `W_c = min(W, N A_p / h)`.
 */
export function squeezeReference(mass, width, count, yc, vc) {
    const sigma = SHOT_SYSTEM.density;
    const dt = 1e-5;
    const added = (h) => (sigma * Math.min(width, (count * WIDTH_DROP ** 2) / h) ** 3) / (12 * h);
    const energy = mass * G * yc + 0.5 * (mass + added(yc)) * vc * vc;
    let h = yc;
    let t = 0;
    while (h > 0.05 && t < 20) {
        const speed = Math.sqrt(Math.max(1e-12, (2 * (energy - mass * G * h)) / (mass + added(h))));
        h -= speed * dt;
        t += dt;
    }
    return t;
}

/** Tiempo de caída libre desde `yc` con velocidad hacia abajo `vc` hasta 0,05 m del piso. */
export function freeFall(yc, vc) {
    return (-vc + Math.sqrt(vc * vc + 2 * G * (yc - 0.05))) / G;
}

function impulseTally(box) {
    const key = Box2D.getPointer(box);
    const original = Box2D.b2Body.prototype.ApplyLinearImpulse;
    const tally = { y: 0 };
    Box2D.b2Body.prototype.ApplyLinearImpulse = function (impulse, point, wake) {
        if (Box2D.getPointer(this) === key) tally.y += impulse.get_y();
        return original.call(this, impulse, point, wake);
    };
    tally.restore = () => {
        Box2D.b2Body.prototype.ApplyLinearImpulse = original;
    };
    return tally;
}

function motorImpulseY(wall, bodyPtr, substep) {
    const contacts = wall.bodyContacts();
    if (!contacts) return 0;
    let sum = 0;
    for (let c = 0; c < contacts.count; c++) {
        const w = contacts.words + c * 7;
        if (Box2D.HEAP32[w + 1] !== bodyPtr) continue;
        const weight = Box2D.HEAPF32[w + 3];
        const k = (Box2D.HEAPF32[w + 6] * SHOT_SYSTEM.pressureStrength * DIAMETER) / (substep * substep);
        sum += k * weight * weight * substep * Box2D.HEAPF32[w + 5];
    }
    return sum;
}

/**
 * C3, C9, C11 y C12: una caja (`width` de ancho, `mass` kg, rotación fija) cae desde `h0` sobre `drops` gotas por
 * `rows` filas, asentadas 1 s en el piso. Devuelve los tiempos contra la referencia, la energía devuelta, los
 * `stats` del escape y la fuerza media del agua sobre la caja en régimen (los últimos 1,5 s de 4 s): suma de `K w²`
 * del registro de contactos del subpaso anterior más los impulsos que `WallContact` aplicó a la caja.
 */
export function dropBox({ drops, rows = 1, width, mass }) {
    const scene = newScene();
    const { world, system, store, wall } = scene;
    dropsAt(store, drops, rows);
    settle(world, wall, store);
    const h0 = 0.24 * rows + 0.35;
    const box = addBox(scene, { width, mass, bottom: h0 });
    const boxPtr = Box2D.getPointer(box);
    const total = box.GetMass();
    const tally = impulseTally(box);
    wall.resetStats();
    const window = { motor: 0 };
    let firstContact = null;
    let landing = null;
    let previousVy = 0;
    const steps = 240;
    const vel = () => Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    let windowStart = null;
    const probe = {
        update() {
            if (windowStart !== null) window.motor += motorImpulseY(wall, boxPtr, SUBSTEP);
        },
    };
    for (let step = 1; step <= steps; step++) {
        if (step === 150) {
            windowStart = tally.y;
            window.motor = 0;
        }
        stepWorld(world, [probe, wall]);
        store.afterStep();
        const bottom = box.GetPosition().get_y() - BOX_HALF_HEIGHT;
        const vy = box.GetLinearVelocity().get_y();
        if (firstContact === null && Math.abs(vy + G * step * DT) > 0.05) {
            const t = (step - 1) * DT;
            firstContact = { step: step - 1, t, y: h0 - 0.5 * G * t * t, v: G * t };
        }
        if (landing === null && bottom <= 0.05) {
            let dropKe = 0;
            for (let i = 0; i < system.GetParticleCount(); i++) {
                const u = Math.hypot(Box2D.HEAPF32[vel() + 2 * i], Box2D.HEAPF32[vel() + 2 * i + 1]);
                dropKe += 0.5 * M_P * u * u;
            }
            landing = { step, t: step * DT, bodyKe: 0.5 * total * previousVy * previousVy, dropKe: dropKe };
        }
        previousVy = vy;
    }
    const windowTime = (steps - 149) * DT;
    const applied = tally.y - windowStart;
    const result = {
        count: drops * rows,
        mass: total,
        width,
        h0,
        firstContact,
        landing,
        arrival: firstContact && landing ? landing.t - firstContact.t : null,
        reference: firstContact ? squeezeReference(total, width, drops * rows, firstContact.y, firstContact.v) : null,
        freeFall: firstContact ? freeFall(firstContact.y, firstContact.v) : null,
        energyRatio: landing ? (landing.bodyKe + landing.dropKe) / (total * G * h0) : null,
        waterForce: (window.motor + applied) / windowTime,
        stats: { ...wall.stats },
    };
    tally.restore();
    wall.dispose();
    return result;
}

/**
 * C10: caja (rotación fija) apoyada sobre una gota con el escape apagado, o gota sola sobre el piso (`mass` = 0).
 * Devuelve el promedio de `K w²` sobre la gota para los contactos con la caja (o con el piso) entre 3 y 4 s, con el
 * `w` y el `m_c` del registro, y el peso que debería sostener.
 */
export function penalization({ mass }) {
    const scene = newScene({ escape: false });
    const { world, system, store, wall } = scene;
    dropsAt(store, 1, 1);
    settle(world, wall, store);
    const box = mass > 0 ? addBox(scene, { width: 0.3, mass, bottom: 0.6 }) : null;
    const bodyPtr = box ? Box2D.getPointer(box) : Box2D.getPointer(scene.ground);
    let force = 0;
    let samples = 0;
    let weight = 0;
    let reduced = 0;
    for (let step = 0; step < 240; step++) {
        stepWorld(world, [wall]);
        store.afterStep();
        if (step < 180) continue;
        const contacts = wall.bodyContacts();
        if (!contacts) continue;
        for (let c = 0; c < contacts.count; c++) {
            const w = contacts.words + c * 7;
            if (Box2D.HEAP32[w + 1] !== bodyPtr) continue;
            weight = Box2D.HEAPF32[w + 3];
            reduced = Box2D.HEAPF32[w + 6];
            const k = (reduced * SHOT_SYSTEM.pressureStrength * DIAMETER) / (SUBSTEP * SUBSTEP);
            force += k * weight * weight;
        }
        samples++;
    }
    const result = {
        force: force / samples,
        expected: box ? box.GetMass() * G : M_P * G,
        weight,
        reduced,
        boxMass: box ? box.GetMass() : null,
        system,
    };
    wall.dispose();
    return result;
}

/**
 * C1: charco quieto de `drops` gotas por `rows` filas sobre una placa dinámica de 1 kg en una junta prismática
 * vertical con el motor a velocidad 0. El peso del agua es el impulso del motor entre 2 y 3 s, dividido por el
 * tiempo, menos el peso de la placa.
 */
export function restingPlate({ drops, rows = 1 }) {
    const scene = newScene();
    const { world, bodyDef, shape, ground, store, wall } = scene;
    bodyDef.set_type(Box2D.b2_dynamicBody);
    const at = new Box2D.b2Vec2(0, 3);
    bodyDef.set_position(at);
    const plate = world.CreateBody(bodyDef);
    plate.SetFixedRotation(true);
    const center = new Box2D.b2Vec2(0, -0.1);
    shape.SetAsBox(1.5, 0.1, center, 0);
    plate.CreateFixture(shape, 1 / 0.6);
    for (const x of [-0.65, 0.65]) {
        center.set_x(x);
        center.set_y(0.2);
        shape.SetAsBox(0.05, 0.4, center, 0);
        plate.CreateFixture(shape, 1 / 0.6);
    }
    Box2D.destroy(center);
    const axis = new Box2D.b2Vec2(0, 1);
    const jointDef = new Box2D.b2PrismaticJointDef();
    jointDef.Initialize(ground, plate, at, axis);
    jointDef.set_enableMotor(true);
    jointDef.set_motorSpeed(0);
    jointDef.set_maxMotorForce(1e5);
    const joint = Box2D.castObject(world.CreateJoint(jointDef), Box2D.b2PrismaticJoint);
    Box2D.destroy(jointDef);
    Box2D.destroy(axis);
    Box2D.destroy(at);
    dropsAt(store, drops, rows, 3);
    const invDt = 8 / DT;
    const window = { on: false, impulse: 0, substeps: 0 };
    const motor = {
        update() {
            if (!window.on) return;
            window.impulse += Math.abs(joint.GetMotorForce(invDt)) / invDt;
            window.substeps++;
        },
    };
    for (let step = 1; step <= 180; step++) {
        window.on = step > 120;
        stepWorld(world, [wall, motor]);
        store.afterStep();
    }
    const result = {
        water: window.impulse / (window.substeps / invDt) - plate.GetMass() * G,
        expected: drops * rows * M_P * G,
    };
    wall.dispose();
    return result;
}
