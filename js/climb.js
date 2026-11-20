import { LEVEL } from "./level.js";
import { BOT, seededRandom } from "./bot.js";
import { FLUID, refillTanks } from "./weapons.js";

/**
 * Valores del ascenso infinito (docs/design/16-ascenso.md §16.2). Distancias en m, tiempos en s. Las alturas de la tabla y
 * del generador son locales: las del cuerpo cinemático del mapa, que baja.
 * - `centerX`: eje de las paredes; `stageHeight`: alto de una etapa; `width`: ancho entre paredes, `first` en la etapa 0 y
 *   `W(n) = max(min, base − perStage · n)` desde la 1; `wallOuter`: cuánto se extienden las paredes más allá de los límites
 *   del nivel; `wallBelow`: cuánto bajo y = 0 llegan las paredes de la etapa 0;
 * - `branches`: generador por ramas: `thickness` de cada plataforma; `dy` [mín, máx] sobre la plataforma de apoyo y `overlap`
 *   horizontal mínimo con ella; `air` (m, de tope a tope) mínimo con otra que la cubra en x; `separation` horizontal mínima
 *   con otra a su altura (±`sameHeight`); `gap` [mín, máx] (m) entre el tope de una plataforma y el de la anterior, que da
 *   de 8 a 13 plataformas en cualquier ventana de 10 m;
 *   `tries` sorteos de tope por plataforma; `transition`: una plataforma a menos de esto bajo un cambio de etapa ya
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
 * - `flood`: `surface` (m) del agua al empezar, `start` (s), `speed` base (m/s), `perStage` (m/s por etapa), `depth` del
 *   fondo efectivo y `sinkBelow` (m bajo el nivel desde donde se libera lo hundido);
 * - `ahead`: cuánto por encima de la cámara se genera;
 * - `loadout`: equipo inicial del mapa (el clásico usa `LOADOUT` de `js/weapons.js`): sin arma ni tanques, solo melee;
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
        overlap: 1.5,
        air: 1.8,
        separation: 1,
        sameHeight: 0.5,
        gap: [0.8, 1.2],
        tries: 80,
        transition: 3.5,
        minWidth: 1.6,
        tail: { chance: 0.1, long: 1.5, short: 0.6 },
        window: 12,
        width: { first: [5, 9], last: [2, 4], stages: 5 },
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
    flood: { surface: 2, start: 5, speed: 0.25, perStage: 0.04, depth: 6, sinkBelow: 5 },
    ahead: 30,
    loadout: { weapon: null, weapons: [] },
    stagePrize: { banner: 1.5, repair: "full", refill: true },
};


/** Holgura horizontal (m) y vertical (m) con que un robot cuenta como apoyado en una plataforma. */
const SUPPORT_SLACK = { x: 0.3, y: 0.35 };

/** Tolerancia numérica (m) de las comparaciones de geometría. */
const EPS = 1e-9;

/** Holgura (m) con que `span` aparta una plataforma de las prohibidas, para que el borde no quede en un solape por redondeo. */
const SPAN_PAD = 1e-6;

/** Recorta cada intervalo de `list` a [`lo`, `hi`] y descarta los vacíos. */
function intersect(list, lo, hi) {
    return list.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => a <= b);
}

/** Quita (`lo`, `hi`) de cada intervalo de `list`. */
function subtract(list, lo, hi) {
    const out = [];
    for (const [a, b] of list) {
        if (hi <= a || lo >= b) out.push([a, b]);
        else {
            if (lo > a) out.push([a, lo]);
            if (hi < b) out.push([hi, b]);
        }
    }
    return out;
}

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
 * Generador determinista por ramas (docs/design/16-ascenso.md §16.3). JS puro, sin `Box2D`. Una sola secuencia de
 * `seededRandom(seed)` consumida plataforma por plataforma: el mapa no depende de cuándo se genera cada una. Cada plataforma queda
 * `branches.gap` m sobre la anterior; cada una nace sobre una de apoyo con `dy` en `branches.dy` y solapamiento horizontal
 * `overlap`, y su x se restringe por construcción para no pisar a otra, dejar `air` de aire con las que la cubren en x,
 * `separation` con las de su altura, quedar dentro de las paredes y ser alcanzable (regla `reach`) desde las plataformas
 * que todavía no tienen una vecina arriba y se quedarían fuera de alcance.
 * `base` son las plataformas anchas de la etapa 0 `{ x, w, y }` (`y` es el tope) y `next()` devuelve
 * `{ index, x, w, y, stage, pickups: [{ x, y, weapon } | { x, y, kind: "repair" }] }`. `fallbacks` cuenta las veces que ninguna posición valió.
 */
