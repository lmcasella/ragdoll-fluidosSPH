import { LEVEL } from "./level.js";
import { BOT, canReach } from "../ai/bot.js";
import { clamp, lerp } from "../core/math/scalar.js";
import { intersectIntervals, subtractIntervals } from "../core/math/geometry.js";
import { createSeededRandom } from "../core/math/random.js";
import { FLUID, refillTanks } from "../combat/weapons.js";

/**
 * Valores del ascenso infinito (docs/design/16-ascenso.md §16.2). Distancias en m, tiempos en s. Las alturas de la tabla y
 * del generador son locales: las del cuerpo cinemático del mapa, que baja.
 * - `centerX`: eje de las paredes; `stageHeight`: alto de una etapa; `width`: ancho entre paredes, `first` en la etapa 0 y
 *   `W(n) = max(min, base − perStage · n)` desde la 1; `wallOuter`: cuánto se extienden las paredes más allá de los límites
 *   del nivel; `wallBelow`: cuánto bajo y = 0 llegan las paredes de la etapa 0;
 * - `branches`: generador por filas: `thickness` de cada plataforma; `dy` [mín, máx] de la fila de respaldo;
 *`air` (m, de tope a tope) mínimo con otra que la cubra en x; `separation` horizontal mínima
 *   con otra a su altura (±`sameHeight`, el corrimiento máximo entre dos plataformas de una fila);
 *   `rows`: `spacing` [mín, máx] (m) entre una fila y la anterior, `counts` peso de cada cantidad de plataformas por fila
 *   (`first` en la etapa 0 y `last` desde la `width.stages`, lineal entre ellas; un peso 0 no se sortea), `shift` (m) de corrimiento vertical de cada plataforma a ± de la altura de su fila, `maxRun` filas seguidas con la misma
 *   cantidad como máximo, `singleWidth` `{ first, last }` [mín, máx] (m) de ancho de la plataforma de una fila de 1, interpolado por etapa como `width` (un descanso
 *   que deja apoyar dos en la fila siguiente) con el alcance de salto de `reach` (`canReach` de `src/ai/bot.js`) como regla de vecina;
 *   `tries` sorteos de fila; `transition`: una plataforma a menos de esto bajo un cambio de etapa ya
 *   usa el ancho de la etapa de arriba; `minWidth`; `tail`: con probabilidad `chance` el ancho se multiplica por `long` o
 *   por `short`; `window` (m) hacia abajo que se recuerda; `width`: rango de ancho en la etapa 0 y en la `stages`, lineal entre
 *   ellas; `base`: cantidad y tope de las plataformas anchas con que arranca la etapa 0;
 * - `spawn`: aparición de los jugadores sobre dos plataformas de la etapa 0: `distance` [mín, máx] horizontal entre ellos,
 *   `dy` máxima entre sus plataformas, `inset` (m) al borde, `tries` sorteos y `maxTop` (m): solo plataformas con tope hasta esa altura (la base);
 * - `scroll`: el cuerpo del mapa baja `base` m/s más `perStage` por etapa alcanzada por el jugador más alto;
 * - `reach`: regla de alcance del bot, la misma que usa `buildNav`; `pickupLift`: altura del ícono sobre el tope;
 * - `pickups`: armas por etapa, entrada `min(n − 1, 3)` para la etapa `n ≥ 1` (la etapa 0 no lleva armas), con una cada
 *   `period` plataformas de la etapa y los `weights` por nombre de `FLUID`;
 * - `repairPerStage`: ítems de reparación (#156) por etapa `n ≥ 1`, sobre la primera plataforma cuyo tope llega a la mitad
 *   de la etapa (fila central), que en ese caso no lleva arma;
 * - `breakable`: plataformas rompibles (#301) desde la etapa `fromStage`: la probabilidad en la etapa `n ≥ fromStage` es
 *   `min(max, chance + perStage · (n − fromStage))`, con `time` (s) de cuenta; una plataforma con arma o reparación nunca lo es;
 * - `flood`: `surface` (m) del agua al empezar, `start` (s), `speed` base (m/s), `perStage` (m/s por etapa), `depth` del
 *   fondo efectivo, `catchUp` (alcance: a la velocidad se suma `min(max, rate · max(0, d − gap))` m/s, con `d` la distancia
 *   en m de la superficie a la altura de apoyo del robot vivo más bajo, sin contar saltos; `gap` en m, `rate` en 1/s, `max` en m/s) y `sinkBelow` (m bajo el nivel desde donde se libera lo hundido);
 * - `ahead`: cuánto por encima de la cámara se genera;
 * - `loadout`: equipo inicial del mapa (el clásico usa `LOADOUT` de `src/combat/weapons.js`): sin arma ni tanques, solo melee;
 * - `stagePrize`: premio del primer robot que se apoya en una plataforma de la etapa `n ≥ 1`, una vez por etapa y por
 *   ronda: `banner` (s) que dura el cartel, `repair` (`"full"`: vida al máximo) y `refill` (todos sus tanques llenos).
 */
