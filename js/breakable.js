/**
 * Valores de las plataformas rompibles. `defaultTime` (s) es el aguante si el sólido declara `breakable: true` sin
 * duración propia; `respawn` (s) es cuánto tarda en reaparecer; `recoverRate` (s/s) es qué tan rápido se recupera al
 * quedar vacía; `slack` (m) es la holgura para detectar apoyo sobre el tope.
 */
export const BREAKABLE = {
    defaultTime: 1.5,
    respawn: 4,
    recoverRate: 0.5,
    slack: { x: 0.3, y: 0.35 },
};

/**
 * Plataformas que se rompen al sostener un robot durante `duration` s y reaparecen luego de `respawn` s.
 * Al romperse, la fixture pasa a sensor (`SetSensor(true)` + `Refilter()`) para no destruir memoria nativa ni
 * invalidar punteros de cuerpos. Escribe `crack` (0 a 1) y `broken` en el objeto `solid` para que `render.js`
 * dibuje el temblor y el estado roto sin acoplarse a este módulo.
 */
export class BreakablePlatforms {
    constructor(config = BREAKABLE) {
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

    /** Restaura todas las plataformas al estado intacto (nueva ronda). */
    reset() {
        for (const entry of this.entries.values()) {
            entry.timer = 0;
            entry.respawnAt = 0;
            entry.solid.crack = 0;
            if (entry.solid.broken) {
                entry.solid.broken = false;
                entry.fixture.SetSensor(false);
                entry.fixture.Refilter();
            }
        }
    }

    /** Avanza temporizadores, rompe las vencidas y restaura las que cumplieron su `respawn`. Llamar tras `stepWorld`. */
    update(players, dt, now) {
        const { slack, recoverRate, respawn } = this.config;
        for (const entry of this.entries.values()) {
            const { fixture, solid } = entry;
            if (solid.broken) {
                if (now >= entry.respawnAt) {
                    solid.broken = false;
                    solid.crack = 0;
                    entry.timer = 0;
                    fixture.SetSensor(false);
                    fixture.Refilter();
                }
                continue;
            }
            const aabb = fixture.GetAABB(0);
            const minX = aabb.get_lowerBound().get_x();
            const maxX = aabb.get_upperBound().get_x();
            const top = aabb.get_upperBound().get_y();
            let occupied = false;
            for (const player of players) {
                if (player.dead || !player.grounded) continue;
                const px = player.torso.GetPosition().get_x();
                if (px < minX - slack.x || px > maxX + slack.x) continue;
                if (Math.abs(player.lowestPoint() - top) <= slack.y) {
                    occupied = true;
                    break;
                }
            }
            entry.timer = occupied
                ? entry.timer + dt
                : Math.max(0, entry.timer - dt * recoverRate);
            solid.crack = Math.min(1, entry.timer / entry.duration);
            if (entry.timer >= entry.duration) {
                solid.broken = true;
                solid.crack = 0;
                entry.respawnAt = now + respawn;
                fixture.SetSensor(true);
                fixture.Refilter();
            }
        }
    }
}
