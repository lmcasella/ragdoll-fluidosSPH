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
const { MATERIALS, SIGMA_W } = await import("../../js/materials.js");

/**
 * Escenas de la adherencia (docs/design/14-agua.md §14.10, #77) con LiquidFun real y el contorno inelástico, sin robots:
 * cuerpos de prueba registrados en `Adhesion` como las piezas de un robot. `Adhesion.step` corre después de
 * `stepWorld`, como en el paso fijo de `index.html`.
 */
export const DT = 1 / 60;
export const RADIUS = SHOT_SYSTEM.radius;
export const SPACING = 1.5 * RADIUS;
export const THICKNESS = SIGMA_W / 1000;

/** Mundo con la gravedad `g` (m/s², hacia abajo), el sistema de disparos, su `ParticleStore` y `WallContact`. */
export function newScene({ gravity = 10, filmFactor } = {}) {
    const g = new Box2D.b2Vec2(0, -gravity);
    const world = new Box2D.b2World(g);
    Box2D.destroy(g);
    const system = createParticleSystem(world, SHOT_SYSTEM);
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = new WallContact(system, store, SHOT_SYSTEM);
    const adhesion = new Adhesion(system, store, filmFactor === undefined ? {} : { filmFactor });
    const scene = {
        world,
        system,
        store,
        wall,
        adhesion,
        bodies: new Map(),
        onStep: null,
        /** Un paso fijo: mundo, `afterStep` y adherencia. */
        step() {
            stepWorld(world, [wall]);
            store.afterStep();
            adhesion.step(DT);
            scene.onStep?.();
        },
        register() {
            adhesion.register([{ rag: { bodies: scene.bodies } }]);
        },
        dispose() {
            adhesion.dispose();
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
 * Miel con `VISCOUS` y el resto sin flags, como las armas.
 */
export function fill(scene, kind, x0, x1, y0, y1, { vx = 0, vy = 0, shot = 0, origin = ORIGIN.MAP } = {}) {
    const def = new Box2D.b2ParticleDef();
    const [r, g, b] = weaponById(kind).color;
    const color = new Box2D.b2ParticleColor(r, g, b, 255);
    const position = new Box2D.b2Vec2(0, 0);
    const velocity = new Box2D.b2Vec2(vx, vy);
    def.set_flags(kind === FLUID.HONEY ? PARTICLE.VISCOUS : PARTICLE.WATER);
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

/**
 * Corte de Couette (A2a): dos placas cinemáticas de `length` m, una sobre otra, con una capa de `layers` capas de `kind`
 * entre las dos y encerrada por dos paredes. La placa de arriba se mueve a `+speed / 2` y la de abajo a `−speed / 2`, así
 * que la velocidad relativa es `speed` y la capa queda en reposo por simetría (sin efectos de borde de una placa que arrastra
 * toda la capa). El hueco `δ` es el que deja una capa asentada entre las dos: sus partículas quedan a `REST_DISTANCE` de las
 * placas. Devuelve la fuerza media sobre la placa de arriba en el tramo `[settle, settle + window]` s tras arrancar (N de la
 * rebanada, de la cantidad de movimiento que `Adhesion` le entrega por paso), la de referencia `τ A = μ V length b / δ`
 * y `δ` (m).
 */
export function couette({ filmFactor, layers = 1, speed = 0.5, length = 2, kind = FLUID.HONEY, settle = 1, window = 1 } = {}) {
    const scene = newScene({ filmFactor: 0 });
    const walls = length / 2 + 0.25;
    const bottomY = -0.1;
    const bottom = addBox(scene, "bottom", { x: 0, y: bottomY, w: length, h: 0.2, type: 1 });
    for (const sign of [-1, 1]) addBox(scene, `wall${sign}`, { x: sign * walls, y: 1, w: 0.5, h: 2.5 });
    scene.register();
    fill(scene, kind, -length / 2 + RADIUS, length / 2 - RADIUS, REST_DISTANCE, REST_DISTANCE + (layers - 1) * SPACING);
    for (let s = 0; s < Math.round(3 / DT); s++) scene.step();
    let top = -Infinity;
    eachParticle(scene, (i, slot, x, y) => {
        if (Math.abs(x) < length / 4 && y > top) top = y;
    });
    const gap = top + REST_DISTANCE;
    const upper = addBox(scene, "top", { x: 0, y: gap + 0.1, w: length, h: 0.2, type: 1 });
    scene.register();
    scene.adhesion.filmFactor = filmFactor ?? MATERIALS.honey.filmFactor;
    const piece = scene.adhesion.pieces.find((p) => p.body === upper);
    setVelocity(upper, speed / 2, 0);
    setVelocity(bottom, -speed / 2, 0);
    let sum = 0;
    let n = 0;
    const total = Math.round((settle + window) / DT);
    for (let s = 0; s < total; s++) {
        scene.step();
        if (s >= Math.round(settle / DT)) {
            sum += piece.impulseX;
            n++;
        }
    }
    const mu = kind === FLUID.HONEY ? MATERIALS.honey.mu : MATERIALS.water.mu;
    const result = { force: -sum / n / DT, reference: (mu * speed * length * THICKNESS) / gap, gap };
    scene.dispose();
    return result;
}

/**
 * Película que escurre por una pared vertical (A2, A3): una pared estática registrada en `Adhesion` y una tira de `layers`
 * capas de `kind` pegada a ella, que cae desde el reposo con la gravedad `G`. La pared es lo bastante alta como para llegar
 * a la velocidad terminal. Devuelve la velocidad vertical media (m/s, hacia abajo) de las partículas de la tira en el tramo
 * `[from, to]` s, el espesor de la película `δ = N A_p / alto` (m, por masa), la referencia de Nusselt
 * `ρ g δ² / (3 μ)` (m/s) con la `ρ` y la `μ` del material, y la suma de los módulos de los impulsos de adherencia (kg·m/s).
 */
export function wallFilm({ filmFactor, layers = 1, kind = FLUID.HONEY, from = 6, to = 7, height = 1.5, top = 190 } = {}) {
    const scene = newScene({ filmFactor, gravity: G });
    addBox(scene, "wall", { x: -0.5, y: top / 2, w: 1, h: top });
    scene.register();
    const made = fill(scene, kind, REST_DISTANCE, REST_DISTANCE + (layers - 1) * SPACING, top - height, top);
    let sum = 0;
    let n = 0;
    let impulse = 0;
    const steps = Math.round(to / DT);
    for (let s = 0; s < steps; s++) {
        scene.step();
        impulse += scene.adhesion.stats.magnitude;
        if (s >= Math.round(from / DT)) {
            eachParticle(scene, (i, slot, x, y, vx, vy) => {
                sum += -vy;
                n++;
            });
        }
    }
    const material = kind === FLUID.HONEY ? MATERIALS.honey : MATERIALS.water;
    const delta = (made * SPACING * SPACING) / (height + SPACING);
    const reference = (material.SG * 1000 * G * delta * delta) / (3 * material.mu);
    const result = { velocity: sum / n, delta, reference, impulse, particles: made };
    scene.dispose();
    return result;
}