export const CLIMB = {
    centerX: 28,
    stageHeight: 15,
    width: { first: 56, base: 40, perStage: 4, min: 24 },
    wallOuter: 20,
    wallBelow: 20,
    branches: {
        thickness: 0.4,
        dy: [1.5, 3.3],
        air: 1.8,
        separation: 1,
        sameHeight: 0.8,
        rows: {
            spacing: [2.2, 3.2],
            counts: { first: { 1: 0.35, 2: 0.5, 3: 0.15, 4: 0 }, last: { 1: 0.1, 2: 0.25, 3: 0.35, 4: 0.3 } },
            shift: 0.4,
            maxRun: 2,
            singleWidth: { first: [10, 14], last: [4, 5.5] },
        },
        tries: 300,
        transition: 3.5,
        minWidth: 1.6,
        tail: { chance: 0.1, long: 1.5, short: 0.6 },
        window: 12,
        width: { first: [8, 14], last: [2, 4], stages: 5 },
        base: { count: [3, 5], top: [4, 7] },
    },
    spawn: { distance: [4, 10], dy: 3, inset: 0.8, tries: 400, maxTop: 7 },
    scroll: { base: 0.15, perStage: 0.02 },
    reach: BOT.reach,
    pickupLift: 0.6,
    pickups: [
        { period: 9, weights: { WATER: 1 } },
        { period: 9, weights: { WATER: 0.45, HONEY: 0.45, LAVA: 0.1 } },
        { period: 6, weights: { LAVA: 1 } },
        { period: 3, weights: { ACID: 0.5, LAVA: 0.5 } },
    ],
    repairPerStage: 1,
    flood: { surface: 2, start: 5, speed: 0.25, perStage: 0.04, catchUp: { gap: 6, rate: 0.5, max: 3 }, depth: 6, sinkBelow: 5 },
    ahead: 30,
    loadout: { weapon: null, weapons: [] },
    stagePrize: { banner: 1.5, repair: "full", refill: true },
    breakable: { fromStage: 2, chance: 0.2, perStage: 0.1, max: 0.9, time: 3 },
};


/** Holgura horizontal (m) y vertical (m) con que un robot cuenta como apoyado en una plataforma. */
const SUPPORT_SLACK = { x: 0.3, y: 0.35 };

/** Holgura (m) con que `span` aparta una plataforma de las prohibidas, para que el borde no quede en un solape por redondeo. */
const SPAN_PAD = 1e-6;

/** Número de etapa de la altura local `y` (m); la etapa `n` ocupa `y` ∈ [15n, 15n + 15). */
export function stageOf(y, config = CLIMB) {
    return Math.max(0, Math.floor(y / config.stageHeight));
}

/** Media distancia (m) entre el eje y las paredes de la etapa `n`. */
export function halfWidth(n, config = CLIMB) {
    const { first, base, perStage, min } = config.width;
    return (n === 0 ? first : Math.max(min, base - perStage * n)) / 2;
}

/**
 * Rectángulos `kind: "wall"` de la etapa `n`: izquierda x ∈ [−20, 28 − half(n)], derecha x ∈ [28 + half(n), 76]. Los de la
 * etapa 0 llegan `wallBelow` m bajo y = 0, porque el mapa baja.
 */
export function stageWalls(n, config = CLIMB, base = LEVEL) {
    const half = halfWidth(n, config);
    const y0 = n === 0 ? -config.wallBelow : n * config.stageHeight;
    const y1 = (n + 1) * config.stageHeight;
    const minX = base.bounds.minX - config.wallOuter;
    const maxX = base.bounds.maxX + config.wallOuter;
    return [
        [minX, config.centerX - half],
        [config.centerX + half, maxX],
    ].map(([xa, xb]) => ({ x: (xa + xb) / 2, y: (y0 + y1) / 2, w: xb - xa, h: y1 - y0, kind: "wall" }));
}

/**
 * Aparición de los dos jugadores: dos plataformas distintas de `platforms` (Climb pasa solo las de la etapa 0 de las que se puede seguir subiendo) (`{ x, w, y }`, `y` el tope), con una distancia
 * horizontal `spawn.distance` entre ellos y `|dy| ≤ spawn.dy`, cada uno en una x al azar de su tope a `spawn.inset` de los
 * bordes. Devuelve `[{ x, y, flipX }, { x, y, flipX }]` mirándose. Si ningún sorteo vale (con pocas plataformas), recorre todos los pares en pasos de 0,5 m, también los de una misma plataforma, y usa el que menos se aleja.
 */
