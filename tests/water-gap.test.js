// Hueco visible entre el agua y los cuerpos (#45, docs/design/07-sph.md §7.4): LiquidFun real, con el paso fijo del juego
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";
import { loadGame } from "./helpers/game.js";

const { stepWorld } = await import("../lib/ragimporter.js");
const { createParticleSystem } = await import("../js/particles.js");
const { LEVEL } = await import("../js/level.js");
const { SHOT_SYSTEM } = await import("../js/weapons.js");
const { collectSurfaces, skinPosition } = await import("../js/render.js");

const DRAW = LEVEL.pool.draw;
const SECONDS = 8;
// Tolerancia del borde dibujado respecto de la superficie (m); el agua se mete SKIN_OVERLAP = 0,02 m bajo el cuerpo
const TOUCH = 0.01;

const FLOOR = { x: 0, y: -0.5, w: 10, h: 1 };
const WALLS = [{ x: -3.5, y: 2, w: 1, h: 6 }, { x: 3.5, y: 2, w: 1, h: 6 }];
const SOLIDS = [FLOOR, ...WALLS];
const BOX = { hw: 0.5, hh: 0.5 };

function positions(system) {
    const base = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
    const out = [];
    for (let i = 0; i < system.GetParticleCount(); i++) {
        out.push([Box2D.HEAPF32[base + 2 * i], Box2D.HEAPF32[base + 2 * i + 1]]);
    }
    return out;
}

// Piso, dos paredes y una caja dinámica pesada apoyada (una pieza de robot), con agua hasta 3 m
function settledWater(radius, params, flags) {
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
    const at = new Box2D.b2Vec2(0, BOX.hh);
    boxDef.set_position(at);
    const box = world.CreateBody(boxDef);
    Box2D.destroy(at);
    Box2D.destroy(boxDef);
    center.set_x(0);
    center.set_y(0);
    shape.SetAsBox(BOX.hw, BOX.hh, center, 0);
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
    return [{ renderItems: [{ body: box, type: "box", cx: 0, cy: 0, angle: 0, hw: BOX.hw, hh: BOX.hh }] }];
}

// Distancia del centro (x, y) a la caja, al piso y a las paredes
function distanceToSolids(x, y, box) {
    const p = box.GetPosition();
    const boxD = Math.hypot(Math.max(Math.abs(x - p.get_x()) - BOX.hw, 0), Math.max(Math.abs(y - p.get_y()) - BOX.hh, 0));
    const all = [boxD];
    for (const s of SOLIDS) {
        all.push(Math.hypot(Math.max(Math.abs(x - s.x) - s.w / 2, 0), Math.max(Math.abs(y - s.y) - s.h / 2, 0)));
    }
    return Math.min(...all);
}

test("agua del nivel: el centro de las partículas queda a ~1,85 radios del cuerpo, más lejos de lo que cubre el dibujo", (t) => {
    const { system, box } = settledWater(LEVEL.pool.radius, LEVEL.pool.physics, LEVEL.pool.flags);
    const first = positions(system)
        .map(([x, y]) => distanceToSolids(x, y, box))
        .filter((d) => d < DRAW.snapReach);
    const standoff = Math.min(...first);
    t.diagnostic(`primera fila: ${first.length} partículas, distancia mínima ${standoff.toFixed(3)} m, dibujo ${DRAW.radius} m, hueco ${(standoff - DRAW.radius).toFixed(3)} m`);
    assert.ok(first.length >= 20, `solo ${first.length} partículas junto a los cuerpos`);
    assert.ok(standoff > DRAW.radius + 0.1, `la física ya no deja hueco (${standoff.toFixed(3)} m): revisar el acercamiento`);
    assert.ok(standoff < DRAW.snapFullReach, `la primera fila (${standoff.toFixed(3)} m) quedó fuera de snapFullReach`);
});

