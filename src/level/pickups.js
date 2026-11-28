import { WEAPONS } from "../combat/weapons.js";

/** Segundos de juego hasta que un punto de aparición vuelve a estar disponible después de recogerse. */
export const PICKUP_RESPAWN = 15;

/**
 * Ítem de reparación (#156): `hp` que suma al recogerse (con tope en la salud máxima; en Infinito deja la salud en el máximo y
 * levanta al robot en nocaut) y `respawn` s de juego hasta que reaparece.
 */
export const REPAIR = { hp: 35, respawn: 20 };

/** Radio del sensor circular de cada punto de aparición, en metros. */
export const PICKUP_RADIUS = 0.5;

/**
 * Puntos de aparición de armas (docs/design/04-fluidos.md §4.2). Cada punto es un sensor circular en su propio cuerpo
 * estático. Los contactos llegan por `DamageSystem.sensorHooks` y solo se encolan: `process` aplica la recogida
 * después de `stepWorld`. Mientras espera reaparecer, el cuerpo queda inactivo y al reactivarse Box2D vuelve a
 * generar el contacto con quien siga encima. Quien ya tiene el tanque de ese líquido lleno lo atraviesa sin
 * consumirlo (#181). El punto `kind: "repair"` suma `REPAIR.hp` a la salud y no se recoge con la salud llena.
 *
 * Con una caja (`boxer`, ver `src/level/crates.js` y `docs/design/04-fluidos.md` §4.2) el ítem arranca encerrado: el punto
 * queda inactivo (`hold`) hasta que la caja se rompe y lo libera donde estaba (`release`), y al reaparecer después de
 * recogerse es la caja la que vuelve (`boxer.box`), no el ítem. `x` e `y` son donde está el ítem ahora y `homeX` y `homeY`
 * el punto original.
 */
export class Pickups {
    constructor(world, damage, points, weapons = WEAPONS) {
        this.world = world;
        this.damage = damage;
        this.weapons = new Map(weapons.map((w) => [w.id, w]));
        this.queue = [];
        /** Recogidas `{ weapon }` o `{ kind: "repair" }` desde la última vez que quien las consume vació la lista. */
        this.events = [];
        /** Quien encierra los ítems en cajas (`box(point)`, `unbox(point)`, `reset()`), o `null` si salen sueltos. */
        this.boxer = null;
        this.points = [];
        /** Desplazamiento vertical (m) que se suma a la y de cada punto para ubicar su cuerpo (el mapa del ascenso baja). */
        this.offsetY = 0;
        this.bodyDef = new Box2D.b2BodyDef();
        this.shape = new Box2D.b2CircleShape();
        this.shape.set_m_radius(PICKUP_RADIUS);
        this.center = new Box2D.b2Vec2(0, 0);
        for (const point of points) this.add(point);
    }

    /** Crea el punto `{ x, y, weapon }` o `{ x, y, kind: "repair" }` (cuerpo, sensor y gancho de contacto) y lo devuelve con su estado. */
    add({ x, y, weapon, kind }) {
        this.center.set_x(x);
        this.center.set_y(y);
        this.bodyDef.set_position(this.center);
        const body = this.world.CreateBody(this.bodyDef);
        const fixture = body.CreateFixture(this.shape, 0);
        fixture.SetSensor(true);
        const point = { x, y, homeX: x, homeY: y, weapon, kind, body, fixture, active: true, readyAt: 0, crate: null };
        this.points.push(point);
        this.damage.sensorHooks.set(Box2D.getPointer(fixture), (bodyPtr) => this.queue.push({ point, bodyPtr }));
        this.boxer?.box(point);
        return point;
    }

    /** Deja el punto inactivo en su lugar original, sin fecha de reaparición: lo libera `release`. */
    hold(point) {
        point.x = point.homeX;
        point.y = point.homeY;
        point.active = false;
        point.readyAt = Infinity;
        point.body.SetActive(false);
    }

    /** Activa el punto con el ítem en `(x, y)` (y local, como `homeY`). No llamar dentro de un callback de Box2D. */
    release(point, x, y) {
        point.x = x;
        point.y = y;
        this.center.set_x(x);
        this.center.set_y(y + this.offsetY);
        point.body.SetTransform(this.center, 0);
        point.active = true;
        point.readyAt = 0;
        point.body.SetActive(true);
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
        this.boxer?.unbox(point);
        this.points.splice(index, 1);
        this.damage.sensorHooks.delete(Box2D.getPointer(point.fixture));
        this.queue = this.queue.filter((event) => event.point !== point);
        this.world.DestroyBody(point.body);
    }

    /** Deja el punto inactivo hasta `readyAt` (s de juego). */
    consume(point, readyAt) {
        point.active = false;
        point.readyAt = readyAt;
        point.body.SetActive(false);
    }

    /** Aplica lo encolado durante el paso y reactiva los puntos cuyo tiempo venció; llamar después de `stepWorld`. */
    process(now) {
        for (const { point, bodyPtr } of this.queue) {
            if (!point.active) continue;
            const owner = this.damage.ownerOf(bodyPtr);
            if (point.kind === "repair") {
                if (!owner || owner.player.dead || owner.player.intact) continue;
                owner.player.repair(REPAIR.hp);
                this.consume(point, now + REPAIR.respawn);
                this.events.push({ kind: "repair" });
                continue;
            }
            const weapon = this.weapons.get(point.weapon);
            if (!owner || owner.player.dead || !weapon) continue;
            if ((owner.player.tanks.get(weapon.id) ?? -1) >= weapon.tank) continue;
            owner.player.tanks.set(weapon.id, weapon.tank);
            if (owner.player.weapon === null) owner.player.weapon = weapon.id;
            this.consume(point, now + PICKUP_RESPAWN);
            this.events.push({ weapon: weapon.id });
        }
        this.queue.length = 0;
        for (const point of this.points) {
            if (point.active || now < point.readyAt) continue;
            if (this.boxer) {
                this.boxer.box(point);
                continue;
            }
            point.active = true;
            point.body.SetActive(true);
        }
    }

    /**
     * Nueva ronda: todos los puntos vuelven a su lugar original y a estar disponibles (o, con `boxer`, encerrados en una
     * caja nueva) y se descarta lo encolado.
     */
    reset() {
        this.queue.length = 0;
        this.events.length = 0;
        for (const point of this.points) {
            this.release(point, point.homeX, point.homeY);
        }
        this.boxer?.reset();
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