export function pickSpawns(platforms, random, config = CLIMB) {
    const { distance, dy, inset, tries } = config.spawn;
    const along = (p) => {
        const room = Math.max(0, p.w / 2 - inset);
        return p.x + (random() * 2 - 1) * room;
    };
    const penalty = (xa, a, xb, b) => {
        const d = Math.abs(xa - xb);
        return Math.max(0, distance[0] - d) + Math.max(0, d - distance[1]) + Math.max(0, Math.abs(a.y - b.y) - dy);
    };
    let best = null;
    for (let t = 0; t < tries; t++) {
        const a = platforms[Math.floor(random() * platforms.length)];
        const b = platforms[Math.floor(random() * platforms.length)];
        if (a === b) continue;
        const xa = along(a);
        const xb = along(b);
        const cost = penalty(xa, a, xb, b);
        if (best === null || cost < best.cost) best = { cost, a, b, xa, xb };
        if (cost === 0) break;
    }
    if (best === null || best.cost > 0) {
        const step = 0.5;
        const spots = (p) => {
            const room = Math.max(0, p.w / 2 - inset);
            return Array.from({ length: Math.floor((2 * room) / step) + 1 }, (_, i) => p.x - room + i * step);
        };
        for (const a of platforms) {
            for (const b of platforms) {
                for (const xa of spots(a)) {
                    for (const xb of spots(b)) {
                        const cost = penalty(xa, a, xb, b);
                        if (best === null || cost < best.cost) best = { cost, a, b, xa, xb };
                    }
                }
            }
        }
    }
    const { a, b, xa, xb } = best;
    return [
        { x: xa, y: a.y, flipX: xb < xa },
        { x: xb, y: b.y, flipX: xa < xb },
    ];
}

/**
 * Generador determinista por filas (docs/design/16-ascenso.md §16.3). JS puro, sin `Box2D`. Una sola secuencia de
 * `createSeededRandom(seed)` consumida fila por fila: el mapa no depende de cuándo se genera cada una. Cada fila queda
 * `branches.rows.spacing` m sobre la anterior y lleva de 1 a 4 plataformas (pesos `rows.counts`, sin más de `rows.maxRun`
 * filas seguidas con la misma cantidad), cada una corrida en vertical a ±`rows.shift`. Cada plataforma puede caer en cualquier x entre paredes
 * y es alcanzable desde otra de la fila anterior o de su misma fila (`reach`, `canReach`), y su x se restringe por construcción para no pisar a otra,
 * dejar `air` de aire con las que la cubren en x, `separation` con las de su altura y quedar dentro de las paredes. Una fila
 * se vuelve a sortear si alguna plataforma de las generadas queda sin vecina más alta alcanzable (`reach`).
 * `base` son las plataformas anchas de la etapa 0 `{ x, w, y }` (`y` es el tope); `next()` devuelve la plataforma siguiente
 * de la fila en curso, de abajo hacia arriba, `{ index, row, x, w, y, stage, pickups: [{ x, y, weapon } | { x, y, kind: "repair" }] }`,
 * y `pending` cuenta las que faltan de esa fila. `fallbacks` cuenta las filas que no pudieron armarse.
 */
export class ClimbGenerator {
    constructor(seed, config = CLIMB) {
        this.config = config;
        this.random = createSeededRandom(seed);
        this.breakableRandom = createSeededRandom((seed ^ 0x517cc1b7) >>> 0);
        this.index = 0;
        this.fallbacks = 0;
        this.items = [];
        this.inStage = new Map();
        this.repairs = new Map();
        this.base = this.makeBase();
        this.front = Math.max(...this.base.map((p) => p.y));
        this.rowTop = this.front;
        this.rowIndex = 0;
        this.counts = [];
        this.queue = [];
        for (const p of this.base) this.items.push({ x: p.x, minX: p.x - p.w / 2, maxX: p.x + p.w / 2, top: p.y, above: false, generated: false });
    }

    /** Plataformas que faltan de la fila en curso. */
    get pending() {
        return this.queue.length;
    }

    uniform([lo, hi]) {
        return lo + this.random() * (hi - lo);
    }

