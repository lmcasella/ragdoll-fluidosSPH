import { LEVEL } from "./level.js";
import { BOT, seededRandom } from "./bot.js";
import { FLUID, SHOT_SYSTEM } from "./weapons.js";

/**
 * Valores del ascenso infinito (docs/design/16-ascenso.md §16.2). Distancias en m, tiempos en s.
 * - `centerX`: eje de simetría; `stageHeight`: alto de una etapa; `width`: ancho entre paredes, `first` en la etapa 0 y
 *   `W(n) = max(min, base − perStage · n)` desde la 1;
 *   `wallOuter`: cuánto se extienden las paredes más allá de los límites del nivel; `baseMaxTop`: tope máximo (m) de las
 *   plataformas del clásico que entran en la etapa 0 (las más altas no se alcanzan desde otra);
 * - `rows`: generador de filas (`gap` entre topes, `count` de plataformas por fila, `width` de cada una, `thickness`,
 *   `separation` mínima entre plataformas de una fila, `overlap` horizontal mínimo de cada plataforma con alguna de la
 *   fila de abajo, `fairness` (diferencia máxima relativa del ancho total de plataformas a cada lado del eje), `tries`
 *   sorteos antes de la fila de respaldo, `transition`: una fila a menos de esto bajo un cambio de etapa ya usa el
 *   ancho de la etapa de arriba);
 * - `reach`: regla de alcance del bot, la misma que usa `buildNav`; `pickupLift`: altura del ícono sobre el tope;
 * - `pickups`: entrada `min(n − 1, 2)` para la etapa `n ≥ 1`, con cada `period` de filas y los `weights` por nombre de `FLUID`;
 * - `repair`: prevista para #156, con `item: null` se ignora;
 * - `flood`: `start` (s), `speed` base (m/s), `perStage` (m/s por etapa), `depth` del fondo efectivo y `sinkBelow` (m bajo el
 *   nivel desde donde se libera lo hundido);
 * - `ahead`: cuánto por encima de la cámara se genera; `spawnRayTop`: inicio del rayo de aparición; `seamMargin`: distancia
 *   mínima a una costura de la grilla de LiquidFun.
 */
export const CLIMB = {
    centerX: 28,
    stageHeight: 15,
    width: { first: 56, base: 40, perStage: 4, min: 24 },
    wallOuter: 20,
    baseMaxTop: 8,
    rows: { gap: [2.5, 3.2], count: [2, 4], width: [3, 6], thickness: 0.4, separation: 1.5, overlap: 1.5, fairness: 0.2, tries: 50, transition: 3.5 },
    reach: BOT.reach,
    pickupLift: 0.6,
    pickups: [
        { period: 3, weights: { WATER: 0.4, HONEY: 0.4, LAVA: 0.2 } },
        { period: 2, weights: { LAVA: 1 } },
        { period: 1, weights: { ACID: 0.5, LAVA: 0.5 } },
    ],
    repair: { perStage: 1, item: null },
    flood: { start: 5, speed: 0.4, perStage: 0.06, depth: 6, sinkBelow: 5 },
    ahead: 30,
    spawnRayTop: 9,
    seamMargin: 0.2,
};

/** Celdas de la grilla de LiquidFun a cada lado de una costura: `computeTag` guarda `y / diámetro` en 12 bits con un corrimiento de 2048. */
const SEAM_CELLS = 2048;
const SEAM_PERIOD_CELLS = 4096;

/** Tolerancia numérica (m) de las comparaciones de geometría. */
const EPS = 1e-9;

/** Número de etapa de la altura `y` (m); la etapa `n` ocupa `y` ∈ [30n, 30n + 30). */
export function stageOf(y, config = CLIMB) {
    return Math.max(0, Math.floor(y / config.stageHeight));
}

/** Media distancia (m) entre el eje y las paredes de la etapa `n`. */
export function halfWidth(n, config = CLIMB) {
    const { first, base, perStage, min } = config.width;
    return (n === 0 ? first : Math.max(min, base - perStage * n)) / 2;
}

