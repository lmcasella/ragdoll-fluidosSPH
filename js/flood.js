import { LEVEL } from "./level.js";
import { FLUID } from "./weapons.js";
import { ORIGIN } from "./particleStore.js";

/** Paso (m) de integración del ancho libre. */
const SLICE = 0.05;
const GOLDEN = 0.6180339887498949;

/** Iteraciones de la bisección de `levelOfArea`. */
const BISECTION_STEPS = 40;

/** Nivel objetivo del agua (m) según el tiempo de ronda: la curva de diseño. */
export function floodLevel(roundTime, level = LEVEL) {
    const { start, riseSpeed, maxLevel } = level.flood;
    if (roundTime <= start) return level.pool.surface;
    return Math.min(maxLevel, level.pool.surface + riseSpeed * (roundTime - start));
}

const tables = new WeakMap();

/**
 * Ancho libre (m) a cada franja de 0,05 m desde `pool.surface`, descontando solo los sólidos `floor` (los que el
 * campo usa como lecho; las plataformas no desplazan agua en el campo), y área acumulada. Se calcula una vez por
 * nivel de datos.
 */
function freeWidths(level) {
    let table = tables.get(level);
    if (table) return table;
    const { minX, maxX, maxY } = level.bounds;
    const base = level.pool.surface;
    const count = Math.ceil((maxY - base) / SLICE);
    const widths = new Float64Array(count);
    const cumulative = new Float64Array(count + 1);
    const spans = [];
    for (let k = 0; k < count; k++) {
        const y = base + (k + 0.5) * SLICE;
        spans.length = 0;
        for (const s of level.solids) {
            if (s.kind === "floor" && y > s.y - s.h / 2 && y < s.y + s.h / 2) {
                spans.push([Math.max(minX, s.x - s.w / 2), Math.min(maxX, s.x + s.w / 2)]);
            }
        }
        spans.sort((a, b) => a[0] - b[0]);
        let covered = 0;
        let reach = minX;
        for (const [a, b] of spans) {
            if (b <= reach) continue;
            covered += b - Math.max(a, reach);
            reach = b;
        }
        widths[k] = maxX - minX - covered;
        cumulative[k + 1] = cumulative[k] + widths[k] * SLICE;
    }
    table = { widths, cumulative, count, base };
    tables.set(level, table);
    return table;
}

/** Área libre (m²) entre `pool.surface` y `height`. */
export function waterArea(height, level = LEVEL) {
    const { widths, cumulative, count, base } = freeWidths(level);
    const rel = Math.max(0, height - base) / SLICE;
    const k = Math.min(count - 1, Math.floor(rel));
    return cumulative[k] + widths[k] * (rel - k) * SLICE;
}

/** Ancho libre `W_libre` (m) a la altura `height`. */
export function freeWidth(height, level = LEVEL) {
    const { widths, count, base } = freeWidths(level);
    const k = Math.min(count - 1, Math.floor(Math.max(0, height - base) / SLICE));
    return widths[k];
}

