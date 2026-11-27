import { fixtureBounds, forEachBody } from "../core/engine/box2d.js";

/**
 * Valores de las plataformas rompibles. `defaultTime` (s) es el aguante si el sólido declara `breakable: true` sin
 * duración propia; `respawn` (s) es cuánto tarda en reaparecer; `below` (m) es cuánto puede estar el punto más bajo del
 * robot bajo el tope para que su contacto cuente como pisada (la tolerancia de `ONE_WAY`).
 */
export const BREAKABLE = {
    defaultTime: 1.5,
    respawn: 4,
    below: 0.05,
};

/** Caja de trabajo del fixture de la plataforma y resultado de `BreakablePlatforms.occupied`: se reutilizan para no crear objetos por frame. */
const FIXTURE_BOX = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const stepScan = { target: 0, found: false };

/**
 * Marca en `scan.found` si alguna pieza de `body` toca el fixture `scan.target`.
 * @param {object} body `b2Body`
 * @param {{target: number, found: boolean}} scan puntero del fixture buscado y resultado acumulado
 */
function scanBodyForStep(body, scan) {
    if (scan.found) return;
    for (let edge = body.GetContactList(); Box2D.getPointer(edge) !== 0; edge = edge.get_next()) {
        const contact = edge.get_contact();
        if (!contact.IsTouching()) continue;
        if (Box2D.getPointer(contact.GetFixtureA()) === scan.target || Box2D.getPointer(contact.GetFixtureB()) === scan.target) {
            scan.found = true;
            return;
        }
    }
}
/**
 * Plataformas que se rompen `duration` s después del primer toque de un robot apoyado y reaparecen `respawn` s después.
 * Al romperse, la fixture pasa a sensor (`SetSensor(true)` + `Refilter()`) para no destruir memoria nativa ni
 * invalidar punteros de cuerpos. Al reaparecer (y en `reset`) pide a `OneWayPlatforms` que olvide los pares de esa
 * fixture antes de volverla sólida: con la histéresis de `src/level/platforms.js`, un par que quedó sólido antes de la rotura
 * dejaría a un robot superpuesto chocando desde adentro. Escribe `crack` (0 a 1) y `broken` en el objeto `solid` para que
 * `src/render/levelView.js` dibuje el temblor y el estado roto sin acoplarse a este módulo. Ver `05-escenario.md` §5.4.
 */
export class BreakablePlatforms {
    constructor(platforms, config = BREAKABLE) {
        this.platforms = platforms;
        this.config = config;
        this.entries = new Map();
    }

    /**
     * Registra una plataforma rompible. `solid.breakable` puede ser `true` (usa `defaultTime`) o un número en segundos.
     */
    add(fixture, solid) {
        const duration =
            typeof solid.breakable === "number"
                ? solid.breakable
                : this.config.defaultTime;
        solid.crack = 0;
        solid.broken = false;
        this.entries.set(Box2D.getPointer(fixture), {
            fixture,
            solid,
            duration,
            armed: false,
            timer: 0,
            respawnAt: 0,
        });
    }

    /** Quita la plataforma del seguimiento (al liberar filas en Infinito). */
    remove(fixture) {
        this.entries.delete(Box2D.getPointer(fixture));
    }

    /** Vacía el registro al cambiar de mapa. */
    clear() {
        this.entries.clear();
    }

    /** Vuelve la plataforma a sólida: los dueños olvidan sus pares y se recalculan los contactos. */
    restore(entry) {
        entry.solid.broken = false;
        this.platforms.forget(entry.fixture);
        entry.fixture.SetSensor(false);
        entry.fixture.Refilter();
    }

    /** Restaura todas las plataformas al estado intacto (nueva ronda, fin de partida). */
    reset() {
        for (const entry of this.entries.values()) {
            const wasBroken = entry.solid.broken;
            entry.armed = false;
            entry.timer = 0;
            entry.respawnAt = 0;
            entry.solid.crack = 0;
            if (wasBroken) this.restore(entry);
        }
    }

    /**
     * Arma la cuenta con el primer robot apoyado, la deja correr aunque se baje, rompe las vencidas y restaura las que
     * cumplieron su `respawn`. `crack` es el tiempo transcurrido sobre `duration` (0 sin armar). Llamar tras `stepWorld`.
     */
    update(players, dt, now) {
        const { respawn } = this.config;
        for (const entry of this.entries.values()) {
            const { fixture, solid } = entry;
            if (solid.broken) {
                if (now >= entry.respawnAt) {
                    entry.armed = false;
                    entry.timer = 0;
                    solid.crack = 0;
                    this.restore(entry);
                }
                continue;
            }
            if (!entry.armed && this.occupied(fixture, players)) entry.armed = true;
            if (!entry.armed) continue;
            entry.timer += dt;
            solid.crack = Math.min(1, entry.timer / entry.duration);
            if (entry.timer >= entry.duration) {
                solid.broken = true;
                solid.crack = 0;
                entry.armed = false;
                entry.respawnAt = now + respawn;
                fixture.SetSensor(true);
                fixture.Refilter();
            }
        }
    }

    /**
     * Verdadero si algún robot vivo pisa `fixture`: una pieza suya la toca (contacto real, que `OneWayPlatforms` no
     * genera mientras el robot la cruza desde abajo) y su punto más bajo está a `below` m o menos bajo el tope.
     */
    occupied(fixture, players) {
        const top = fixtureBounds(fixture, FIXTURE_BOX).maxY;
        stepScan.target = Box2D.getPointer(fixture);
        stepScan.found = false;
        for (const player of players) {
            if (player.dead || player.lowestPoint() < top - this.config.below) continue;
            forEachBody(player.rag.bodies, scanBodyForStep, stepScan);
            if (stepScan.found) return true;
        }
        return false;
    }
}