/**
 * Alturas (m) de las costuras de la grilla de LiquidFun en `[from, to]` para partículas de radio `radius`: ahí se pierden
 * los contactos de las fixtures cuya caja las cruza (docs/design/16-ascenso.md §16.7). Usa el radio float32 del sistema.
 */
export function seamHeights(radius, from, to) {
    const diameter = 2 * Math.fround(radius);
    const seams = [];
    for (let k = Math.max(0, Math.floor((from / diameter - SEAM_CELLS) / SEAM_PERIOD_CELLS)); ; k++) {
        const y = diameter * (SEAM_CELLS + SEAM_PERIOD_CELLS * k);
        if (y > to) break;
        if (y >= from) seams.push(y);
    }
    return seams;
}

/** Sólidos del clásico que entran en la etapa 0: sin paredes y solo las plataformas con tope ≤ `baseMaxTop`. */
export function baseSolids(base = LEVEL, config = CLIMB) {
    return base.solids.filter((s) => s.kind !== "wall" && (s.kind !== "platform" || s.y + s.h / 2 <= config.baseMaxTop + EPS));
}

/**
 * Regla de alcance de un salto de `a` a `b` (nodos con `minX`, `maxX` y `top`), la misma de `buildNav` al subir: vale con
 * `dy ≤ up.dy` y hueco `≤ up.gap`, o con `dy ≤ short.dy` y hueco `≤ short.gap`.
 */
export function reachable(a, b, reach = CLIMB.reach) {
    const gap = Math.max(0, b.minX - a.maxX, a.minX - b.maxX);
    const dy = b.top - a.top;
    const { up, short } = reach;
    return (dy <= up.dy && gap <= up.gap) || (dy <= short.dy && gap <= short.gap);
}

/**
 * Rectángulos `kind: "wall"` de la etapa `n`: izquierda x ∈ [−20, 28 − half(n)], derecha x ∈ [28 + half(n), 76], partidos
 * en cada costura de LiquidFun para que ninguno la cruce.
 */
export function stageWalls(n, config = CLIMB, base = LEVEL, radius = SHOT_SYSTEM.radius) {
    const half = halfWidth(n, config);
    const y0 = n * config.stageHeight;
    const y1 = y0 + config.stageHeight;
    const cuts = [y0, ...seamHeights(radius, y0, y1).filter((y) => y > y0 + EPS && y < y1 - EPS), y1];
    const minX = base.bounds.minX - config.wallOuter;
    const maxX = base.bounds.maxX + config.wallOuter;
    const sides = [
        [minX, config.centerX - half],
        [config.centerX + half, maxX],
    ];
    const walls = [];
    for (const [xa, xb] of sides) {
        for (let i = 0; i + 1 < cuts.length; i++) {
            walls.push({ x: (xa + xb) / 2, y: (cuts[i] + cuts[i + 1]) / 2, w: xb - xa, h: cuts[i + 1] - cuts[i], kind: "wall" });
        }
    }
    return walls;
}

/**
 * Generador determinista de filas de plataformas (docs/design/16-ascenso.md §16.3). JS puro, sin `Box2D`. Una sola
 * secuencia de `seededRandom(seed)` consumida fila por fila en orden de altura: el mapa no depende de cuándo se genera
 * cada fila. `next()` devuelve `{ index, y, stage, platforms: [{ x, w }], pickups: [{ x, y, weapon }] }`; `y` es el tope
 * de todas las plataformas de la fila.
 */
export class ClimbGenerator {
    constructor(seed, config = CLIMB, base = LEVEL, radius = SHOT_SYSTEM.radius) {
        this.config = config;
        this.radius = radius;
        this.random = seededRandom(seed);
        this.index = 0;
        this.rowsInStage = new Map();
        const platforms = baseSolids(base, config).filter((s) => s.kind === "platform");
        const top = Math.max(...platforms.map((s) => s.y + s.h / 2));
        this.previous = {
            y: top,
            platforms: platforms.map((s) => ({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, top: s.y + s.h / 2 })),
            list: [-2.25, 2.25].map((dx) => ({ x: config.centerX + dx, w: config.rows.width[0] })),
        };
    }