export class ClimbGenerator {
    constructor(seed, config = CLIMB) {
        this.config = config;
        this.random = seededRandom(seed);
        this.index = 0;
        this.fallbacks = 0;
        this.items = [];
        this.inStage = new Map();
        this.repairs = new Map();
        this.base = this.makeBase();
        this.front = Math.max(...this.base.map((p) => p.y));
        this.relaxed = 0;
        for (const p of this.base) this.items.push({ x: p.x, minX: p.x - p.w / 2, maxX: p.x + p.w / 2, top: p.y, above: false });
    }

    uniform([lo, hi]) {
        return lo + this.random() * (hi - lo);
    }

    /** Ancho de colocación (m) de las plataformas de la etapa `stage`: rango lineal entre `width.first` y `width.last`. */
    widthRange(stage) {
        const { first, last, stages } = this.config.branches.width;
        const k = Math.min(stage, stages) / stages;
        return [first[0] + (last[0] - first[0]) * k, first[1] + (last[1] - first[1]) * k];
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

    /**
     * Intervalos de x del centro de una plataforma de ancho `w` y tope `top` apoyada en `s` que cumplen paredes, solapamiento
     * con el apoyo, alcance de las plataformas `urgent` (sin vecina arriba y a punto de quedar fuera de `reach.up.dy`),
     * `air` y `separation`. Sale por construcción: se restringe x en vez de sortear y rechazar.
     */
    span(s, top, w, urgent) {
        const { centerX, reach, branches } = this.config;
        const { overlap, air, separation, sameHeight, transition, dy } = branches;
        const half = halfWidth(stageOf(top + transition, this.config), this.config);
        const soft = halfWidth(stageOf(top + transition + dy[1], this.config), this.config);
        let list = intersect([[Math.max(s.minX + overlap - w / 2, centerX - half + w / 2, centerX - soft + overlap - w / 2), Math.min(s.maxX - overlap + w / 2, centerX + half - w / 2, centerX + soft - overlap + w / 2)]], -Infinity, Infinity);
        for (const p of urgent) list = intersect(list, p.minX - reach.up.gap - w / 2, p.maxX + reach.up.gap + w / 2);
        for (const q of this.items) {
            const apart = Math.abs(top - q.top);
            if (apart >= air) continue;
            const pad = apart <= sameHeight ? separation : 0;
            list = subtract(list, q.minX - w / 2 - pad - SPAN_PAD, q.maxX + w / 2 + pad + SPAN_PAD);
        }
        return list;
    }

    /** Posición de una plataforma con tope `top`: `{ x, w }`, o `null` si ningún apoyo y ancho sorteados deja lugar. */
    place(top) {
        const { branches, reach } = this.config;
        const { dy, tail, minWidth, transition, gap } = branches;
        const supports = this.items.filter((q) => top - q.top >= Math.max(dy[0], branches.air) - EPS && top - q.top <= dy[1] + EPS);
        if (supports.length === 0) return null;
        const half = halfWidth(stageOf(top + transition, this.config), this.config);
        let w = this.uniform(this.widthRange(stageOf(top, this.config)));
        if (this.random() < tail.chance) w *= this.random() < 0.5 ? tail.long : tail.short;
        w = Math.min(Math.max(w, minWidth), 2 * half);
        const urgent = this.items.filter((q) => !q.above && top + gap[1] - q.top > reach.up.dy && top - q.top <= reach.up.dy);
        supports.sort((a, b) => Number(a.above) - Number(b.above) || a.top - b.top);
        let list = [];
        for (const width of [w, Math.min(minWidth, w)]) {
            w = width;
            for (let i = 0; i < supports.length && list.length === 0; i++) list = this.span(supports[i], top, w, urgent);
            if (list.length > 0) break;
        }
        if (list.length === 0) return null;
        const total = list.reduce((sum, [lo, hi]) => sum + (hi - lo), 0);
        let pick = this.random() * total;
        for (const [lo, hi] of list) {
            if (pick <= hi - lo) return { x: lo + pick, w };
            pick -= hi - lo;
        }
        return { x: list[list.length - 1][1], w };
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
     * Genera la plataforma siguiente: su tope es el frente más un `gap` al azar (tras `tries` sorteos sin lugar, el hueco máximo
     * crece hacia `dy[1]` durante otros `tries`, y cuenta en `relaxed`). Si no hay lugar, `fallback`.
     */
    next() {
        const { tries, window, gap, dy } = this.config.branches;
        let top = 0;
        let spot = null;
        for (let t = 0; t < 2 * tries && spot === null; t++) {
            const hi = gap[1] + (dy[1] - gap[1]) * (Math.max(0, t - tries + 1) / tries);
            top = this.front + this.uniform([gap[0], hi]);
            spot = this.place(top);
            if (spot !== null && top - this.front > gap[1]) this.relaxed++;
        }
        if (spot === null) {
            const f = this.fallback();
            top = f.top;
            spot = { x: f.x, w: f.w };
        }
        this.front = Math.max(this.front, top);
        const stage = stageOf(top, this.config);
        const weapons = this.pickupsOf(spot.x, top, stage);
        const repairs = this.repairsOf(spot.x, top, stage);
        const pickups = repairs.length > 0 ? repairs : weapons;
        const item = { x: spot.x, minX: spot.x - spot.w / 2, maxX: spot.x + spot.w / 2, top, above: false };
        for (const q of this.items) if (!q.above && this.reaches(q, item)) q.above = true;
        this.items.push(item);
        this.items = this.items.filter((v) => v.top >= this.front - window);
        return { index: this.index++, x: spot.x, w: spot.w, y: top, stage, pickups };
    }

    /** Verdadero si desde `a` se llega a `b` más arriba con el salto largo de `reach` (`up`, el de `buildNav`). */
    reaches(a, b) {
        const { up } = this.config.reach;
        const gap = Math.max(0, b.minX - a.maxX, a.minX - b.maxX);
        const dy = b.top - a.top;
        return dy > 0 && dy <= up.dy && gap <= up.gap;
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
    constructor({ world, platforms, pickups, config = CLIMB, base = LEVEL }) {
        this.world = world;
        this.platforms = platforms;
        this.pickups = pickups;
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
        const random = seededRandom((seed ^ 0x9e3779b9) >>> 0);
        const all = this.items.filter((item) => item.kind === "platform").map((item) => ({ x: item.solid.x, w: item.solid.w, y: item.top }));
        const { dy, overlap } = this.config.branches;
        const climbable = (p) =>
            all.some((q) => q.y - p.y > 0 && q.y - p.y <= dy[1] && Math.min(p.x + p.w / 2, q.x + q.w / 2) - Math.max(p.x - p.w / 2, q.x - q.w / 2) >= overlap);
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
        while (this.generator.front < limit) {
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
        this.addBox(p.x, p.y - thickness / 2, p.w, thickness, "platform", true);
    }

    addBox(x, y, w, h, kind, oneWay) {
        this.vector.Set(x, y);
        this.shape.SetAsBox(w / 2, h / 2, this.vector, 0);
        const fixture = this.body.CreateFixture(this.shape, 0);
        fixture.SetFriction(0.8);
        if (oneWay) this.platforms.addPlatform(fixture, { moving: true });
        const solid = oneWay ? { x, y, w, h, kind, oneWay } : { x, y, w, h, kind };
        this.items.push({ fixture, oneWay, kind, top: y + h / 2, solid });
        this.data.solids.push(solid);
    }

    destroyItem(item) {
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
 * `{ text, until }` (reloj de simulación).
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
            if (s.kind !== "platform") continue;
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
            this.banner = { text: `ETAPA ${stage} · J${k + 1}`, until: now + prize.banner };
        }
        return applied;
    }
}
