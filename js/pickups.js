import { WEAPONS } from "./weapons.js";

/** Segundos de juego hasta que un punto de aparición vuelve a estar disponible después de recogerse. */
export const PICKUP_RESPAWN = 15;

/** Radio del sensor circular de cada punto de aparición, en metros. */
export const PICKUP_RADIUS = 0.5;

/**
 * Puntos de aparición de armas (docs/design/04-fluidos.md §4.2). Cada punto es un sensor circular en su propio cuerpo
 * estático. Los contactos llegan por `DamageSystem.sensorHooks` y solo se encolan: `process` aplica la recogida
 * después de `stepWorld`. Mientras espera reaparecer, el cuerpo queda inactivo y al reactivarse Box2D vuelve a
 * generar el contacto con quien siga encima.
 */
export class Pickups {
    constructor(world, damage, points, weapons = WEAPONS) {
        this.world = world;
        this.damage = damage;
        this.weapons = new Map(weapons.map((w) => [w.id, w]));
        this.queue = [];
        /** Recogidas `{ weapon }` desde la última vez que quien las consume vació la lista. */
        this.events = [];
        this.points = [];
        /** Desplazamiento vertical (m) que se suma a la y de cada punto para ubicar su cuerpo (el mapa del ascenso baja). */
        this.offsetY = 0;
        this.bodyDef = new Box2D.b2BodyDef();
        this.shape = new Box2D.b2CircleShape();
        this.shape.set_m_radius(PICKUP_RADIUS);
        this.center = new Box2D.b2Vec2(0, 0);
        for (const point of points) this.add(point);
    }

    /** Crea el punto `{ x, y, weapon }` (cuerpo, sensor y gancho de contacto) y lo devuelve con su estado. */
    add({ x, y, weapon }) {
        this.center.set_x(x);
        this.center.set_y(y);
        this.bodyDef.set_position(this.center);
        const body = this.world.CreateBody(this.bodyDef);
        const fixture = body.CreateFixture(this.shape, 0);
        fixture.SetSensor(true);
        const point = { x, y, weapon, body, fixture, active: true, readyAt: 0 };
        this.points.push(point);
        this.damage.sensorHooks.set(Box2D.getPointer(fixture), (bodyPtr) => this.queue.push({ point, bodyPtr }));
        return point;
    }

    /** Pone el desplazamiento offsetY y mueve los cuerpos de los puntos con él. No llamar dentro de un callback de Box2D. */
    shift(offsetY) {
        if (offsetY === this.offsetY) return;
        this.offsetY = offsetY;
        for (const point of this.points) {
            this.center.set_x(point.x);
            this.center.set_y(point.y + offsetY);
            point.body.SetTransform(this.center, 0);
        }
    }

    /** Quita el punto: su gancho, lo encolado de ese punto y su cuerpo. No llamar dentro de un callback de Box2D. */
    remove(point) {
        const index = this.points.indexOf(point);
        if (index < 0) return;
        this.points.splice(index, 1);
        this.damage.sensorHooks.delete(Box2D.getPointer(point.fixture));
        this.queue = this.queue.filter((event) => event.point !== point);
        this.world.DestroyBody(point.body);
    }

    /** Aplica lo encolado durante el paso y reactiva los puntos cuyo tiempo venció; llamar después de `stepWorld`. */
    process(now) {
        for (const { point, bodyPtr } of this.queue) {
            if (!point.active) continue;
            const owner = this.damage.ownerOf(bodyPtr);
            const weapon = this.weapons.get(point.weapon);
            if (!owner || owner.player.dead || !weapon) continue;
            owner.player.tanks.set(weapon.id, weapon.tank);
            if (owner.player.weapon === null) owner.player.weapon = weapon.id;
            point.active = false;
            point.readyAt = now + PICKUP_RESPAWN;
            point.body.SetActive(false);
            this.events.push({ weapon: weapon.id });
        }
        this.queue.length = 0;
        for (const point of this.points) {
            if (!point.active && now >= point.readyAt) {
                point.active = true;
                point.body.SetActive(true);
            }
        }
    }

    /** Nueva ronda: todos los puntos vuelven a estar disponibles y se descarta lo encolado. */
    reset() {
        this.queue.length = 0;
        this.events.length = 0;
        for (const point of this.points) {
            if (point.active) continue;
            point.active = true;
            point.body.SetActive(true);
        }
    }

    dispose() {
        for (const point of this.points) {
            this.damage.sensorHooks.delete(Box2D.getPointer(point.fixture));
            this.world.DestroyBody(point.body);
        }
        this.points.length = 0;
        this.queue.length = 0;
        Box2D.destroy(this.center);
        Box2D.destroy(this.shape);
        Box2D.destroy(this.bodyDef);
    }
}