    uniform([lo, hi]) {
        return lo + this.random() * (hi - lo);
    }

    /** Baja `y` hasta que la plataforma (de `y − thickness` a `y`) quede entera bajo la costura de LiquidFun más cercana. */
    avoidSeam(y) {
        const { thickness } = this.config.rows;
        const margin = this.config.seamMargin;
        for (const seam of seamHeights(this.radius, y - thickness - margin, y + margin)) {
            if (y > seam - margin && y - thickness < seam + margin) return seam - margin;
        }
        return y;
    }

    /**
     * Sortea una fila de ancho `half` a la altura `y`: de 2 a 4 plataformas de ancho sorteado, cada una en una x al azar que
     * solapa `rows.overlap` con alguna de la fila anterior y deja `rows.separation` con las demás. `null` si alguna no entra.
     */
    draw(half, y) {
        const { rows, centerX, reach } = this.config;
        const count = rows.count[0] + Math.floor(this.random() * (rows.count[1] - rows.count[0] + 1));
        const below = this.previous.platforms.filter((p) => y - p.top <= reach.up.dy + EPS);
        if (below.length === 0) return null;
        const list = [];
        for (let i = 0; i < count; i++) {
            let placed = false;
            for (let t = 0; t < rows.tries && !placed; t++) {
                const w = this.uniform(rows.width);
                const p = below[Math.floor(this.random() * below.length)];
                const lo = Math.max(p.minX + rows.overlap - w / 2, centerX - half + w / 2);
                const hi = Math.min(p.maxX - rows.overlap + w / 2, centerX + half - w / 2);
                if (lo > hi) continue;
                const x = lo + this.random() * (hi - lo);
                if (list.every((q) => Math.abs(q.x - x) - (q.w + w) / 2 >= rows.separation - EPS)) {
                    list.push({ x, w });
                    placed = true;
                }
            }
            if (!placed) return null;
        }
        return list;
    }

    /** Verdadero si cada plataforma solapa lo exigido con alguna de la fila anterior (desnivel ≤ `reach.up.dy`). */
    supported(list, y) {
        const { rows, reach } = this.config;
        return list.every((p) =>
            this.previous.platforms.some((q) => y - q.top <= reach.up.dy + EPS && Math.min(q.maxX, p.x + p.w / 2) - Math.max(q.minX, p.x - p.w / 2) >= rows.overlap - EPS),
        );
    }

    /** Ancho total de plataformas a la izquierda y a la derecha de `centerX`; una que cruza el centro cuenta por partes. */
    sides(list) {
        const { centerX } = this.config;
        let left = 0;
        let right = 0;
        for (const p of list) {
            left += Math.max(0, Math.min(centerX, p.x + p.w / 2) - (p.x - p.w / 2));
            right += Math.max(0, p.x + p.w / 2 - Math.max(centerX, p.x - p.w / 2));
        }
        return { left, right };
    }

