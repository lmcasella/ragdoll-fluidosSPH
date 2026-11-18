// Nivel en metros, Y hacia arriba, independiente del tamaño de la ventana.
// Alturas entre plataformas <= 3,5 m: el salto (9 m/s) llega a unos 4 m.
// El hueco central es la pileta: agua SPH (sistema propio) y un sensor que destruye al robot que se hunde.
export const LEVEL = {
    bounds: { minX: 0, maxX: 56, minY: 0, maxY: 32 },
    // Rectángulos sólidos: { x, y } = centro, w × h
    solids: [
        { x: 28, y: -0.5, w: 56, h: 1, kind: "floor" },
        { x: 9, y: 2, w: 18, h: 4, kind: "floor" },
        { x: 47, y: 2, w: 18, h: 4, kind: "floor" },
        { x: -0.5, y: 16, w: 1, h: 32, kind: "wall" },
        { x: 56.5, y: 16, w: 1, h: 32, kind: "wall" },
        { x: 4.5, y: 6.8, w: 3, h: 0.4, kind: "platform" },
        { x: 13, y: 10.1, w: 8, h: 0.4, kind: "platform" },
        { x: 21, y: 5.6, w: 2, h: 0.4, kind: "platform" },
        { x: 28, y: 7.6, w: 8, h: 0.4, kind: "platform" },
        { x: 35, y: 5.6, w: 2, h: 0.4, kind: "platform" },
        { x: 28, y: 13.4, w: 12, h: 0.4, kind: "platform" },
        { x: 43, y: 10.1, w: 8, h: 0.4, kind: "platform" },
        { x: 51.5, y: 6.8, w: 3, h: 0.4, kind: "platform" },
    ],
    // Pileta: agua entre x1..x2 hasta `surface`; el sensor cubre hasta `killY` (robot medio hundido)
    pool: { x1: 18, x2: 38, bottom: 0, surface: 3, killY: 2.2 },
    // En el piso, entre plataformas (el rayo de aparición baja desde el techo hasta la primera superficie)
    spawns: [{ x: 7.5, flipX: false }, { x: 48.5, flipX: true }],
};

// Crea los sólidos y el sensor de la pileta como fixtures de un único cuerpo estático
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
    for (const s of level.solids) box(s.x, s.y, s.w, s.h).SetFriction(0.8);

    const killSensors = new Set();
    if (level.pool) {
        const { x1, x2, bottom, killY } = level.pool;
        const sensor = box((x1 + x2) / 2, (bottom + killY) / 2, x2 - x1, killY - bottom);
        sensor.SetSensor(true);
        killSensors.add(Box2D.getPointer(sensor));
    }
    Box2D.destroy(center);
    Box2D.destroy(shape);
    return { ground, killSensors };
}

// Agua de la pileta: sistema de partículas propio, más grueso que el de los disparos (menos partículas)
export function fillPool(world, level = LEVEL) {
    const { x1, x2, bottom, surface } = level.pool;
    const def = new Box2D.b2ParticleSystemDef();
    def.set_radius(0.2);
    def.set_dampingStrength(0.2);
    const system = world.CreateParticleSystem(def);
    Box2D.destroy(def);

    const groupDef = new Box2D.b2ParticleGroupDef();
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2((x1 + x2) / 2, (bottom + surface) / 2);
    shape.SetAsBox((x2 - x1) / 2 - 0.1, (surface - bottom) / 2, center, 0);
    groupDef.set_shape(shape);
    const color = new Box2D.b2ParticleColor(40, 120, 255, 255);
    groupDef.set_color(color);
    system.CreateParticleGroup(groupDef);
    Box2D.destroy(color);
    Box2D.destroy(center);
    Box2D.destroy(shape);
    Box2D.destroy(groupDef);
    return system;
}
