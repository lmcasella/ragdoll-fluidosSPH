import { FLUID } from "./weapons.js";

// Nivel en metros, Y hacia arriba, independiente del tamaño de la ventana.
// Alturas entre plataformas <= 3,5 m: el salto (9 m/s) llega a unos 4 m.
// El hueco central es la pileta: agua del campo de alturas (js/water.js) y un sensor que destruye al robot que se hunde.
export const LEVEL = {
    bounds: { minX: 0, maxX: 56, minY: 0, maxY: 32 },
    // Rectángulos sólidos: { x, y } = centro, w × h
    solids: [
        { x: 28, y: -0.5, w: 56, h: 1, kind: "floor" },
        { x: 9, y: 2, w: 18, h: 4, kind: "floor" },
        { x: 47, y: 2, w: 18, h: 4, kind: "floor" },
        { x: -0.5, y: 16, w: 1, h: 32, kind: "wall" },
        { x: 56.5, y: 16, w: 1, h: 32, kind: "wall" },
        { x: 4.5, y: 6.8, w: 3, h: 0.4, kind: "platform", oneWay: true },
        { x: 13, y: 10.1, w: 8, h: 0.4, kind: "platform", oneWay: true },
        { x: 21, y: 5.6, w: 2, h: 0.4, kind: "platform", oneWay: true },
        { x: 28, y: 7.6, w: 8, h: 0.4, kind: "platform", oneWay: true },
        { x: 35, y: 5.6, w: 2, h: 0.4, kind: "platform", oneWay: true },
        { x: 28, y: 13.4, w: 12, h: 0.4, kind: "platform", oneWay: true },
        { x: 43, y: 10.1, w: 8, h: 0.4, kind: "platform", oneWay: true },
        { x: 51.5, y: 6.8, w: 3, h: 0.4, kind: "platform", oneWay: true },
    ],
    /** Pileta: el campo de alturas arranca con agua entre `x1` y `x2` hasta `surface` (m); el sensor cubre hasta `killY` (robot medio hundido). */
    pool: {
        x1: 18,
        x2: 38,
        bottom: 0,
        surface: 3,
        killY: 2.2,
    },
    /** Inundación (muerte súbita): llueve desde `emitY` y la fuente sube el nivel `riseSpeed` m/s a partir de `start` s de ronda; `maxRate` en gotas/s. */
    flood: {
        start: 60,
        riseSpeed: 0.15,
        maxLevel: 15,
        emitY: 31.5,
        emitX1: 1,
        emitX2: 55,
        dropSpeed: 8,
        maxRate: 1200,
    },
    // En el piso, entre plataformas (el rayo de aparición baja desde el techo hasta la primera superficie)
    spawns: [{ x: 7.5, flipX: false }, { x: 48.5, flipX: true }],
    /** Puntos de aparición de armas: centro del ícono (0,6 m sobre la cara superior de la plataforma) y `weapon` = id de `FLUID`. */
    pickups: [
        { x: 28, y: 14.2, weapon: FLUID.ACID },
        { x: 13, y: 10.9, weapon: FLUID.LAVA },
        { x: 43, y: 10.9, weapon: FLUID.LAVA },
        { x: 4.5, y: 7.6, weapon: FLUID.HONEY },
        { x: 51.5, y: 7.6, weapon: FLUID.HONEY },
        { x: 26, y: 8.4, weapon: FLUID.WATER },
        { x: 30, y: 8.4, kind: "repair" },
    ],
};

// Crea los sólidos y el sensor de la pileta como fixtures de un único cuerpo estático; `oneWayFixtures` son los sólidos con `oneWay: true`
export function buildLevel(world, level = LEVEL) {
    const bodyDef = new Box2D.b2BodyDef();
    const ground = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(0, 0);
    const box = (x, y, w, h) => {
        center.set_x(x);
        center.set_y(y);
        shape.SetAsBox(w / 2, h / 2, center, 0);
        return ground.CreateFixture(shape, 0);
    };
    const oneWayFixtures = [];
    for (const s of level.solids) {
        const fixture = box(s.x, s.y, s.w, s.h);
        fixture.SetFriction(0.8);
        if (s.oneWay) oneWayFixtures.push(fixture);
    }

    const killSensors = new Set();
    if (level.pool) {
        const { x1, x2, bottom, killY } = level.pool;
        const sensor = box((x1 + x2) / 2, (bottom + killY) / 2, x2 - x1, killY - bottom);
        sensor.SetSensor(true);
        killSensors.add(Box2D.getPointer(sensor));
    }
    Box2D.destroy(center);
    Box2D.destroy(shape);
    return { ground, killSensors, oneWayFixtures };
}