    /** Verdadero si la fila respeta las paredes, la separación, el solapamiento con la fila anterior y la justicia entre lados. */
    valid(list, y, half) {
        const { centerX, rows } = this.config;
        if (list.some((p) => Math.abs(p.x - centerX) + p.w / 2 > half + EPS)) return false;
        const sorted = [...list].sort((a, b) => a.x - b.x);
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].x - sorted[i].w / 2 - (sorted[i - 1].x + sorted[i - 1].w / 2) < rows.separation - EPS) return false;
        }
        if (!this.supported(list, y)) return false;
        const { left, right } = this.sides(list);
        return Math.abs(left - right) <= rows.fairness * Math.max(left, right) + EPS;
    }

    /** Fila de respaldo: la anterior recortada al ancho de la etapa; solapa por completo con ella. */
    fallback(half) {
        const { centerX, rows } = this.config;
        const list = [];
        for (const p of this.previous.list) {
            const lo = Math.max(p.x - p.w / 2, centerX - half);
            const hi = Math.min(p.x + p.w / 2, centerX + half);
            if (hi - lo >= rows.width[0] - EPS) list.push({ x: (lo + hi) / 2, w: hi - lo });
        }
        return list;
    }

    /** Par de armas de la fila: sobre las plataformas más a la izquierda y a la derecha, con una sola arma sorteada por `weights`. */
    pickupsOf(list, y, stage) {
        if (stage < 1) return [];
        const entry = this.config.pickups[Math.min(stage - 1, this.config.pickups.length - 1)];
        const inStage = this.rowsInStage.get(stage) ?? 0;
        if (inStage % entry.period !== 0) return [];
        const sorted = [...list].sort((a, b) => a.x - b.x);
        const entries = Object.entries(entry.weights);
        let roll = this.random() * entries.reduce((sum, [, w]) => sum + w, 0);
        let weapon = FLUID[entries[entries.length - 1][0]];
        for (const [name, weight] of entries) {
            roll -= weight;
            if (roll < 0) {
                weapon = FLUID[name];
                break;
            }
        }
        const { pickupLift } = this.config;
        return [sorted[0], sorted[sorted.length - 1]].map((p) => ({ x: p.x, y: y + pickupLift, weapon }));
    }
    /** Genera la fila siguiente. */
    next() {
        const { rows } = this.config;
        const y = this.avoidSeam(this.previous.y + this.uniform(rows.gap));
        const half = halfWidth(stageOf(y + rows.transition, this.config), this.config);
        let list = null;
        for (let t = 0; t < rows.tries && list === null; t++) {
            const candidate = this.draw(half, y);
            if (candidate !== null && this.valid(candidate, y, half)) list = candidate;
        }
        if (list === null) list = this.fallback(half);
        const stage = stageOf(y, this.config);
        const pickups = this.pickupsOf(list, y, stage);
        this.rowsInStage.set(stage, (this.rowsInStage.get(stage) ?? 0) + 1);
        this.previous = {
            y,
            platforms: list.map((p) => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, top: y })),
            list,
        };
        return { index: this.index++, y, stage, platforms: list, pickups };
    }
}

/**
 * Mundo del ascenso infinito (docs/design/16-ascenso.md §16.6): crea la etapa 0 (los pisos, islas y plataformas bajas del
 * nivel clásico, sin sus paredes ni el sensor de la pileta), las paredes de cada etapa y las filas de `ClimbGenerator`
 * conforme sube la cámara, y libera lo que el agua dejó hundido. Cada elemento es un cuerpo estático con una fixture
 * de caja (fricción 0,8); las plataformas se registran en `OneWayPlatforms` y las armas en `Pickups`. El `b2BodyDef`, el
 * `b2PolygonShape` y los `b2Vec2` de trabajo se crean una vez y se liberan en `dispose`.
 *
 * `update` y `reset` se llaman solo desde el loop, después de los pasos del frame, nunca dentro de `stepWorld` ni de un
 * callback. Después de destruir, quien llama invalida `wallContact` y rehace el grafo del bot con `level`.
 */
export class Climb {
    constructor({ world, platforms, pickups, config = CLIMB, base = LEVEL, radius = SHOT_SYSTEM.radius }) {
        this.world = world;
        this.platforms = platforms;
        this.pickups = pickups;
        this.config = config;
        this.base = base;
        this.radius = radius;
        this.bodyDef = new Box2D.b2BodyDef();
        this.shape = new Box2D.b2PolygonShape();
        this.origin = new Box2D.b2Vec2(0, 0);
        this.position = new Box2D.b2Vec2(0, 0);
        this.data = { solids: [], pool: base.pool };
        this.items = [];
        /** Puntos de aparición de armas vivos (los de `Pickups` que creó `Climb`). */
        this.points = [];
        this.generator = null;
        this.lastY = base.bounds.maxY;
        this.stagesBuilt = -1;
    }

    /** Sólidos vivos como datos (`{ solids, pool }`), para dibujar y para `buildNav`. */
    get level() {
        return this.data;
    }

