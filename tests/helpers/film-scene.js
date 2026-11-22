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
const { SHOT_SYSTEM, FLUID, weaponById } = await import("../../js/weapons.js");
const { PARTICLE } = await import("../../js/particles.js");
const { ParticleStore, ORIGIN } = await import("../../js/particleStore.js");
const { WallContact } = await import("../../js/wallContact.js");
const { Adhesion } = await import("../../js/adhesion.js");
const { ShallowWater } = await import("../../js/water.js");
const { Thermal } = await import("../../js/thermal.js");
const { Viscosity } = await import("../../js/viscosity.js");
const { SIGMA_W } = await import("../../js/materials.js");

/**
 * Escenas de la adherencia (docs/design/14-agua.md §14.10, #77) con LiquidFun real y el contorno inelástico, sin robots:
 * cuerpos de prueba y, en el orden del juego, `WallContact` y `Adhesion` por subpaso dentro de `stepWorld` y la térmica y
 * la viscosidad después (los hilos de miel).
 */
export const DT = 1 / 60;
export const RADIUS = SHOT_SYSTEM.radius;
export const SPACING = 1.5 * RADIUS;
export const THICKNESS = SIGMA_W / 1000;

/** Mundo con la gravedad `g` (m/s², hacia abajo), el sistema de disparos, su `ParticleStore`, `WallContact`, `Adhesion`, `Thermal` y `Viscosity`. */
export function newScene({ gravity = 10 } = {}) {
    const g = new Box2D.b2Vec2(0, -gravity);
    const world = new Box2D.b2World(g);
    Box2D.destroy(g);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = new WallContact(system, store, SHOT_SYSTEM);
    const adhesion = new Adhesion(system, store, wall);
    const thermal = new Thermal(system, store, new ShallowWater(), null, { airLosses: false });
    const viscosity = new Viscosity(system, store, thermal);
    const scene = {
        world,
        system,
        store,
        wall,
        adhesion,
        thermal,
        viscosity,
        bodies: new Map(),
        onStep: null,
        /** Un paso fijo: mundo (con `WallContact` y `Adhesion` por subpaso), `afterStep`, térmica y viscosidad. */
        step() {
            stepWorld(world, [wall, adhesion]);
            store.afterStep();
            thermal.step(DT);
            viscosity.step(DT);
            scene.onStep?.();
        },
        dispose() {
            adhesion.dispose();
            viscosity.dispose();
            thermal.dispose();
            wall.dispose();
            Box2D.destroy(world);
        },
    };
    return scene;
}

/** Cuerpo `type` (0 estático, 1 cinemático, 2 dinámico) con una caja `w` × `h` centrada en `(x, y)` y densidad `density`. */
export function addBox(scene, id, { x, y, w, h, type = 0, density = SIGMA_W, gravityScale = 1, friction = 0.3 }) {
    const def = new Box2D.b2BodyDef();
    def.set_type(type);
    const pos = new Box2D.b2Vec2(x, y);
    def.set_position(pos);
    def.set_gravityScale(gravityScale);
    const body = scene.world.CreateBody(def);
    const shape = new Box2D.b2PolygonShape();
    shape.SetAsBox(w / 2, h / 2);
    const fixture = body.CreateFixture(shape, type === 2 ? density : 0);
    fixture.SetFriction(friction);
    Box2D.destroy(shape);
    Box2D.destroy(pos);
    Box2D.destroy(def);
    scene.bodies.set(id, body);
    return body;
}

export function setVelocity(body, vx, vy) {
    const v = new Box2D.b2Vec2(vx, vy);
    body.SetLinearVelocity(v);
    Box2D.destroy(v);
}

/**
 * Crea partículas de `kind` en una grilla de paso `SPACING` sobre `[x0, x1] × [y0, y1]` (sus centros). Devuelve cuántas.
 * Sin flags de partícula, como las armas.
 */
export function fill(scene, kind, x0, x1, y0, y1, { vx = 0, vy = 0, shot = 0, origin = ORIGIN.MAP } = {}) {
    const def = new Box2D.b2ParticleDef();
    const [r, g, b] = weaponById(kind).color;
    const color = new Box2D.b2ParticleColor(r, g, b, 255);
    const position = new Box2D.b2Vec2(0, 0);
    const velocity = new Box2D.b2Vec2(vx, vy);
    def.set_flags(PARTICLE.WATER);
    def.set_color(color);
    def.set_velocity(velocity);
    let made = 0;
    for (let y = y0; y <= y1 + 1e-9; y += SPACING) {
        for (let x = x0; x <= x1 + 1e-9; x += SPACING) {
            position.set_x(x);
            position.set_y(y);
            def.set_position(position);
            if (scene.store.create(def, { kind, origin, shot }) >= 0) made++;
        }
    }
    Box2D.destroy(def);
    Box2D.destroy(color);
    Box2D.destroy(position);
    Box2D.destroy(velocity);
    return made;
}

/**
 * Recorre las partículas vivas: `fn(index, slot, x, y, vx, vy)`.
 */
export function eachParticle(scene, fn) {
    const { system, store } = scene;
    const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
    const n = system.GetParticleCount();
    for (let i = 0; i < n; i++) {
        const slot = store.slotAt(i);
        if (slot < 0 || store.alive[slot] === 0) continue;
        fn(i, slot, Box2D.HEAPF32[pos + 2 * i], Box2D.HEAPF32[pos + 2 * i + 1], Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]);
    }
}

/** Distancia (m) del centro de una partícula en reposo a la superficie de un cuerpo: `1,65 r` (medida, docs/design/14-agua.md §14.11). */
export const REST_DISTANCE = 1.65 * RADIUS;

/** Aceleración de la gravedad de las escenas (m/s²). */
export const G = 10;
