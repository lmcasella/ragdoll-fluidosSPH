// Raycast sobre el mundo de Box2D (world.RayCast). Usa un solo callback y dos vectores reutilizados:
// no reserva memoria nativa por rayo (regla 7.4 de RagImporter).
// El valor que devuelve ReportFixture define el modo, como en la materia:
//   -1 ignora la forma (sensores y cuerpos excluidos), fraction recorta el rayo y deja el impacto más cercano.
export class Raycaster {
    constructor(world) {
        this.world = world;
        this.p1 = new Box2D.b2Vec2(0, 0);
        this.p2 = new Box2D.b2Vec2(0, 0);
        this.ignore = null;
        this.hit = null;
        this.count = 0;
        this.callback = new Box2D.JSRayCastCallback();
        this.callback.ReportFixture = (fixturePtr, pointPtr, normalPtr, fraction) =>
            this.report(fixturePtr, pointPtr, normalPtr, fraction);
    }

    report(fixturePtr, pointPtr, normalPtr, fraction) {
        const fixture = Box2D.wrapPointer(fixturePtr, Box2D.b2Fixture);
        if (fixture.IsSensor()) return -1;
        const bodyPtr = Box2D.getPointer(fixture.GetBody());
        if (this.ignore?.has(bodyPtr)) return -1;
        const point = Box2D.wrapPointer(pointPtr, Box2D.b2Vec2);
        const normal = Box2D.wrapPointer(normalPtr, Box2D.b2Vec2);
        this.hit = {
            bodyPtr,
            x: point.get_x(),
            y: point.get_y(),
            nx: normal.get_x(),
            ny: normal.get_y(),
            fraction,
        };
        return fraction;
    }

    // Impacto más cercano entre (x1, y1) y (x2, y2), o null. ignore: Set de punteros de cuerpos
    cast(x1, y1, x2, y2, ignore = null) {
        this.count++;
        this.p1.set_x(x1);
        this.p1.set_y(y1);
        this.p2.set_x(x2);
        this.p2.set_y(y2);
        this.hit = null;
        this.ignore = ignore;
        this.world.RayCast(this.callback, this.p1, this.p2);
        this.ignore = null;
        return this.hit;
    }
}

const raycasters = new WeakMap();

// Un Raycaster por mundo, compartido entre jugadores y sistemas
export function getRaycaster(world) {
    let raycaster = raycasters.get(world);
    if (!raycaster) {
        raycaster = new Raycaster(world);
        raycasters.set(world, raycaster);
    }
    return raycaster;
}