    /** Valor de la etapa `stage` entre `first` (etapa 0) y `last` (desde `width.stages`), lineal; sirve para números, arreglos y tablas de pesos. */
    byStage(first, last, stage) {
        const { stages } = this.config.branches.width;
        const k = Math.min(stage, stages) / stages;
        const mix = (a, b) => {
            if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i]));
            if (typeof a === "object") return Object.fromEntries(Object.keys(a).map((n) => [n, mix(a[n], b[n])]));
            return lerp(a, b, k);
        };
        return mix(first, last);
    }

    /** Ancho de colocación (m) de las plataformas de la etapa `stage`: rango lineal entre `width.first` y `width.last`. */
    widthRange(stage) {
        const { first, last } = this.config.branches.width;
        return this.byStage(first, last, stage);
    }

    /** Plataformas anchas de la etapa 0, una por celda del ancho. */
    makeBase() {
        const { centerX, branches } = this.config;
        const { base, separation } = branches;
        const count = base.count[0] + Math.floor(this.random() * (base.count[1] - base.count[0] + 1));
        const half = halfWidth(0, this.config);
        const cell = (2 * half) / count;
        const list = [];
        for (let i = 0; i < count; i++) {
            const lo = centerX - half + i * cell + separation / 2;
            const w = Math.min(this.uniform(this.widthRange(0)), cell - separation);
            list.push({ x: this.uniform([lo + w / 2, lo + cell - separation - w / 2]), w, y: this.uniform(base.top) });
        }
        return list;
    }

    /** Ancho (m) de una plataforma de fila con tope `top`: `rows.singleWidth` si es de una sola, o el rango de la etapa con `tail`. */
    rowWidth(top, single) {
        const { tail, minWidth, transition, rows } = this.config.branches;
        const half = halfWidth(stageOf(top + transition, this.config), this.config);
        if (single) return Math.min(this.uniform(this.byStage(rows.singleWidth.first, rows.singleWidth.last, stageOf(top, this.config))), 2 * half);
        let w = this.uniform(this.widthRange(stageOf(top, this.config)));
        if (this.random() < tail.chance) w *= this.random() < 0.5 ? tail.long : tail.short;
        return clamp(w, minWidth, 2 * half);
    }

    /** Última salida cuando ninguna posición valió: sobre la plataforma más alta, con su mismo centro. */
    fallback() {
        const { dy } = this.config.branches;
        const highest = this.items.reduce((a, b) => (b.top > a.top ? b : a));
        this.fallbacks++;
        return { top: highest.top + (dy[0] + dy[1]) / 2, x: highest.x, w: Math.max(highest.maxX - highest.minX, this.config.branches.minWidth) };
    }
    /** Arma de la plataforma: una cada `period` plataformas de la etapa `stage ≥ 1`, sorteada por `weights`. */
    pickupsOf(x, top, stage) {
        if (stage < 1) return [];
        const entry = this.config.pickups[Math.min(stage - 1, this.config.pickups.length - 1)];
        const n = this.inStage.get(stage) ?? 0;
        this.inStage.set(stage, n + 1);
        if (n % entry.period !== 0) return [];
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
        return [{ x, y: top + this.config.pickupLift, weapon }];
    }

    /**
     * Ítems de reparación de la plataforma: hasta `repairPerStage` por etapa `stage ≥ 1`, desde la primera plataforma con
     * tope en la mitad superior de la etapa; esa plataforma no sortea arma, para no encimar los sensores.
     */
    repairsOf(x, top, stage) {
        const { stageHeight, repairPerStage, pickupLift } = this.config;
        if (stage < 1 || top < stage * stageHeight + stageHeight / 2) return [];
        const given = this.repairs.get(stage) ?? 0;
        if (given >= repairPerStage) return [];
        this.repairs.set(stage, given + 1);
        return [{ x, y: top + pickupLift, kind: "repair" }];
    }

    /**
     * Cantidad de plataformas de la fila de altura base `base`: sorteo por los `rows.counts` de su etapa (un peso 0 no sale),
     * sin una cantidad que ya llevan las últimas `rows.maxRun` filas, salvo que sea la única con peso.
     */
    pickCount(base) {
        const { counts, maxRun } = this.config.branches.rows;
        const recent = this.counts.slice(-maxRun);
        const run = recent.length === maxRun && recent.every((c) => c === recent[0]) ? recent[0] : null;
        const weights = Object.entries(this.byStage(counts.first, counts.last, stageOf(base, this.config))).filter(([, w]) => w > 0);
        const allowed = weights.filter(([n]) => Number(n) !== run);
        const entries = allowed.length > 0 ? allowed : weights;
        let roll = this.random() * entries.reduce((sum, [, w]) => sum + w, 0);
        for (const [n, w] of entries) {
            roll -= w;
            if (roll < 0) return Number(n);
        }
        return Number(entries[entries.length - 1][0]);
    }

    /**
     * Intervalos de x del centro de una plataforma de ancho `w` y tope `top` dentro de `cell` [lo, hi] que cumplen paredes
     * (con el ancho de la etapa de arriba), alcance desde alguna plataforma de `from` (`reach`), `air` y
     * `separation`. Con `urgent` (plataformas sin vecina arriba) su x queda a su hueco máximo de salto de todas ellas. Sale por
     * construcción: se restringe x en vez de sortear y rechazar.
     */
    span(top, w, cell, from, urgent) {
        const { centerX, branches } = this.config;
        const { up, short } = this.config.reach;
        const gapFor = (dy) => (dy <= short.dy ? Math.max(short.gap, up.gap) : up.gap);
        const { air, separation, sameHeight, transition, dy } = branches;
        const soft = halfWidth(stageOf(top + transition + dy[1], this.config), this.config) + up.gap;
        const half = Math.min(halfWidth(stageOf(top + transition, this.config), this.config), soft);
        const lo = Math.max(cell[0] + w / 2, centerX - half + w / 2);
        const hi = Math.min(cell[1] - w / 2, centerX + half - w / 2);
        const reach = from.map((p) => [p.minX - gapFor(top - p.top) - w / 2, p.maxX + gapFor(top - p.top) + w / 2]).sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const r of reach) {
            const last = merged[merged.length - 1];
            if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
            else merged.push([...r]);
        }
        let list = intersectIntervals(merged, lo, hi);
        for (const p of urgent) list = intersectIntervals(list, p.minX - gapFor(top - p.top) - w / 2, p.maxX + gapFor(top - p.top) + w / 2);
        for (const q of this.items) {
            const apart = Math.abs(top - q.top);
            if (apart >= air) continue;
            const pad = apart <= sameHeight ? separation : 0;
            list = subtractIntervals(list, q.minX - w / 2 - pad - SPAN_PAD, q.maxX + w / 2 + pad + SPAN_PAD);
        }
        return list;
    }

    /**
     * Posición de una plataforma con tope `top` en la celda `cell`: `{ x, w }`, o `null` si no hay lugar. `from` son las
     * plataformas desde las que puede alcanzarse; `single` usa `rows.singleWidth`.
     */
    place(top, cell, from, urgent, single) {
        const w = Math.min(this.rowWidth(top, single), cell[1] - cell[0]);
        const list = this.span(top, w, cell, from, urgent);
        if (list.length === 0) return null;
        const total = list.reduce((sum, [lo, hi]) => sum + (hi - lo), 0);
        let pick = this.random() * total;
        for (const [lo, hi] of list) {
            if (pick <= hi - lo) return { x: lo + pick, w };
            pick -= hi - lo;
        }
        return { x: list[list.length - 1][1], w };
    }

    /**
     * Sortea una fila de `count` plataformas con su altura base `base`: cada una en cualquier x del ancho entre paredes, alcanzable desde la fila anterior o desde otra de la misma fila (`canReach`),
     * y con el tope limitado para que llegue a una plataforma sin vecina arriba. Devuelve las plataformas (ya en `items`) o `null`.
     */
    drawRow(count, base) {
        const { shift } = this.config.branches.rows;
        const { centerX, branches, reach } = this.config;
        const half = halfWidth(stageOf(base + branches.transition, this.config), this.config);
        const whole = [centerX - half, centerX + half];
        const need = this.items.filter((q) => this.mustReach(q, base));
        const row = [];
        for (let i = 0; i < count; i++) {
            let top = base + this.uniform([-shift, shift]);
            const target = need.find((q) => base - shift - q.top <= reach.up.dy);
            if (target) top = Math.min(top, target.top + reach.up.dy);
            const from = this.items.filter((q) => top - q.top > 0 && top - q.top <= reach.up.dy);
            const spot = (count === 1 && need.length > 1 && this.place(top, whole, from, need, true)) || (target && this.place(top, whole, from, [target], count === 1)) || this.place(top, whole, from, [], count === 1);
            if (spot === null) return null;
            const item = { x: spot.x, minX: spot.x - spot.w / 2, maxX: spot.x + spot.w / 2, top, above: false, generated: true };
            this.items.push(item);
            row.push(item);
            for (let k = need.length - 1; k >= 0; k--) if (this.reaches(need[k], item)) need.splice(k, 1);
        }
        return row;
    }


    /** Verdadero si `b` está más alta que `a` y a su alcance (`canReach`). */
    reaches(a, b) {
        const gap = Math.max(0, b.minX - a.maxX, a.minX - b.maxX);
        const dy = b.top - a.top;
        return dy > 0 && canReach(dy, gap, this.config.reach);
    }

    /** Verdadero si `q` es una plataforma generada sin vecina arriba que, con la fila de altura base `base`, ya no llegaría a la fila siguiente. */
    mustReach(q, base) {
        const { spacing, shift } = this.config.branches.rows;
        return q.generated && !q.above && q.top + this.config.reach.up.dy < base + spacing[0] - shift;
    }

    /** Verdadero si toda plataforma que `mustReach` tiene una vecina alcanzable en `row`. */
    rowReaches(row, base) {
        return this.items.every((q) => row.includes(q) || !this.mustReach(q, base) || row.some((r) => this.reaches(q, r)));
    }

    /** Un sorteo de fila válida `{ row, base }` o `null`; si vale, deja la fila en `items`. */
    candidate() {
        const before = this.items;
        this.items = before.slice();
        const base = this.rowTop + this.uniform(this.config.branches.rows.spacing);
        const row = this.drawRow(this.pickCount(base), base);
        if (row !== null && this.rowReaches(row, base)) return { row, base };
        this.items = before;
        return null;
    }

    /** Fija la fila `{ row, base }`: marca las vecinas de arriba, cuenta la cantidad y arma `queue` de abajo hacia arriba. */
    commit({ row, base }) {
        const before = this.items.filter((q) => !row.includes(q));
        row.sort((a, b) => a.top - b.top);
        for (const q of before) if (!q.above && row.some((r) => this.reaches(q, r))) q.above = true;
        for (const q of row) if (!q.above && row.some((r) => r !== q && this.reaches(q, r))) q.above = true;
        this.counts.push(row.length);
        this.rowTop = base;
        this.front = Math.max(this.front, ...row.map((q) => q.top));
        this.items = this.items.filter((v) => v.top >= this.front - this.config.branches.window);
        const rowIndex = this.rowIndex++;
        this.queue = row.map((q) => ({ x: q.x, w: q.maxX - q.minX, y: q.top, row: rowIndex }));
    }

    /**
     * Verdadero si, fijada la fila `cand`, todavía se puede armar otra: la que completa una racha de `rows.maxRun` filas
     * iguales exige una cantidad distinta, y con apoyos angostos puede no haber lugar. No deja huella en el generador.
     */
    hasNext(cand) {
        const { tries } = this.config.branches;
        const saved = { items: this.items, flags: this.items.map((q) => q.above), counts: this.counts.slice(), rowTop: this.rowTop, front: this.front, rowIndex: this.rowIndex, queue: this.queue };
        this.commit(cand);
        let found = false;
        for (let t = 0; t < tries && !found; t++) found = this.candidate() !== null;
        this.items = saved.items;
        saved.items.forEach((q, i) => (q.above = saved.flags[i]));
        Object.assign(this, { counts: saved.counts, rowTop: saved.rowTop, front: saved.front, rowIndex: saved.rowIndex, queue: saved.queue });
        return found;
    }

    /** Arma la fila siguiente en `queue`; tras `tries` sorteos fallidos, `fallback` como fila de una. */
    buildRow() {
        const { tries, rows } = this.config.branches;
        let cand = null;
        for (let t = 0; t < tries && cand === null; t++) {
            cand = this.candidate();
            const recent = this.counts.slice(-(rows.maxRun - 1));
            const closes = cand !== null && recent.length === rows.maxRun - 1 && recent.every((c) => c === cand.row.length);
            if (closes && !this.hasNext(cand)) {
                this.items = this.items.filter((q) => !cand.row.includes(q));
                cand = null;
            }
        }
        if (cand === null) {
            const f = this.fallback();
            const item = { x: f.x, minX: f.x - f.w / 2, maxX: f.x + f.w / 2, top: f.top, above: false, generated: true };
            this.items.push(item);
            cand = { row: [item], base: f.top };
        }
        this.commit(cand);
    }

    /** Plataforma siguiente de la fila en curso; con la fila agotada arma la que sigue. */
    next() {
        if (this.queue.length === 0) this.buildRow();
        const { x, w, y, row } = this.queue.shift();
        const stage = stageOf(y, this.config);
        const brk = this.config.breakable;
        const roll = brk && stage >= brk.fromStage ? this.breakableRandom() : 1;
        const weapons = this.pickupsOf(x, y, stage);
        const repairs = this.repairsOf(x, y, stage);
        const pickups = repairs.length > 0 ? repairs : weapons;
        const chance = brk ? Math.min(brk.max, brk.chance + brk.perStage * (stage - brk.fromStage)) : 0;
        const breakable = pickups.length === 0 && roll < chance ? brk.time : false;
        return { index: this.index++, row, x, w, y, stage, pickups, breakable };
    }
}
/**
 * Mundo del ascenso infinito (docs/design/16-ascenso.md §16.6). Todas las plataformas y paredes son fixtures de caja de un
 * solo cuerpo cinemático (fricción 0,8) que baja a `CLIMB.scroll` m/s; las plataformas se registran en `OneWayPlatforms`
 * como móviles y las armas en `Pickups`. Los datos (`level`, `items`, el generador) están en coordenadas locales del
 * cuerpo; la altura en el mundo es `y + offsetY`, con `offsetY` la posición del cuerpo. Crear y destruir es
 * `CreateFixture` y `DestroyFixture` sobre ese cuerpo; el `b2PolygonShape` y los `b2Vec2` de trabajo se crean una vez y se
 * liberan en `dispose`.
 *
 * `update` y `reset` se llaman solo desde el loop, después de los pasos del frame, nunca dentro de `stepWorld` ni de un
 * callback. Después de destruir, quien llama invalida `wallContact` y rehace el grafo del bot con `level`.
 */
