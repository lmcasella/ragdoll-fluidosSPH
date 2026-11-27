// Hueco visible entre las gotas de disparo y los cuerpos (#45, docs/design/07-sph.md §7.4): LiquidFun real, con el paso fijo del juego
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";

const { stepWorld } = await import("../lib/ragimporter.js");
const { createParticleSystem } = await import("../src/fluids/particles.js");
const { SHOT_SYSTEM } = await import("../src/combat/weapons.js");
const { collectSurfaces, skinPosition } = await import("../src/render/fluidSurfaces.js");
const { PARTICLE_RADIUS, SHOT_DRAW } = await import("../src/render/fluidDraw.js");

const SECONDS = 8;
// Tolerancia del borde dibujado respecto de la superficie (m); el agua se mete SKIN_OVERLAP = 0,02 m bajo el cuerpo
const TOUCH = 0.01;

const FLOOR = { x: 0, y: -0.5, w: 10, h: 1 };
const WALLS = [{ x: -3.5, y: 2, w: 1, h: 6 }, { x: 3.5, y: 2, w: 1, h: 6 }];
const SOLIDS = [FLOOR, ...WALLS];
const BOX = { halfWidth: 0.5, halfHeight: 0.5 };

function positions(system) {
    const base = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const out = [];
    for (let i = 0; i < system.GetParticleCount(); i++) {
        out.push([Box2D.HEAPF32[base + 2 * i], Box2D.HEAPF32[base + 2 * i + 1]]);
    }
    return out;
}

// Piso, dos paredes y una caja dinámica pesada apoyada (una pieza de robot), con agua hasta 3 m
function settledWater(radius, params, flags = 0) {
    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const bodyDef = new Box2D.b2BodyDef();
    const ground = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(0, 0);
    for (const s of SOLIDS) {
        center.set_x(s.x);
        center.set_y(s.y);
        shape.SetAsBox(s.w / 2, s.h / 2, center, 0);
        ground.CreateFixture(shape, 0);
    }
    const boxDef = new Box2D.b2BodyDef();
    boxDef.set_type(Box2D.b2_dynamicBody);
    const at = new Box2D.b2Vec2(0, BOX.halfHeight);
    boxDef.set_position(at);
    const box = world.CreateBody(boxDef);
    Box2D.destroy(at);
    Box2D.destroy(boxDef);
    center.set_x(0);
    center.set_y(0);
    shape.SetAsBox(BOX.halfWidth, BOX.halfHeight, center, 0);
    box.CreateFixture(shape, 50);

    const system = createParticleSystem(world, { radius, ...params });
    const groupDef = new Box2D.b2ParticleGroupDef();
    center.set_y(1.5);
    shape.SetAsBox(2.9, 1.5, center, 0);
    groupDef.set_shape(shape);
    groupDef.set_flags(flags);
    system.CreateParticleGroup(groupDef);
    Box2D.destroy(groupDef);
    Box2D.destroy(center);
    Box2D.destroy(shape);
    for (let i = 0; i < 60 * SECONDS; i++) stepWorld(world);
    return { system, box };
}

// Un "jugador" con la caja como única pieza, con la forma de los renderItems de buildRenderItems
function playerOf(box) {
    return [{ renderItems: [{ body: box, type: "box", centerX: 0, centerY: 0, angle: 0, halfWidth: BOX.halfWidth, halfHeight: BOX.halfHeight }] }];
}

// Distancia del centro (x, y) a la caja, al piso y a las paredes
function distanceToSolids(x, y, box) {
    const p = box.GetPosition();
    const boxD = Math.hypot(Math.max(Math.abs(x - p.get_x()) - BOX.halfWidth, 0), Math.max(Math.abs(y - p.get_y()) - BOX.halfHeight, 0));
    const all = [boxD];
    for (const s of SOLIDS) {
        all.push(Math.hypot(Math.max(Math.abs(x - s.x) - s.w / 2, 0), Math.max(Math.abs(y - s.y) - s.h / 2, 0)));
    }
    return Math.min(...all);
}

test("disparos: el círculo acercado de la fila de contacto toca el cuerpo sin inflar la gota", (t) => {
    const { radius, ...params } = SHOT_SYSTEM;
    const { system, box } = settledWater(radius, params);
    collectSurfaces(playerOf(box), SOLIDS, SHOT_DRAW.snapReach);
    let near = 0;
    let best = Infinity;
    for (const [x, y] of positions(system)) {
        const d = distanceToSolids(x, y, box);
        if (d > SHOT_DRAW.snapFullReach) continue;
        near++;
        const p = skinPosition(x, y, SHOT_DRAW.radius, SHOT_DRAW.snapReach, SHOT_DRAW.snapFullReach);
        best = Math.min(best, distanceToSolids(p.x, p.y, box) - SHOT_DRAW.radius);
    }
    t.diagnostic(`disparos: ${near} partículas en la fila de contacto, hueco dibujado mínimo ${best.toFixed(3)} m, dibujo ${PARTICLE_RADIUS.toFixed(3)} m`);
    assert.ok(near >= 20);
    assert.ok(PARTICLE_RADIUS < 1.2 * SHOT_SYSTEM.radius);
    assert.ok(best <= TOUCH, `hueco dibujado ${best.toFixed(3)} m`);
});