    /** Límites de la cámara a la altura `y`: el ancho de la etapa y sin techo. */
    cameraBounds(y) {
        const half = halfWidth(stageOf(y, this.config), this.config);
        return { minX: this.config.centerX - half, maxX: this.config.centerX + half, minY: 0, maxY: Infinity };
    }

    /** Destruye todo, crea la etapa 0 con `seed` y genera hasta y = 60 m. */
    reset(seed) {
        this.clear();
        this.generator = new ClimbGenerator(seed, this.config, this.base, this.radius);
        this.stagesBuilt = -1;
        const low = baseSolids(this.base, this.config);
        this.lastY = Math.max(...low.filter((s) => s.kind === "platform").map((s) => s.y + s.h / 2));
        for (const s of low) this.addBox(s.x, s.y, s.w, s.h, s.kind, !!s.oneWay);
        for (const p of this.base.pickups) {
            if (p.y - this.config.pickupLift <= this.config.baseMaxTop + EPS) this.points.push(this.pickups.add(p));
        }
        this.generate(60);
    }

    /**
     * Genera hasta `top + ahead` y libera todo elemento cuyo tope quedó por debajo de `level − sinkBelow`.
     * Devuelve las cantidades `{ created, destroyed }`.
     */
    update({ top, level }) {
        const created = this.generate(top + this.config.ahead);
        const limit = level - this.config.flood.sinkBelow;
        let destroyed = 0;
        const sunkItems = this.items.filter((item) => item.top < limit);
        for (const item of sunkItems) this.destroyItem(item);
        if (sunkItems.length) {
            this.items = this.items.filter((item) => item.top >= limit);
            this.data.solids = this.data.solids.filter((solid) => solid.y + solid.h / 2 >= limit);
            destroyed += sunkItems.length;
        }
        const sunkPoints = this.points.filter((point) => point.y < limit);
        for (const point of sunkPoints) this.pickups.remove(point);
        this.points = this.points.filter((point) => point.y >= limit);
        return { created, destroyed: destroyed + sunkPoints.length };
    }

    /** Crea filas y paredes hasta `limit` (m); devuelve cuántos cuerpos creó. */
    generate(limit) {
        const before = this.items.length + this.points.length;
        while (this.lastY < limit) {
            const row = this.generator.next();
            this.lastY = row.y;
            for (const p of row.platforms) this.addBox(p.x, row.y - this.config.rows.thickness / 2, p.w, this.config.rows.thickness, "platform", true);
            for (const p of row.pickups) this.points.push(this.pickups.add(p));
        }
        const needed = stageOf(Math.max(limit, this.lastY), this.config);
        while (this.stagesBuilt < needed) {
            this.stagesBuilt++;
            for (const w of stageWalls(this.stagesBuilt, this.config, this.base, this.radius)) this.addBox(w.x, w.y, w.w, w.h, "wall", false);
        }
        return this.items.length + this.points.length - before;
    }

    addBox(x, y, w, h, kind, oneWay) {
        this.position.set_x(x);
        this.position.set_y(y);
        this.bodyDef.set_position(this.position);
        this.shape.SetAsBox(w / 2, h / 2, this.origin, 0);
        const body = this.world.CreateBody(this.bodyDef);
        const fixture = body.CreateFixture(this.shape, 0);
        fixture.SetFriction(0.8);
        if (oneWay) this.platforms.addPlatform(fixture);
        const solid = oneWay ? { x, y, w, h, kind, oneWay } : { x, y, w, h, kind };
        this.items.push({ body, fixture, oneWay, top: y + h / 2 });
        this.data.solids.push(solid);
    }

    destroyItem(item) {
        if (item.oneWay) this.platforms.removePlatform(item.fixture);
        this.world.DestroyBody(item.body);
    }

    /** Destruye todos los elementos. */
    clear() {
        for (const point of this.points) this.pickups.remove(point);
        this.points = [];
        for (const item of this.items) this.destroyItem(item);
        this.items = [];
        this.data.solids = [];
    }

    dispose() {
        this.clear();
        Box2D.destroy(this.origin);
        Box2D.destroy(this.position);
        Box2D.destroy(this.shape);
        Box2D.destroy(this.bodyDef);
    }
}