export class Climb {
    constructor({ world, platforms, pickups, breakable = null, config = CLIMB, base = LEVEL }) {
        this.world = world;
        this.platforms = platforms;
        this.pickups = pickups;
        this.breakable = breakable;
        this.config = config;
        this.base = base;
        const bodyDef = new Box2D.b2BodyDef();
        bodyDef.set_type(Box2D.b2_kinematicBody);
        this.body = world.CreateBody(bodyDef);
        Box2D.destroy(bodyDef);
        this.body.SetSleepingAllowed(false);
        this.shape = new Box2D.b2PolygonShape();
        this.origin = new Box2D.b2Vec2(0, 0);
        this.vector = new Box2D.b2Vec2(0, 0);
        this.data = { solids: [] };
        this.items = [];
        /** Puntos de aparición de armas vivos (los de `Pickups` que creó `Climb`), con `y` local. */
        this.points = [];
        this.generator = null;
        this.stagesBuilt = -1;
        this.stageReached = 0;
        /** Aparición de los jugadores `[{ x, y, flipX }, ...]` en el mundo, sorteada en `reset`. */
        this.spawns = [];
    }

    /** Desplazamiento (m) del cuerpo del mapa: lo que hay que sumar a una altura local para tener la del mundo. */
    get offsetY() {
        return this.body.GetPosition().get_y();
    }