/** Nivel (m) que encierra `area` (m²) sobre `pool.surface`: la inversa de `waterArea`, por bisección. */
export function levelOfArea(area, level = LEVEL) {
    let lo = level.pool.surface;
    let hi = level.bounds.maxY;
    if (area <= 0) return lo;
    for (let k = 0; k < BISECTION_STEPS; k++) {
        const mid = (lo + hi) / 2;
        if (waterArea(mid, level) < area) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

/** x de la gota número i: secuencia áurea, reparto parejo y determinista. */
export function rainX(i, flood = LEVEL.flood) {
    const frac = (i * GOLDEN) % 1;
    return flood.emitX1 + frac * (flood.emitX2 - flood.emitX1);
}

/**
 * Inundación (muerte súbita) como fuente de lluvia por caudal (docs/design/14-agua.md §14.7). No impone el nivel:
 * emite gotas en el sistema de disparos con `store.create` (`origin` RAIN) al caudal de la curva de diseño,
 * `Q = riseSpeed · W_libre(nivel(t))` en m²/s, o `Q / A_p` gotas por segundo con crédito acumulado, tope
 * `maxRate`. Las gotas caen como partículas y `Immersion` las absorbe en el campo. El nivel resulta de la
 * conservación de la masa. Se corta cuando la curva está en `maxLevel` y el nivel medio del campo
 * (`meanLevel`) también. Antes de `start` no llueve. Una vez por paso fijo, antes de `stepWorld`.
 *
 * `meanLevel` es el nivel `η` medio: el que ocuparía todo el volumen de agua agregado desde el arranque (el del
 * campo más el de las gotas de lluvia que todavía están como partículas, en vuelo o retenidas en plataformas) si se
 * repartiera parejo sobre el ancho libre (`levelOfArea`). Contar las gotas en vuelo evita que el corte en
 * `maxLevel` las sume de más.
 */
export class Flood {
    constructor(store, water, level = LEVEL) {
        this.store = store;
        this.water = water;
        this.data = level;
        this.config = level.flood;
        this.dropArea = (1.5 * store.system.GetRadius()) ** 2;
        this.def = new Box2D.b2ParticleDef();
        this.position = new Box2D.b2Vec2(0, this.config.emitY);
        this.velocity = new Box2D.b2Vec2(0, -this.config.dropSpeed);
        this.color = new Box2D.b2ParticleColor(40, 120, 255, 255);
        this.def.set_velocity(this.velocity);
        this.def.set_color(this.color);
        this.props = { kind: FLUID.WATER, origin: ORIGIN.RAIN };
        this.baseVolume = water.volume();
        this.roundTime = 0;
        this.emitted = 0;
        this.credit = 0;
        this.rate = 0;
    }

    get active() {
        return this.roundTime >= this.config.start;
    }

    /** Nivel de la curva de diseño (m); -Infinity antes de que empiece la inundación. */
    get level() {
        return this.active ? floodLevel(this.roundTime, this.data) : -Infinity;
    }

    /** Nivel `η` medio (m): campo más gotas de lluvia vivas. */
    get meanLevel() {
        return levelOfArea(this.water.volume() + this.rainVolume() - this.baseVolume, this.data);
    }

    /** Volumen (m²) de las gotas de lluvia que siguen como partículas. */
    rainVolume() {
        const { alive, origin } = this.store;
        let count = 0;
        for (let slot = 0; slot < alive.length; slot++) if (alive[slot] === 1 && origin[slot] === ORIGIN.RAIN) count++;
        return count * this.dropArea;
    }

    /** Emite las gotas de este paso. `rate` queda en las gotas por segundo. */
    step(roundTime, dt) {
        this.roundTime = roundTime;
        this.rate = 0;
        if (!this.active) return;
        const cfg = this.config;
        const target = floodLevel(roundTime, this.data);
        if (target >= cfg.maxLevel && this.meanLevel >= cfg.maxLevel) {
            this.credit = 0;
            return;
        }
        this.rate = Math.min(cfg.maxRate, (cfg.riseSpeed * freeWidth(target, this.data)) / this.dropArea);
        this.credit += this.rate * dt;
        const wanted = Math.floor(this.credit);
        let made = 0;
        while (made < wanted && this.emit()) made++;
        this.credit = made < wanted ? 0 : this.credit - made;
    }

    /** Crea una gota en el techo; devuelve `false` si el sistema no tiene lugar. */
    emit() {
        this.position.set_x(rainX(this.emitted, this.config));
        this.def.set_position(this.position);
        if (this.store.create(this.def, this.props) < 0) return false;
        this.emitted++;
        return true;
    }

    /** Deja el agua como al empezar: el campo vuelve al estado asentado y se reinicia la fuente. Las gotas las destruye `store.reset()`. */
    reset() {
        this.water.reset();
        this.baseVolume = this.water.volume();
        this.roundTime = 0;
        this.emitted = 0;
        this.credit = 0;
        this.rate = 0;
    }

    dispose() {
        Box2D.destroy(this.def);
        Box2D.destroy(this.position);
        Box2D.destroy(this.velocity);
        Box2D.destroy(this.color);
    }
}