test("agua del nivel: el segundo círculo de contacto toca los cuerpos y las partículas lejanas no tienen", (t) => {
    const { system, box } = settledWater(LEVEL.pool.radius, LEVEL.pool.physics, LEVEL.pool.flags);
    collectSurfaces(playerOf(box), SOLIDS, DRAW.snapReach);
    let near = 0;
    let worst = -Infinity;
    let overlap = Infinity;
    for (const [x, y] of positions(system)) {
        const d = distanceToSolids(x, y, box);
        const p = skinPosition(x, y, DRAW.radius, DRAW.snapReach, DRAW.snapFullReach);
        if (d >= DRAW.snapReach) {
            assert.equal(p.x, x);
            assert.equal(p.y, y);
            continue;
        }
        if (d > DRAW.snapFullReach) continue;
        near++;
        const drawnGap = distanceToSolids(p.x, p.y, box) - DRAW.radius;
        worst = Math.max(worst, drawnGap);
        overlap = Math.min(overlap, drawnGap);
    }
    t.diagnostic(`${near} partículas de la primera fila: hueco del segundo círculo entre ${overlap.toFixed(3)} y ${worst.toFixed(3)} m`);
    assert.ok(near >= 20);
    assert.ok(worst <= TOUCH, `hueco dibujado ${worst.toFixed(3)} m`);
    assert.ok(overlap >= -0.05, `el agua se mete ${(-overlap).toFixed(3)} m bajo el cuerpo`);
});

test("disparos: el círculo dibujado (0,14 m) cubre la distancia al cuerpo, sin hueco", { todo: "con r = 0,12 m la primera fila queda a 0,192 m y el radio de dibujo sigue en 0,14 m (ver informe de #69)" }, (t) => {
    const { radius, ...params } = SHOT_SYSTEM;
    const { system, box } = settledWater(radius, params, 0);
    const first = positions(system)
        .map(([x, y]) => distanceToSolids(x, y, box))
        .filter((d) => d < 0.3);
    const standoff = Math.min(...first);
    t.diagnostic(`disparos: ${first.length} partículas junto a los cuerpos, distancia mínima ${standoff.toFixed(3)} m, dibujo 0.14 m`);
    assert.ok(first.length >= 20);
    // Las partículas sueltas por encima de la fila de contacto no cuentan: se mide la fila más cercana
    assert.ok(standoff < 0.14, `la fila de contacto queda a ${standoff.toFixed(3)} m`);
});

test("robot en la pileta: el agua dibujada toca todas sus piezas", async (t) => {
    const real = LEVEL.spawns;
    LEVEL.spawns = [{ x: 19, flipX: false }, { x: 48.5, flipX: true }];
    let game;
    try {
        game = await loadGame();
    } finally {
        LEVEL.spawns = real;
    }
    game.setPad(0);
    game.setPad(1);
    game.frames(60 * 12);
    const { players, poolSystem } = game.state;
    collectSurfaces(players, LEVEL.solids, DRAW.snapReach);
    let near = 0;
    let worstRaw = -Infinity;
    let worst = -Infinity;
    for (const [x, y] of positions(poolSystem)) {
        const drawn = skinPosition(x, y, DRAW.radius, DRAW.snapReach, DRAW.snapFullReach);
        const moved = Math.hypot(drawn.x - x, drawn.y - y);
        if (moved === 0) continue;
        near++;
        worstRaw = Math.max(worstRaw, moved);
        // Tras el acercamiento, la distancia restante al cuerpo más cercano
        const probe = skinPosition(drawn.x, drawn.y, DRAW.radius, DRAW.snapReach, DRAW.snapFullReach);
        worst = Math.max(worst, Math.hypot(probe.x - drawn.x, probe.y - drawn.y));
    }
    t.diagnostic(`${near} partículas acercadas, hasta ${worstRaw.toFixed(3)} m; el acercamiento repetido ya no mueve más de ${worst.toFixed(3)} m`);
    assert.ok(near >= 5, `solo ${near} partículas junto a piso y robot`);
    assert.ok(worst <= TOUCH, `queda hueco de ${worst.toFixed(3)} m`);
});