    /** Sólidos vivos como datos locales (`{ solids }`), para dibujar y para `buildNav`. */
    get level() {
        return this.data;
    }

    /** Velocidad de descenso (m/s) según la etapa más alta alcanzada. */
    get scrollSpeed() {
        const { base, perStage } = this.config.scroll;
        return base + perStage * this.stageReached;
    }

    /** Límites de la cámara a la altura de mundo `y`: el ancho de la etapa de esa altura local y sin techo. */
    cameraBounds(y) {
        const half = halfWidth(stageOf(y - this.offsetY, this.config), this.config);
        return { minX: this.config.centerX - half, maxX: this.config.centerX + half, minY: 0, maxY: Infinity };
    }

    applyScroll() {
        this.vector.Set(0, -this.scrollSpeed);
        this.body.SetLinearVelocity(this.vector);
    }

    /** Destruye todo, vuelve el cuerpo al origen, crea la base y genera hasta y = 60 m locales. */
    reset(seed) {
        this.clear();
        this.vector.Set(0, 0);
        this.body.SetTransform(this.vector, 0);
        this.pickups.shift(0);
        this.generator = new ClimbGenerator(seed, this.config);
        this.stagesBuilt = -1;
        this.stageReached = 0;
        this.applyScroll();
        for (const p of this.generator.base) this.addPlatform(p);
        this.generate(60);
        const random = createSeededRandom((seed ^ 0x9e3779b9) >>> 0);
        const all = this.items.filter((item) => item.kind === "platform").map((item) => ({ x: item.solid.x, w: item.solid.w, y: item.top }));
        const climbable = (p) =>
            all.some((q) => canReach(q.y - p.y, Math.max(0, q.x - q.w / 2 - (p.x + p.w / 2), p.x - p.w / 2 - (q.x + q.w / 2)), this.config.reach) && q.y > p.y);
        this.spawns = pickSpawns(all.filter((p) => p.y <= this.config.spawn.maxTop && climbable(p)), random, this.config);
    }

