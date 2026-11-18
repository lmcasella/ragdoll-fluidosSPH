// Nivel en metros, Y hacia arriba, independiente del tamaño de la ventana.
// Alturas entre plataformas <= 3,5 m: el salto (9 m/s) llega a unos 4 m.
export const LEVEL = {
    bounds: { minX: 0, maxX: 56, minY: 0, maxY: 32 },
    // Rectángulos sólidos: { x, y } = centro, w × h
    solids: [
        { x: 28, y: 2, w: 56, h: 4, kind: "floor" },
        { x: -0.5, y: 16, w: 1, h: 32, kind: "wall" },
        { x: 56.5, y: 16, w: 1, h: 32, kind: "wall" },
        { x: 4.5, y: 6.8, w: 3, h: 0.4, kind: "platform" },
        { x: 13, y: 10.1, w: 8, h: 0.4, kind: "platform" },
        { x: 28, y: 7.2, w: 8, h: 0.4, kind: "platform" },
        { x: 28, y: 13.4, w: 12, h: 0.4, kind: "platform" },
        { x: 43, y: 10.1, w: 8, h: 0.4, kind: "platform" },
        { x: 51.5, y: 6.8, w: 3, h: 0.4, kind: "platform" },
    ],
    spawns: [{ x: 14, flipX: false }, { x: 42, flipX: true }],
};

// Crea los sólidos como fixtures de un único cuerpo estático
export function buildLevel(world, level = LEVEL) {
    const bodyDef = new Box2D.b2BodyDef();
    const ground = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(0, 0);
    for (const s of level.solids) {
        center.set_x(s.x);
        center.set_y(s.y);
        shape.SetAsBox(s.w / 2, s.h / 2, center, 0);
        const fixture = ground.CreateFixture(shape, 0);
        fixture.SetFriction(0.8);
    }
    Box2D.destroy(center);
    Box2D.destroy(shape);
    return ground;
}
