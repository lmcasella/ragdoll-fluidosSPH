import { LEVEL } from "./level.js";
import { FLUID, weaponById, particleFlags } from "./weapons.js";
import { ORIGIN } from "./particleStore.js";
import { SIGMA_W } from "./materials.js";
import { seededRandom } from "./bot.js";
import { CLIMB, halfWidth, stageOf } from "./climb.js";

/** Paso (m) de integración del ancho libre. */
const SLICE = 0.05;

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

/**
 * Inundación (muerte súbita) como fuente de lluvia por caudal (docs/design/14-agua.md §14.7). No impone el nivel:
 * el caudal de la curva de diseño, `Q = riseSpeed · W_libre(nivel(t))` en m²/s, entra de dos maneras. Una fracción
 * `particleShare` (con ráfagas de `gustMin` a `gustMax` veces su media en ciclos de `gustPeriod` s) sale como gotas
 * del sistema de disparos con `store.create` (`origin` RAIN), con las flags y el color del agua de `WEAPONS`
 * (una sola agua, #219): `Q_gotas / A_p` gotas por segundo con crédito acumulado, tope `maxRate`. El resto entra
 * directo al campo con `water.deposit`, repartido parejo a lo ancho del emisor donde hay lecho bajo la curva, y se
 * suma a `water.stats.sourced` (libro de masa). Cada gota nace a `x` al azar, a una altura repartida en
 * `spawnBand` m bajo `emitY`, con velocidad vertical `dropSpeed` ± `dropSpeedSpread` y velocidad horizontal de
 * viento `windMax · sin(2π t / windPeriod)` m/s. Las gotas caen como partículas y `Immersion` las absorbe en el
 * campo. El nivel resulta de la conservación de la masa. Se corta cuando la curva está en `maxLevel` y el nivel
 * medio del campo (`meanLevel`) también. Antes de `start` no llueve. Una vez por paso fijo, antes de `stepWorld`.
 * El azar sale de `seededRandom(seed)`: sin `seed` es nueva en cada ronda.
 *
 * `meanLevel` es el nivel `η` medio: el que ocuparía todo el volumen de agua agregado desde el arranque (el del
 * campo más el de las gotas de lluvia que todavía están como partículas, en vuelo o retenidas en plataformas) si se
 * repartiera parejo sobre el ancho libre (`levelOfArea`). Contar las gotas en vuelo evita que el corte en
 * `maxLevel` las sume de más.
 */
export class Flood {
    constructor(store, water, level = LEVEL, seed = null) {
        this.store = store;
        this.water = water;
        this.data = level;
        this.config = level.flood;
        this.fixedSeed = seed;
        this.dropArea = (1.5 * store.system.GetRadius()) ** 2;
        const rain = weaponById(FLUID.WATER);
        this.def = new Box2D.b2ParticleDef();
        this.position = new Box2D.b2Vec2(0, this.config.emitY);
        this.velocity = new Box2D.b2Vec2(0, -this.config.dropSpeed);
        this.color = new Box2D.b2ParticleColor(...rain.color, 255);
        this.def.set_flags(particleFlags(rain));
        this.def.set_velocity(this.velocity);
        this.def.set_color(this.color);
        this.props = { kind: FLUID.WATER, origin: ORIGIN.RAIN };
        this.baseVolume = water.volume();
        this.roundTime = 0;
        this.emitted = 0;
        this.credit = 0;
        this.rate = 0;
        this.reseed();
    }

    /** Reinicia el azar de la ronda: con semilla fija repite la lluvia; sin ella es nueva. */
    reseed() {
        this.random = seededRandom(this.fixedSeed ?? (Math.random() * 2 ** 32) >>> 0);
        this.windPhase = 2 * Math.PI * this.random();
        this.gustPhase = 2 * Math.PI * this.random();
    }

    /** Velocidad horizontal del viento (m/s) en el tiempo de ronda `t`. */
    wind(t) {
        const { windMax, windPeriod } = this.config;
        return windMax * Math.sin((2 * Math.PI * t) / windPeriod + this.windPhase);
    }

    /** Factor de ráfaga en `t`: de `gustMin` a `gustMax`, con media 1. */
    gust(t) {
        const { gustMin, gustMax, gustPeriod } = this.config;
        return (gustMax + gustMin) / 2 + ((gustMax - gustMin) / 2) * Math.sin((2 * Math.PI * t) / gustPeriod + this.gustPhase);
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
        const flow = cfg.riseSpeed * freeWidth(target, this.data);
        this.rate = Math.min(cfg.maxRate, (cfg.particleShare * this.gust(roundTime) * flow) / this.dropArea);
        this.credit += this.rate * dt;
        const wanted = Math.floor(this.credit);
        let made = 0;
        while (made < wanted && this.emit(roundTime)) made++;
        this.credit = made < wanted ? 0 : this.credit - made;
        this.pour(flow * dt - this.rate * dt * this.dropArea, target);
    }