    /**
     * Mueve los puntos de arma con el cuerpo, sube la etapa alcanzada, genera hasta `top + ahead` y libera todo elemento
     * cuyo tope quedó por debajo de `level − sinkBelow`. `top`, `level` y `reached` son alturas del mundo (`level` el del agua,
     * `−Infinity` si no hay inundación; `reached` la del jugador más alto). Devuelve las cantidades `{ created, destroyed }`.
     */
    update({ top, level, reached = -Infinity }) {
        const offset = this.offsetY;
        this.pickups.shift(offset);
        const stage = stageOf(reached - offset, this.config);
        if (reached > -Infinity && stage > this.stageReached) {
            this.stageReached = stage;
            this.applyScroll();
        }
        const created = this.generate(top - offset + this.config.ahead);
        const limit = level - offset - this.config.flood.sinkBelow;
        const sunk = this.items.filter((item) => item.top < limit);
        for (const item of sunk) this.destroyItem(item);
        if (sunk.length) {
            const gone = new Set(sunk);
            this.items = this.items.filter((item) => !gone.has(item));
            const solids = new Set(sunk.map((item) => item.solid));
            this.data.solids = this.data.solids.filter((solid) => !solids.has(solid));
        }
        const sunkPoints = this.points.filter((point) => point.y < limit);
        for (const point of sunkPoints) this.pickups.remove(point);
        this.points = this.points.filter((point) => point.y >= limit);
        return { created, destroyed: sunk.length + sunkPoints.length };
    }

