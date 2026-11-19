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
        this.points = [];
        const bodyDef = new Box2D.b2BodyDef();
        const shape = new Box2D.b2CircleShape();
        shape.set_m_radius(PICKUP_RADIUS);
        const center = new Box2D.b2Vec2(0, 0);
        for (const { x, y, weapon } of points) {
            center.set_x(x);
            center.set_y(y);
            bodyDef.set_position(center);
            const body = world.CreateBody(bodyDef);
            const fixture = body.CreateFixture(shape, 0);
            fixture.SetSensor(true);
            const point = { x, y, weapon, body, fixture, active: true, readyAt: 0 };
            this.points.push(point);
            damage.sensorHooks.set(Box2D.getPointer(fixture), (bodyPtr) => this.queue.push({ point, bodyPtr }));
        }
        Box2D.destroy(center);
        Box2D.destroy(shape);
        Box2D.destroy(bodyDef);
    }

    /** Aplica lo encolado durante el paso y reactiva los puntos cuyo tiempo venció; llamar después de `stepWorld`. */
    process(now) {
        for (const { point, bodyPtr } of this.queue) {
            if (!point.active) continue;
            const owner = this.damage.ownerOf(bodyPtr);
            const weapon = this.weapons.get(point.weapon);
            if (!owner || owner.player.dead || !weapon) continue;
            owner.player.tanks.set(weapon.id, weapon.tank);
            point.active = false;
            point.readyAt = now + PICKUP_RESPAWN;
            point.body.SetActive(false);
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
    }
}