    /**
     * Entra directo al campo `area` (m²) repartida parejo en las columnas del emisor ya mojadas (`h > hDry`) con lecho bajo `level`, a
     * temperatura ambiente y sin cantidad de movimiento, y la suma a `water.stats.sourced`.
     */
    pour(area, level) {
        const { water, config } = this;
        const hDry = water.config.hDry;
        let columns = 0;
        for (let i = water.i0; i < water.i1; i++) {
            const x = water.center(i);
            if (water.h[i] > hDry && water.b[i] < level && x >= config.emitX1 && x <= config.emitX2) columns++;
        }
        if (columns === 0 || area <= 0) return;
        const part = area / columns;
        const energy = SIGMA_W * water.cWater * part * water.config.ambientT;
        for (let i = water.i0; i < water.i1; i++) {
            const x = water.center(i);
            if (water.h[i] > hDry && water.b[i] < level && x >= config.emitX1 && x <= config.emitX2) water.deposit(x, part, 0, energy, 0);
        }
        water.stats.sourced += area;
    }

    /** Crea una gota en la franja de nacimiento; devuelve `false` si el sistema no tiene lugar. */
    emit(roundTime) {
        const cfg = this.config;
        this.position.set_x(cfg.emitX1 + this.random() * (cfg.emitX2 - cfg.emitX1));
        this.position.set_y(cfg.emitY - this.random() * cfg.spawnBand);
        this.velocity.set_x(this.wind(roundTime));
        this.velocity.set_y(-cfg.dropSpeed * (1 + cfg.dropSpeedSpread * (2 * this.random() - 1)));
        this.def.set_position(this.position);
        this.def.set_velocity(this.velocity);
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
        this.reseed();
    }

    dispose() {
        Box2D.destroy(this.def);
        Box2D.destroy(this.position);
        Box2D.destroy(this.velocity);
        Box2D.destroy(this.color);
    }
}

/**
 * Inundación del ascenso infinito (docs/design/16-ascenso.md §16.5): el agua sube sin techo, solo en el campo de alturas
 * (JS puro, no crea partículas ni llueve). La curva `η*` (mundo) vale `flood.surface` hasta `flood.start` y después sube
 * `v = speed + perStage · etapa + alcance` m/s, con la etapa de la altura local `η* − offsetY()` (el mapa baja) y
 * `alcance = min(catchUp.max, catchUp.rate · max(0, d − catchUp.gap))`, con `d` la distancia de `η*` al punto más bajo del
 * robot vivo más bajo (`lowestPlayer()`, mismas coordenadas del mundo; `-Infinity` sin robots vivos: alcance 0). Una vez por paso fijo y antes de `stepWorld`, `step` angosta el span del campo
 * al ancho de la etapa, sube el fondo efectivo (`floor`, a `depth` m bajo `η*`) y suma `v · dt` a las columnas bajo `η*`.
 * Misma interfaz que `Flood`: `active`, `level`, `config.start`, `step`, `reset` y `dispose`.
 */
export class RisingFlood {
    constructor(water, level = LEVEL, climb = CLIMB, offsetY = () => 0, lowestPlayer = () => -Infinity) {
        this.water = water;
        this.data = level;
        this.climb = climb;
        this.config = climb.flood;
        this.offsetY = offsetY;
        this.lowestPlayer = lowestPlayer;
        this.eta = climb.flood.surface;
        this.roundTime = 0;
        this.speed = 0;
    }

    get active() {
        return this.roundTime >= this.config.start;
    }

    /** Nivel de la curva (m); -Infinity antes de que empiece la inundación. */
    get level() {
        return this.active ? this.eta : -Infinity;
    }

    /** Fondo efectivo del campo (m): `max(0, η* − depth)`. */
    get floor() {
        return Math.max(0, this.eta - this.config.depth);
    }

    /** Velocidad de subida (m/s) a la altura actual: la de la etapa más el alcance (0 sin robots vivos o a menos de `gap`). */
    get riseSpeed() {
        const { catchUp } = this.config;
        const distance = this.lowestPlayer() - this.eta;
        const reach = distance > catchUp.gap ? Math.min(catchUp.max, catchUp.rate * (distance - catchUp.gap)) : 0;
        return this.config.speed + this.config.perStage * stageOf(this.eta - this.offsetY(), this.climb) + reach;
    }

    /** Avanza la curva y el campo un paso fijo `dt`. */
    step(roundTime, dt) {
        this.roundTime = roundTime;
        const dh = this.active ? this.riseSpeed * dt : 0;
        this.eta += dh;
        const half = halfWidth(stageOf(this.eta - this.offsetY(), this.climb), this.climb);
        this.water.setSpan(this.climb.centerX - half, this.climb.centerX + half);
        this.water.raiseFloor(this.floor);
        if (dh > 0) this.water.rise(dh, this.eta);
    }

    /** Deja el agua como al empezar. */
    reset() {
        this.water.reset();
        this.eta = this.config.surface;
        this.roundTime = 0;
    }

    dispose() {}
}