    /** Crea plataformas, armas y paredes hasta la altura local `limit` (m); devuelve cuántos elementos creó. */
    generate(limit) {
        const before = this.items.length + this.points.length;
        while (this.generator.front < limit || this.generator.pending > 0) {
            const p = this.generator.next();
            this.addPlatform(p);
            for (const point of p.pickups) this.points.push(this.pickups.add(point));
        }
        const needed = stageOf(limit, this.config);
        while (this.stagesBuilt < needed) {
            this.stagesBuilt++;
            for (const w of stageWalls(this.stagesBuilt, this.config, this.base)) this.addBox(w.x, w.y, w.w, w.h, "wall", false);
        }
        return this.items.length + this.points.length - before;
    }

    /** Plataforma `{ x, w, y }` (`y` el tope) como caja atravesable de alto `branches.thickness`. */
    addPlatform(p) {
        const { thickness } = this.config.branches;
        this.addBox(p.x, p.y - thickness / 2, p.w, thickness, "platform", true, p.breakable);
    }

    addBox(x, y, w, h, kind, oneWay, breakable = false) {
        this.vector.Set(x, y);
        this.shape.SetAsBox(w / 2, h / 2, this.vector, 0);
        const fixture = this.body.CreateFixture(this.shape, 0);
        fixture.SetFriction(0.8);
        if (oneWay) this.platforms.addPlatform(fixture, { moving: true });
        const solid = oneWay ? { x, y, w, h, kind, oneWay, ...(breakable ? { breakable } : {}) } : { x, y, w, h, kind };
        if (breakable && this.breakable) this.breakable.add(fixture, solid);
        this.items.push({ fixture, oneWay, breakable: Boolean(breakable), kind, top: y + h / 2, solid });
        this.data.solids.push(solid);
    }

    destroyItem(item) {
        if (item.breakable && this.breakable) this.breakable.remove(item.fixture);
        if (item.oneWay) this.platforms.removePlatform(item.fixture);
        this.body.DestroyFixture(item.fixture);
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
        this.world.DestroyBody(this.body);
        Box2D.destroy(this.origin);
        Box2D.destroy(this.vector);
        Box2D.destroy(this.shape);
    }
}

/**
 * Premio por etapa del ascenso: el primer robot que se apoya en una plataforma de la etapa `n ≥ 1` lo gana, una vez por
 * etapa y por ronda. `detect` solo anota eventos `{ k, stage }` (se llama después de `stepWorld`, nunca en un callback) y
 * `apply` es el único lugar que los aplica (vida y tanques según `config.stagePrize`) y arma el cartel `banner`
 * `{ text, k, until }` con el jugador que lo ganó (reloj de simulación).
 */
export class StagePrizes {
    constructor(config = CLIMB) {
        this.config = config;
        this.claimed = new Set();
        this.events = [];
        this.banner = null;
    }

    /** Nueva ronda: todos los premios vuelven a estar disponibles. */
    reset() {
        this.claimed.clear();
        this.events.length = 0;
        this.banner = null;
    }

    /**
     * Tope local (m) de la plataforma más alta de `solids` (alturas locales; `offsetY` las lleva al mundo) sobre la que
     * está apoyado `player`, o `null` si no hay.
     */
    supportTop(player, solids, offsetY = 0) {
        const x = player.torso.GetPosition().get_x();
        const low = player.lowestPoint();
        let best = null;
        for (const s of solids) {
            if (s.kind !== "platform" || s.broken) continue;
            const top = s.y + s.h / 2;
            if (Math.abs(x - s.x) > s.w / 2 + SUPPORT_SLACK.x || Math.abs(low - top - offsetY) > SUPPORT_SLACK.y) continue;
            if (best === null || top > best) best = top;
        }
        return best;
    }

    /** Anota el premio de la etapa (local) en que se apoya cada robot vivo y en el suelo, si todavía nadie lo ganó. */
    detect(players, solids, offsetY = 0) {
        players.forEach((player, k) => {
            if (player.dead || !player.grounded) return;
            const top = this.supportTop(player, solids, offsetY);
            if (top === null) return;
            const stage = stageOf(top, this.config);
            if (stage < 1 || this.claimed.has(stage)) return;
            this.claimed.add(stage);
            this.events.push({ k, stage });
        });
    }

    /** Aplica los eventos pendientes a `players` y devuelve los aplicados. `now` es el reloj de simulación (s). */
    apply(players, now) {
        const applied = this.events.splice(0);
        const prize = this.config.stagePrize;
        for (const { k, stage } of applied) {
            const player = players[k];
            if (prize.repair === "full") player.repair(Infinity);
            if (prize.refill) refillTanks(player);
            this.banner = { text: `ETAPA ${stage} · J${k + 1}`, k, until: now + prize.banner };
        }
        return applied;
    }
}
