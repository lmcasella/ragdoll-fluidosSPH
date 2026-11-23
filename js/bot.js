import { LEVEL } from "./level.js";
import { PAD } from "./Input.js";
import { getRaycaster } from "./raycast.js";
import { WEAPONS, weaponById } from "./weapons.js";

/**
 * Valores del bot de prueba (#151). Distancias en m, tiempos en s, ángulos en rad.
 * - `melee`: `range` (distancia horizontal entre torsos para empezar un golpe), `stop` (a cuánto se detiene al acercarse),
 *   `vertical` (diferencia de altura máxima para golpear parado), `airRange` y `airDrop` (golpe en el aire: horizontal
 *   máximo y cuánto más abajo tiene que estar el rival), `kickDrop` (desde esa caída usa patada en vez de golpe);
 * - `shoot`: `min` y `max` de la distancia de disparo; `aimError` (error de puntería, ±) y `aimRefresh` (cada cuánto se
 *   vuelve a sortear);
 * - `reaction`: [mín, máx] de la demora entre ver que el rival empieza un golpe y actuar; `defense`: probabilidad de que
 *   la defensa acierte; `blockRange` y `blockHold` (cuánto sigue bloqueando después de ver el último golpe);
 * - `lowHp`: vida desde la que prefiere rodar hacia atrás; `rollRoom`: espacio libre (m) que tiene que haber detrás para rodar;
 * - `survival`: supervivencia con la inundación activa (iguales en todas las dificultades). `climb`: la línea segura es el nivel
 *   del agua + `margin` (m) + la velocidad de cierre (agua base + bajada del mapa) × `lead` (s); con menos holgura que eso sube;
 *   `panic`: con menos de `clearance` m de holgura o `time` s hasta el agua entra en pánico; `edge`: `guard` (m) al borde donde
 *   se aparta tras un golpe y `lungeRoom` (m) de plataforma por delante que necesita un golpe para empezar; `idle`: `max` s
 *   apoyado y libre sin moverse ni saltar antes de forzar un salto; `risk`: `weight` (costo por `1 − margen` de cada salto) y
 *   `min` (margen mínimo de un salto de ruta); `drop`: `max` m de caída elegida;
 * - `edgeMargin`: distancia mínima al borde de una plataforma al caminar sin cruzar;
 * - `engage`: en Infinito persigue al rival si está a `dy` m de altura y `dx` m en horizontal o menos (con su plataforma sobre la línea segura);
 * - `reach`: regla de alcance del salto: subir hasta `up.dy` con hueco hasta `up.gap`, o hasta `short.dy` con hueco
 *   hasta `short.gap`; `downGap` es el hueco máximo al bajar o cruzar a nivel;
 * - `through`: subida vertical a través de una plataforma que solapa por encima: `overlap` (m) horizontal mínimo;
 *   `cost`: costo de cada arista del grafo, menor para `through` que para un salto diagonal (`jump`);
 * - `jump`: `distance` (a cuánto del destino salta), `edge` (a cuánto del borde salta aunque esté lejos), `inset` (margen
 *   dentro del destino donde suelta el stick), `dropBelow` (desnivel desde el que ya no salta sino que se deja caer),
 *   `align` (tolerancia al alinearse bajo un destino), `settle` (velocidad horizontal máxima, m/s, para saltar en vertical bajo un destino) y
 *   `foeClear` (el rival a menos de `dx` m en horizontal y hasta `dy` m por encima tapa el salto en vertical: despega del extremo del solape más lejano a él);
 * - `highBonus`: puntaje extra por una plataforma más alta que el rival; `hopCost`: costo por salto de ruta;
 *   `replan`: cada cuánto reelige destino;
 * - `pickupReach`: sin arma o con los tanques vacíos, aristas máximas de la ruta hasta un punto de aparición para ir a buscarlo;
 * - `repairHp`: con menos salud que esto busca también el ítem de reparación (con `pickupReach` aristas o menos);
 * - `burst` y `burstCooldown`: el bot dispara en ráfagas de `burst` s separadas por `burstCooldown` s, sin dejar de moverse;
 * - `reserve`: fracción del tanque que no gasta con el rival a `reserveRange` m o más;
 * - `evade`: ventana (s) tras recibir daño o líquido en la que salta a la plataforma de arriba o rueda alejándose;
 * - `stuck`: `time` (s) sin apoyo y sin alejarse más de `radius` (m) (encajado en una plataforma), tras lo que salta empujando por turnos hacia el centro de la plataforma más cercana y hacia el lado opuesto (el de su destino si es otro).
 */
export const BOT = {
    melee: { range: 1.6, stop: 1.3, vertical: 1.2, airRange: 2.2, airDrop: 0.8, kickDrop: 1.4 },
    shoot: { min: 4, max: 10, aimError: 0.05, aimRefresh: 0.5 },
    reaction: [0.15, 0.35],
    defense: 0.7,
    blockRange: 2,
    blockHold: 0.3,
    lowHp: 30,
    rollRoom: 3.6,
    survival: {
        climb: { margin: 4, lead: 5 },
        panic: { clearance: 2.5, time: 4 },
        edge: { guard: 0.8, lungeRoom: 1.2 },
        idle: { max: 0.5 },
        risk: { weight: 2, min: 0.15 },
        drop: { max: 6 },
    },
    edgeMargin: 0.5,
    engage: { dy: 8, dx: 14 },
    reach: { up: { dy: 3.3, gap: 2 }, short: { dy: 2, gap: 3.5 }, downGap: 3.5 },
    through: { overlap: 1.5 },
    cost: { through: 0.6, jump: 1 },
    jump: { distance: 2.5, edge: 0.6, inset: 0.6, dropBelow: -1, align: 0.3, settle: 0.6, foeClear: { dx: 1, dy: 4.5 } },
    highBonus: 4,
    hopCost: 0.3,
    replan: 0.5,
    pickupReach: 3,
    repairHp: 40,
    burst: 0.5,
    burstCooldown: 0.7,
    reserve: 0.25,
    reserveRange: 3,
    evade: 0.5,
    stuck: { time: 1, radius: 0.4 },
};

/**
 * Presets de dificultad del menú (#154): `reaction` ([mín, máx], s), `aimError` (rad) y `defense` (probabilidad) que
 * reemplazan esos valores de `BOT`. `normal` es el `BOT` tal cual.
 */
export const DIFFICULTY = {
    easy: { reaction: [0.3, 0.5], aimError: 0.1, defense: 0.4 },
    normal: { reaction: [0.15, 0.35], aimError: 0.05, defense: 0.7 },
    hard: { reaction: [0.1, 0.2], aimError: 0.02, defense: 0.9 },
    dummy: { reaction: [0.3, 0.5], aimError: 0.1, defense: 0, idle: true },
};

/** Tabla `BOT` con el preset de `difficulty` aplicado (`normal` si no existe). `idle`: muñeco de práctica que no toca ningún control. */
export function botConfig(difficulty) {
    const preset = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
    return { ...BOT, reaction: [...preset.reaction], defense: preset.defense, idle: preset.idle === true, shoot: { ...BOT.shoot, aimError: preset.aimError } };
}

const GRAVITY = 10;

/** Altura máxima (m) de un punto de aparición sobre la plataforma que lo sostiene. */
const PICKUP_ABOVE = 1.2;
const WALK_DEADZONE = 0.15;

/** Tolerancia numérica (m) de las comparaciones de alturas. */
const EPS = 1e-9;

/** Diferencia de tope (m) bajo la que dos plataformas cuentan como del mismo nivel. */
const SAME_LEVEL = 0.35;

/** Cuánto (s) empuja hacia el centro de la plataforma más cercana y hacia el lado opuesto, por turnos, para zafarse encajado. */
const UNSTICK_PHASE = 0.5;

/** Velocidad horizontal (m/s) que se supone en el aire para elegir dónde aterrizar, y holgura (m) sobre los pies del tope que cuenta como debajo. */
const AIR_SPEED = 5;
const LANDING_SLACK = 0.3;

/** Generador pseudoaleatorio determinista (mulberry32): mismo `seed`, misma secuencia. */
export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Plataformas del nivel como nodos (`minX`, `maxX`, `top`, `oneWay`), sin el lecho de la pileta, y las aristas
 * `from → [to]` según la regla de alcance de `BOT.reach`. Subir exige poder saltarlo; bajar o cruzar a nivel, un
 * hueco de hasta `downGap` y una caída de hasta `survival.drop.max`. Una plataforma encima de otra (hueco 0) cuenta como
 * alcanzable si el desnivel entra. `margins` guarda el margen de cada salto (`jumpMargin`) y `costs` el costo de la arista:
 * el de `cost` más `survival.risk.weight · (1 − margen)`.
 */
export function buildNav(level = LEVEL, config = BOT) {
    const floorTop = level.pool?.killY ?? -Infinity;
    const nodes = [];
    for (const s of level.solids) {
        if (s.kind !== "floor" && s.kind !== "platform") continue;
        const top = s.y + s.h / 2;
        if (top <= floorTop) continue;
        nodes.push({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, top, oneWay: !!s.oneWay, solid: s });
    }
    const { up } = config.reach;
    const { through, cost } = config;
    const { risk, drop } = config.survival ?? BOT.survival;
    const edges = nodes.map(() => []);
    const costs = nodes.map(() => []);
    const margins = nodes.map(() => []);
    nodes.forEach((a, i) => {
        nodes.forEach((b, j) => {
            if (i === j) return;
            const gap = Math.max(0, b.minX - a.maxX, a.minX - b.maxX);
            const dy = b.top - a.top;
            if (!canReach(dy, gap, config.reach) || dy < -drop.max) return;
            const margin = jumpMargin(dy, gap, config.reach);
            const vertical = dy > 0 && dy <= up.dy && Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) >= through.overlap;
            edges[i].push(j);
            costs[i].push((vertical ? cost.through : cost.jump) + risk.weight * (1 - margin));
            margins[i].push(margin);
        });
    });
    return { nodes, edges, costs, margins };
}

/**
 * Regla de alcance del salto de `reach` (la de `buildNav` y la del generador de Infinito): con `dy` > 0 (m, hacia arriba) y un
 * hueco horizontal `gap` (m) entre bordes, vale subir hasta `up.dy` con hueco hasta `up.gap` o hasta `short.dy` con hueco hasta
 * `short.gap`; con `dy` ≤ 0, un hueco hasta `downGap`.
 */
export function canReach(dy, gap, reach = BOT.reach) {
    const { up, short, downGap } = reach;
    return dy > 0 ? (dy <= up.dy && gap <= up.gap) || (dy <= short.dy && gap <= short.gap) : gap <= downGap;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Margen de un salto de `dy` (m, hacia arriba) y hueco `gap` (m) respecto de la regla de `reach`: la distancia normalizada al
 * borde de la regla, en [0, 1] (1 en el centro, 0 en el límite o fuera). Con `dy` > 0 es lo que más sobra de los dos rectángulos
 * de `canReach` (el menor de `1 − dy/dy_máx` y `1 − gap/gap_máx`); con `dy` ≤ 0, `1 − gap/downGap`.
 */
export function jumpMargin(dy, gap, reach = BOT.reach) {
    const { up, short, downGap } = reach;
    if (dy <= 0) return clamp(1 - gap / downGap, 0, 1);
    const inside = (r) => Math.min(1 - dy / r.dy, 1 - gap / r.gap);
    return clamp(Math.max(inside(up), inside(short)), 0, 1);
}

/**
 * Modo de supervivencia por la holgura (`clearance`, m, del tope de apoyo sobre el nivel del agua local) y la velocidad de cierre
 * (`closing`, m/s: agua base + bajada del mapa): `panic` con menos de `panic.clearance` o con `clearance / closing` bajo `panic.time`;
 * `safe` con al menos `climb.margin + climb.lead · closing`; `climb` entre los dos. Sin inundación (`clearance` infinita) es `safe`.
 */
export function survivalMode(clearance, closing, survival = BOT.survival) {
    if (!Number.isFinite(clearance)) return "safe";
    const { climb, panic } = survival;
    const timeToWater = closing > 0 ? clearance / closing : Infinity;
    if (clearance < panic.clearance || timeToWater < panic.time) return "panic";
    return clearance >= climb.margin + climb.lead * closing ? "safe" : "climb";
}

/**
 * Dirección (1 hacia +x, -1 hacia -x, 0 si ya está adentro) en que hay que caminar para alejarse de los bordes de `node` hasta
 * `guard` m. En una plataforma más angosta que `2 · guard` apunta al centro.
 */
export function edgeInward(x, node, guard) {
    const center = (node.minX + node.maxX) / 2;
    const lo = Math.min(node.minX + guard, center);
    const hi = Math.max(node.maxX - guard, center);
    return x < lo ? 1 : x > hi ? -1 : 0;
}

/** Verdadero si un paso adelante de `room` m desde `x` mirando hacia `side` (±1) termina dentro de `node`. */
export function lungeFits(x, side, node, room) {
    const end = x + side * room;
    return end >= node.minX && end <= node.maxX;
}

/** Verdadero si la plataforma del nodo está armada (`crack > 0`) o rota: el bot la da por perdida. */
export function isLost(node) {
    return Boolean(node.solid?.broken) || (node.solid?.crack ?? 0) > 0;
}

/**
 * Dónde aterrizar desde el aire en `x` con los pies a `low` y velocidad vertical `vy`: entre las plataformas bajo los pies a las
 * que se llega en la caída (hueco horizontal ≤ `speed` × tiempo de caída hasta su tope), la más alta que quede sobre `line`
 * (`safe` verdadero) y, si ninguna llega a la línea, la más alta que se alcance (`safe` falso); a igual altura, la de menor hueco.
 * Si ninguna se alcanza, la de menor hueco (`safe` falso). `index` es `null` sin plataformas bajo los pies.
 */
export function landingNode(nodes, x, low, vy, line, speed = AIR_SPEED) {
    let best = null;
    let nearest = null;
    nodes.forEach((n, index) => {
        if (isLost(n) || n.top > low + LANDING_SLACK) return;
        const gap = Math.max(0, n.minX - x, x - n.maxX);
        const fall = Math.max(0, low - n.top);
        const time = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * fall)) / GRAVITY;
        const found = { index, gap, above: n.top >= line, top: n.top };
        if (nearest === null || gap < nearest.gap) nearest = found;
        if (gap > speed * time) return;
        if (
            best === null ||
            found.above > best.above ||
            (found.above === best.above && (found.top > best.top + EPS || (Math.abs(found.top - best.top) <= EPS && gap < best.gap)))
        ) {
            best = found;
        }
    });
    if (best !== null) return { index: best.index, safe: best.above };
    return { index: nearest?.index ?? null, safe: false };
}

/**
 * Bot de prueba: un gamepad virtual para un jugador (patrón "intención, no dispositivo"). Una vez por frame lee el
 * estado del juego y escribe `pad` (botones y ejes del mapeo "standard") que `Input.setVirtualPad` entrega como si
 * fuera un gamepad real; no toca robots ni física. Solo usa el raycaster del mundo (sin memoria nativa propia).
 * La aleatoriedad (demora de reacción, error de puntería, acierto de defensa) sale de `rng`, que se puede inyectar
 * o derivar de `seed`.
 *
 * Prioridades de `think`: nada (muñeco, noqueado o muerto); aturdido, rodando o levantándose (solo apunta; reaccionando aplica
 * la regla de bordes); modo de supervivencia (`transition`: `safe`, `climb`, `panic`, `edge`, `air`, `recover`), que con `climb`,
 * `panic`, `edge` o `air` se queda con el stick izquierdo y el salto; defensa y golpe; movimiento; combate (`fight`, stick
 * derecho, que se superpone siempre).
 */
export class Bot {
    /**
     * @param {object} options
     * @param {number} options.k Índice del jugador que maneja.
     * @param {object} options.world Mundo de Box2D (para el raycaster compartido).
     * @param {object} [options.level] Datos del nivel.
     * @param {object} [options.config] Tabla `BOT`.
     * @param {number} [options.seed] Semilla del generador.
     * @param {() => number} [options.rng] Generador en [0, 1); gana sobre `seed`.
     */
    constructor({ k, world, level = LEVEL, config = BOT, seed = 1, rng = null }) {
        this.k = k;
        this.config = config;
        this.raycaster = getRaycaster(world);
        this.rng = rng ?? seededRandom(seed);
        this.nav = buildNav(level, config);
        /** Desplazamiento vertical (m) del mapa (Infinito): el grafo es local, la altura en el mundo es `top + offsetY`. */
        this.offsetY = 0;
        this.pad = {
            connected: true,
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
        };
        this.previous = this.pad.buttons.map(() => false);
        this.reset();
    }

    /**
     * Reemplaza el grafo por el de `level` (el nivel cambió). `committed`, `goal` y `foeNode` son índices de nodo: se
     * traducen al nodo igual del grafo nuevo (mismo tramo y tope) o se olvidan si ya no existe, para no perder el
     * destino de un salto en el aire cada vez que se genera o libera una fila.
     */
    setNav(level) {
        const old = this.nav;
        this.nav = buildNav(level, this.config);
        const same = (i) => {
            const n = old.nodes[i];
            const j = n === undefined ? -1 : this.nav.nodes.findIndex((m) => m.top === n.top && m.minX === n.minX && m.maxX === n.maxX);
            return j < 0 ? null : j;
        };
        this.minTop = -Infinity;
        this.committed = this.committed === null ? null : same(this.committed);
        this.goal = this.goal === null ? null : same(this.goal);
        this.foeNode = this.foeNode === null ? null : same(this.foeNode);
        this.refuge = this.refuge === null ? null : same(this.refuge);
        this.replanAt = 0;
        this.cache = null;
    }

    /**
     * Solo lectura, para el monitor de `js/debug.js`: `goal` (plataforma a la que va) y `target` (plataforma del rival),
     * cada una como punto `{ x, y }` en el mundo (centro y tope) o `null`, `action` (lo que aprieta este frame) y `mode`
     * (modo de supervivencia).
     */
    get debugState() {
        const point = (i) => {
            const n = i === null ? undefined : this.nav.nodes[i];
            return n ? { x: (n.minX + n.maxX) / 2, y: n.top + this.offsetY } : null;
        };
        const actions = [["disparar", PAD.fire], ["golpear", PAD.punch], ["bloquear", PAD.block], ["saltar", PAD.jump]]
            .filter(([, button]) => this.pad.buttons[button].pressed)
            .map(([name]) => name);
        if (this.pad.axes[0] !== 0) actions.unshift("caminar");
        return { goal: point(this.goal), target: point(this.foeNode), action: actions.join("+") || "quieto", mode: this.mode };
    }

    /** Olvida lo percibido y decidido (ronda nueva). */
    reset() {
        this.minTop = -Infinity;
        this.jumping = false;
        this.committed = null;
        this.goal = null;
        this.replanAt = 0;
        this.foeNode = null;
        this.refuge = null;
        this.threat = null;
        this.threatAt = 0;
        this.threatDelay = 0;
        this.defends = false;
        this.blockUntil = -Infinity;
        this.aimOffset = 0;
        this.aimStamp = -Infinity;
        this.tankSeen = null;
        this.weaponTarget = null;
        this.burstUntil = -Infinity;
        this.burstReadyAt = -Infinity;
        this.hurtAt = -Infinity;
        this.struckAt = -Infinity;
        this.lastHp = null;
        this.anchor = null;
        /** Modo actual (`safe`, `climb`, `panic`, `edge`, `air` o `recover`) y modo base por la holgura (`safe`, `climb` o `panic`). */
        this.mode = "safe";
        this.base = "safe";
        /** Holgura (m) sobre el agua local y velocidad de cierre (m/s) del último frame, y tope local de la última plataforma de apoyo. */
        this.clearance = Infinity;
        this.closing = 0;
        this.supportTop = null;
        /** Bajada del mapa (m/s), estimada con la diferencia de `offsetY`, y el último `offsetY` y reloj vistos. */
        this.scroll = 0;
        this.lastOffset = null;
        this.lastNow = null;
        this.riskMin = this.config.survival.risk.min;
        this.wasAir = false;
        this.cur = null;
        this.foeAt = null;
        this.active = false;
        this.idleSince = null;
        this.frame = 0;
        this.cache = null;
    }

    press(button) {
        this.pad.buttons[button].pressed = true;
    }

    /** Aprieta el botón solo si no estaba apretado en el frame anterior, para que `Input` vea un flanco. */
    pulse(button) {
        if (!this.previous[button]) this.press(button);
    }

    walk(dir) {
        this.pad.axes[0] = dir;
    }

    aim(dx, dy) {
        const len = Math.hypot(dx, dy) || 1;
        this.pad.axes[2] = dx / len;
        this.pad.axes[3] = -dy / len;
    }

    /** Camina hacia `x` si está a más de `WALK_DEADZONE`. */
    walkTo(px, x) {
        if (Math.abs(x - px) > WALK_DEADZONE) this.walk(Math.sign(x - px));
    }

    /**
     * Calcula el gamepad de este frame.
     * @param {object} game `{ players, match, flood, water, pickups, climbing, offsetY }` del juego (`climbing`: el mapa es Infinito; `offsetY`: lo que bajó el mapa).
     * @param {number} now Reloj de simulación, s.
     * @returns {object} El gamepad virtual (el mismo objeto cada vez).
     */
    update(game, now) {
        this.frame++;
        this.trackScroll(game.offsetY ?? 0, now);
        this.offsetY = game.offsetY ?? 0;
        this.pad.axes.fill(0);
        for (const b of this.pad.buttons) b.pressed = false;
        if (this.config.idle) return this.pad;
        const me = game.players[this.k];
        this.active = false;
        if (!this.unstick(me, now)) this.think(game, now);
        this.watchIdle(me, now);
        this.holdJump(me);
        this.previous.forEach((_, i) => (this.previous[i] = this.pad.buttons[i].pressed));
        return this.pad;
    }

    /** Estima la bajada del mapa (m/s) con la diferencia de `offsetY` entre frames, suavizada. */
    trackScroll(offsetY, now) {
        if (this.lastNow !== null && now > this.lastNow) {
            const rate = Math.max(0, (this.lastOffset - offsetY) / (now - this.lastNow));
            this.scroll += (rate - this.scroll) * 0.1;
        }
        this.lastOffset = offsetY;
        this.lastNow = now;
    }

    /**
     * Si lleva `stuck.time` s sin apoyo y sin moverse (encajado en una plataforma), salta empujando hacia el centro de su
     * destino o de la plataforma más cercana (alternando de lado si no hay ninguna). Devuelve verdadero si usó el frame.
     */
    unstick(me, now) {
        const a = this.anchor;
        if (me.dead || me.knockedOut) {
            this.anchor = null;
            return false;
        }
        const x = me.torso.GetPosition().get_x();
        const y = me.torso.GetPosition().get_y() - this.offsetY;
        if (me.grounded || a === null || Math.hypot(x - a.x, y - a.y) > this.config.stuck.radius) {
            this.anchor = { x, y, at: now };
            return false;
        }
        if (now - a.at < this.config.stuck.time) return false;
        const phase = Math.floor((now - a.at - this.config.stuck.time) / UNSTICK_PHASE);
        const node = this.nearestNode(x, y);
        const inward = node ? Math.sign((node.minX + node.maxX) / 2 - x) || 1 : 1;
        const destination = this.committed === null ? 0 : Math.sign((this.nav.nodes[this.committed].minX + this.nav.nodes[this.committed].maxX) / 2 - x);
        this.walk(phase % 2 === 0 ? inward : destination !== 0 && destination !== inward ? destination : -inward);
        this.pulse(PAD.jump);
        return true;
    }

    /** Plataforma más cercana (hueco horizontal y vertical) al punto `(x, y)` local, o `null`. */
    nearestNode(x, y) {
        let best = null;
        let bestDistance = Infinity;
        this.nav.nodes.forEach((n) => {
            if (isLost(n)) return;
            const distance = Math.hypot(Math.max(0, n.minX - x, x - n.maxX), n.top - y);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = n;
            }
        });
        return best;
    }

    /** Mantiene el salto apretado mientras el robot sube, para no recibir el corte del salto variable. */
    holdJump(me) {
        if (this.pad.buttons[PAD.jump].pressed) {
            this.jumping = true;
        } else if (this.jumping) {
            if (!me.dead && me.torso.GetLinearVelocity().get_y() > 0) this.press(PAD.jump);
            else this.jumping = false;
        }
    }

    /**
     * Vigilante de quietud: en `climb` o `panic`, apoyado y libre con el stick en 0 y sin saltar ni golpear durante más de
     * `survival.idle.max` s, pasa a `panic` y fuerza un salto hacia la plataforma más cercana por encima.
     */
    watchIdle(me, now) {
        const danger = this.base === "climb" || this.base === "panic";
        const free = !me.isStunned(now) && !me.reacting(now) && !me.rolling(now) && !me.recovering() && me.attack === null && !me.blocking;
        const pressing = [PAD.jump, PAD.block, PAD.punch].some((b) => this.pad.buttons[b].pressed);
        const idle = this.active && danger && me.grounded && free && this.cur !== null && this.pad.axes[0] === 0 && !pressing;
        if (!idle) {
            this.idleSince = null;
            return;
        }
        this.idleSince ??= now;
        if (now - this.idleSince <= this.config.survival.idle.max) return;
        this.mode = "panic";
        this.desperate(me, this.cur, true);
        this.idleSince = null;
    }

    /** Vista del rival desde el robot: `{ dx, dy, adx, dir }` (dx, dy desde el torso propio al del rival). */
    view(me, foe) {
        const mx = me.torso.GetPosition().get_x();
        const foePos = foe.torso.GetPosition();
        const dx = foePos.get_x() - mx;
        const dy = foePos.get_y() - me.torso.GetPosition().get_y();
        return { dx, dy, adx: Math.abs(dx), dir: Math.sign(dx) || me.side };
    }

    think(game, now) {
        const me = game.players[this.k];
        if (game.match.state !== "playing" || me.dead || me.knockedOut) return;
        this.active = true;
        this.pickWeapon(me);
        const mx = me.torso.GetPosition().get_x();
        let foe = null;
        let best = Infinity;
        game.players.forEach((p, i) => {
            if (i === this.k || p.dead) return;
            const d = Math.abs(p.torso.GetPosition().get_x() - mx);
            if (d < best) {
                best = d;
                foe = p;
            }
        });
        const cur = this.currentSupport(me);
        this.cur = cur;
        this.watchHurt(me, now);
        this.sense(game, me, cur, mx);
        const mode = this.transition(me, cur, now);
        if (cur !== null) this.committed = null;
        const v = foe ? this.view(me, foe) : null;
        this.foeAt = foe ? { x: foe.torso.GetPosition().get_x(), y: foe.torso.GetPosition().get_y() - this.offsetY } : null;
        const foeNode = foe ? this.supportOf(foe) : null;
        if (foeNode !== null) this.foeNode = foeNode;
        const cfg = this.config;
        const overlay = () => foe && this.fight(me, foe, cur, foeNode, v.adx, v.dx, v.dy, now);

        if (me.isStunned(now) || me.rolling(now) || me.recovering()) {
            if (v && v.adx < cfg.shoot.max) this.aim(v.dx, v.dy);
            return;
        }
        if (mode === "air") {
            this.fly(me, v);
            overlay();
            return;
        }
        if (mode === "edge") {
            this.steadyOnEdge(me, cur);
            if (v && v.adx < cfg.shoot.max) this.aim(v.dx, v.dy);
            return;
        }
        if (me.reacting(now)) {
            if (this.base === "safe") this.inward(me, cur);
            else this.survive(me, cur, this.base);
            if (v && v.adx < cfg.shoot.max) this.aim(v.dx, v.dy);
            return;
        }
        if (this.base !== "safe") {
            this.survive(me, cur, this.base);
            overlay();
            return;
        }

        if (this.fleeBreakable(me, cur)) {
            overlay();
            return;
        }

        if (!foe) {
            this.navigate(me, cur, this.highest(cur));
            return;
        }
        const { dx, dy, adx, dir } = v;
        const foePos = foe.torso.GetPosition();
        const near = adx < cfg.blockRange && Math.abs(dy) < cfg.melee.vertical + 0.3;
        const threatened = near && foe.side * dx < 0;
        this.watchThreat(foe, now);
        if (threatened && (this.defend(me, foe, cur, dir, now) || (this.defends && foe.attack !== null))) {
            this.aim(dx, dy);
            return;
        }
        if (this.melee(me, foe, cur, adx, dx, dy, dir, now)) return;
        const foeTop = foeNode === null ? foePos.get_y() - this.offsetY : this.nav.nodes[foeNode].top;
        this.move(game, me, foe, cur, foeNode, foeTop, adx, dx, dy, dir, now);
        this.fight(me, foe, cur, foeNode, adx, dx, dy, now);
    }

    /** Plataforma de apoyo del robot si está apoyado y sin subir; `null` en el aire o saltando. */
    currentSupport(me) {
        return me.grounded && me.torso.GetLinearVelocity().get_y() < 1 ? this.supportOf(me) : null;
    }

    /** Anota cuándo el robot perdió vida o quedó mojado o quemado (para la evasión) y cuándo lo golpearon o lo aturdieron (para el borde). */
    watchHurt(me, now) {
        const status = me.wet || me.burns.size > 0;
        const hit = this.lastHp !== null && me.hp < this.lastHp;
        if (status || hit) this.hurtAt = now;
        if (hit || me.reacting(now) || me.isStunned(now)) this.struckAt = now;
        this.lastHp = me.hp;
    }

    /**
     * Percepción de la inundación: nivel del agua local, velocidad de cierre (agua base + bajada del mapa), línea segura
     * (`minTop`, local), último tope de apoyo y holgura (tope de apoyo, o los pies si caen por debajo, menos el agua local).
     */
    sense(game, me, cur, mx) {
        const level = this.floodLevel(game, mx);
        this.closing = this.baseSpeed(game) + this.scroll;
        this.minTop = this.safeLine(game, level) - this.offsetY;
        if (cur !== null) this.supportTop = this.nav.nodes[cur].top;
        const low = me.lowestPoint() - this.offsetY;
        const reference = cur !== null ? this.supportTop : Math.min(this.supportTop ?? low, low);
        this.clearance = reference - (level - this.offsetY);
    }

    /**
     * Máquina de estados de supervivencia: el único lugar donde cambia `mode`. `base` sale de la holgura (`survivalMode`);
     * `air` si está en el aire; `edge` si está apoyado con el torso fuera de la plataforma, o cerca de un borde (menos de
     * `survival.edge.guard`) dentro de la ventana `evade` tras un golpe o aturdimiento, y sin bajada elegida; `recover` el frame en que
     * aterriza en otra plataforma que la elegida (recalcula la ruta). No depende de la dificultad ni de la demora de reacción.
     */
    transition(me, cur, now) {
        const survival = this.config.survival;
        const base = survivalMode(this.clearance, this.closing, survival);
        this.base = base;
        this.riskMin = base === "panic" ? 0 : survival.risk.min;
        if (base === "safe") this.refuge = null;
        const vy = me.torso.GetLinearVelocity().get_y();
        const airborne = cur === null && (!me.grounded || vy >= 1);
        let mode = base;
        if (airborne) {
            mode = "air";
        } else if (cur === null) {
            mode = "edge";
        } else if (this.wasAir && this.committed !== null && cur !== this.committed) {
            mode = "recover";
            this.replanAt = 0;
            this.goal = null;
        } else if (base === "safe" && now - this.struckAt <= this.config.evade && !this.dropChosen(cur)) {
            const x = me.torso.GetPosition().get_x();
            if (edgeInward(x, this.nav.nodes[cur], survival.edge.guard) !== 0) mode = "edge";
        }
        this.wasAir = airborne;
        this.mode = mode;
        return mode;
    }

    /** Verdadero si el destino ya elegido desde la plataforma `cur` es una bajada (otra plataforma más de `jump.dropBelow` m abajo). */
    dropChosen(cur) {
        const next = this.committed;
        return next !== null && this.nav.nodes[next].top - this.nav.nodes[cur].top < this.config.jump.dropBelow;
    }

    /** Camina hacia adentro de la plataforma `cur` si el torso está a menos de `survival.edge.guard` de un borde. */
    inward(me, cur) {
        if (cur === null) return;
        const dir = edgeInward(me.torso.GetPosition().get_x(), this.nav.nodes[cur], this.config.survival.edge.guard);
        if (dir !== 0) this.walk(dir);
    }

    /** Modo `edge`: con plataforma de apoyo camina hacia adentro; con el torso fuera de ella, hacia la más cercana bajo los pies. */
    steadyOnEdge(me, cur) {
        if (cur !== null) {
            this.inward(me, cur);
            return;
        }
        this.steerInside(me);
    }

    /** Apoyado sin plataforma (torso fuera): camina hacia el centro de la plataforma más cercana a los pies. */
    steerInside(me) {
        const px = me.torso.GetPosition().get_x();
        const node = this.nearestNode(px, me.lowestPoint() - this.offsetY);
        if (node !== null) this.walk(Math.sign((node.minX + node.maxX) / 2 - px) || 1);
    }

    /** Modo `air`: corrige el vuelo hacia el destino y golpea al rival de abajo solo si el aterrizaje es seguro. */
    fly(me, v) {
        const px = me.torso.GetPosition().get_x();
        const landing = this.airControl(me, px);
        if (!v || !landing.safe) return;
        const cfg = this.config.melee;
        if (v.adx >= cfg.airRange || v.dy >= -cfg.airDrop) return;
        this.aim(v.dx, v.dy);
        if (-v.dy >= cfg.kickDrop) this.pad.axes[1] = 1;
        if (Math.sign(v.dx) === me.side) this.pulse(PAD.punch);
    }

    /** Sube (`climb`) o entra en pánico (`panic`) desde la plataforma `cur`; con el torso fuera de ella, vuelve adentro. */
    survive(me, cur, base) {
        if (cur === null) this.steerInside(me);
        else if (base === "panic") this.panic(me, cur);
        else this.escape(me, cur);
    }

    /**
     * Si la plataforma de apoyo ya empezó a romperse (`crack > 0`), salta a una vecina sana y segura
     * (prefiriendo subir). Devuelve verdadero si usó el movimiento.
     */
    fleeBreakable(me, cur) {
        if (cur === null) return false;
        if ((this.nav.nodes[cur].solid?.crack ?? 0) <= 0) return false;
        const { nodes, edges } = this.nav;
        let best = null;
        for (const to of edges[cur]) {
            const n = nodes[to];
            if (isLost(n) || n.top < this.minTop) continue;
            if (best === null || n.top > nodes[best].top) best = to;
        }
        if (best === null) {
            this.desperate(me, cur, true);
            return true;
        }
        this.committed = best;
        this.stepToward(me, nodes[cur], nodes[best], true, true);
        return true;
    }

    /**
     * Capa de movimiento (stick izquierdo) con la plataforma sobre la línea segura: evadir, buscar un arma y, si no, ir a la meta.
     * En Infinito (`game.climbing`) la meta es la plataforma más alta alcanzable y solo persigue al rival si su plataforma
     * está sobre la línea segura y está dentro de `engage` (aunque haya que bajar); en el clásico persigue siempre.
     */
    move(game, me, foe, cur, foeNode, foeTop, adx, dx, dy, dir, now) {
        if (this.evade(me, cur, dir, now)) return;
        if (this.seekPickup(me, cur, game.pickups ?? [])) return;
        if (foeTop < this.minTop) {
            this.navigate(me, cur, this.highest(cur));
            return;
        }
        if (game.climbing && !this.engages(adx, dy)) {
            this.navigate(me, cur, this.highest(cur));
            return;
        }
        this.chase(me, foe, cur, adx, dx, dy, dir, now);
    }

    /** Verdadero si el rival está a `engage.dx` m o menos en horizontal y a `engage.dy` m o menos en vertical (módulos). */
    engages(adx, dy) {
        const { dx, dy: maxDy } = this.config.engage;
        return adx <= dx && Math.abs(dy) <= maxDy;
    }

    /**
     * Tras recibir daño o líquido en la ventana `evade`: salta a la plataforma de arriba más alta que tenga una arista
     * desde la actual o, si no hay, rueda alejándose del rival. Devuelve verdadero si usó el movimiento.
     */
    evade(me, cur, dir, now) {
        if (cur === null || now - this.hurtAt > this.config.evade) return false;
        const { nodes, edges } = this.nav;
        let up = null;
        for (const to of edges[cur]) {
            if (nodes[to].top <= nodes[cur].top || nodes[to].top < this.minTop) continue;
            if (up === null || nodes[to].top > nodes[up].top) up = to;
        }
        if (up !== null) {
            this.navigate(me, cur, up);
            return true;
        }
        if (!this.canRoll(me, cur, -dir, now)) return false;
        this.press(PAD.block);
        this.walk(-dir);
        this.pulse(PAD.jump);
        return true;
    }

    /**
     * Línea segura (m): nivel del agua + `survival.climb.margin` + velocidad de cierre × `survival.climb.lead`; `-Infinity` sin inundación.
     */
    safeLine(game, level) {
        const { margin, lead } = this.config.survival.climb;
        return level + margin + (this.baseSpeed(game) + this.scroll) * lead;
    }

    /** Velocidad base (m/s) del agua, sin el alcance: `baseRiseSpeed` de la inundación de Infinito o, en el clásico, `riseSpeed`. */
    baseSpeed(game) {
        const { flood } = game;
        return flood.baseRiseSpeed ?? flood.riseSpeed ?? flood.config?.riseSpeed ?? 0;
    }

    /**
     * Sube desde una plataforma bajo la línea segura (`climb`): va a la más cercana (en costo) que esté sobre la línea, o a la más
     * alta alcanzable si ninguna llega; en este tramo puede pasar por plataformas bajo la línea.
     */
    escape(me, cur) {
        const line = this.minTop;
        this.minTop = -Infinity;
        const dist = this.distances(cur);
        const { nodes } = this.nav;
        const kept = this.refuge;
        let best = kept !== null && kept !== cur && dist[kept] !== Infinity && nodes[kept].top >= line ? kept : null;
        if (best === null) {
            nodes.forEach((n, i) => {
                if (dist[i] === Infinity || n.top < line || n.top < nodes[cur].top) return;
                if (best === null || dist[i] < dist[best] || (dist[i] === dist[best] && n.top > nodes[best].top)) best = i;
            });
        }
        const goal = best ?? this.highest(cur);
        this.refuge = goal === cur ? null : goal;
        if (goal === cur) this.desperate(me, cur, false);
        else this.navigate(me, cur, goal);
        this.minTop = line;
    }

    /**
     * Pánico: sin importar el margen de los saltos, va a la plataforma alcanzable más cercana (por costo de ruta, que es el tiempo de
     * llegada) con el tope más alto que la actual; si no hay, a una de su nivel que tenga salida hacia arriba; y si el grafo no
     * ofrece ninguna, `desperate`. Nunca queda quieto.
     */
    panic(me, cur) {
        const line = this.minTop;
        this.minTop = -Infinity;
        const { dist } = this.search(cur);
        const { nodes, edges } = this.nav;
        const top = nodes[cur].top;
        const kept = this.refuge;
        let best = kept !== null && kept !== cur && dist[kept] !== Infinity && nodes[kept].top > top + EPS ? kept : null;
        if (best === null) {
            nodes.forEach((n, i) => {
                if (dist[i] === Infinity || n.top <= top + EPS) return;
                if (best === null || dist[i] < dist[best]) best = i;
            });
        }
        if (best === null) {
            nodes.forEach((n, i) => {
                if (i === cur || dist[i] === Infinity || Math.abs(n.top - top) > SAME_LEVEL) return;
                if (!edges[i].some((j) => nodes[j].top > n.top + EPS)) return;
                if (best === null || dist[i] < dist[best]) best = i;
            });
        }
        this.refuge = best;
        if (best === null) this.desperate(me, cur, false);
        else this.navigate(me, cur, best);
        this.minTop = line;
    }

    /**
     * Salto de desesperación: sin ruta en el grafo, va por geometría a la plataforma más cercana por encima de la actual
     * (hueco horizontal y vertical desde el torso) y salta; con `force` salta ya aunque no esté en el punto de despegue.
     * Sin ninguna por encima, camina hacia el centro de la actual y salta.
     */
    desperate(me, cur, force) {
        const a = this.nav.nodes[cur];
        const px = me.torso.GetPosition().get_x();
        const py = me.torso.GetPosition().get_y() - this.offsetY;
        let target = null;
        let bestDistance = Infinity;
        this.nav.nodes.forEach((n, i) => {
            if (isLost(n) || n.top <= a.top + EPS) return;
            const distance = Math.hypot(Math.max(0, n.minX - px, px - n.maxX), n.top - py);
            if (distance < bestDistance) {
                bestDistance = distance;
                target = i;
            }
        });
        if (target === null) {
            this.walkTo(px, (a.minX + a.maxX) / 2);
            if (me.grounded) this.pulse(PAD.jump);
            return;
        }
        this.committed = target;
        this.stepToward(me, a, this.nav.nodes[target], force);
    }

    /**
     * Anota cuándo el rival arranca un golpe (cambio de ataque) y sortea la demora de reacción; si no venía de un golpe
     * anterior del combo, sortea además si la defensa acierta.
     */
    watchThreat(foe, now) {
        const attack = foe.attack;
        if (attack === this.threat) return;
        const previous = this.threat;
        this.threat = attack;
        if (attack === null) return;
        const cfg = this.config;
        this.threatAt = now;
        this.threatDelay = cfg.reaction[0] + this.rng() * (cfg.reaction[1] - cfg.reaction[0]);
        if (previous === null) this.defends = this.rng() < cfg.defense;
    }

    /**
     * Bloquea (o rueda hacia atrás si el golpe rompe la guardia) ante un golpe del rival a menos de `blockRange`.
     * Devuelve verdadero si se ocupó del frame.
     */
    defend(me, foe, cur, dir, now) {
        const hold = this.config.blockHold;
        if (foe.attack !== null && this.defends && now - this.threatAt >= this.threatDelay && me.grounded) {
            const row = foe.rig.melee.attacks[foe.attack];
            if (row?.breaksGuard && this.canRoll(me, cur, -dir, now)) {
                this.press(PAD.block);
                this.walk(-dir);
                this.pulse(PAD.jump);
                this.blockUntil = now + hold;
                return true;
            }
            this.blockUntil = now + hold;
        }
        if (now < this.blockUntil && me.grounded) {
            this.press(PAD.block);
            return true;
        }
        return false;
    }

    canRoll(me, cur, dir, now) {
        if (cur === null || now < me.rollReadyAt || me.attack !== null || me.framesGrounded <= 5) return false;
        const end = me.torso.GetPosition().get_x() + dir * this.config.rollRoom;
        const node = this.nav.nodes[cur];
        return end > node.minX + 0.2 && end < node.maxX - 0.2;
    }

    /**
     * Golpes parado: combo y rueda hacia atrás con poca vida. No arranca ni continúa un golpe si el paso adelante lo saca de
     * la plataforma (`survival.edge.lungeRoom`). Devuelve verdadero si usó el frame.
     */
    melee(me, foe, cur, adx, dx, dy, dir, now) {
        const cfg = this.config.melee;
        if (!me.grounded) return false;
        const fits = () => cur === null || lungeFits(me.torso.GetPosition().get_x(), me.side, this.nav.nodes[cur], this.config.survival.edge.lungeRoom);
        if (me.attack !== null) {
            const row = me.rig.melee.attacks[me.attack];
            this.aim(dx, dy);
            const connected = me.attackHit && (foe.isStunned(now) || foe.blocking);
            if (connected && me.nextAttack === null && now - me.attackStart >= row.active[0] && fits()) this.pulse(PAD.punch);
            return true;
        }
        if (adx > cfg.range || Math.abs(dy) > cfg.vertical) return false;
        this.aim(dx, dy);
        if (me.hp < this.config.lowHp && foe.attack === null && this.canRoll(me, cur, -dir, now)) {
            this.press(PAD.block);
            this.walk(-dir);
            this.pulse(PAD.jump);
            return true;
        }
        if (now >= me.meleeReadyAt && Math.sign(dx) === me.side) {
            if (!fits()) return false;
            this.pulse(PAD.punch);
        }
        return true;
    }

    /** Nivel del agua (m) donde está el robot; `-Infinity` si no hay inundación. */
    floodLevel(game, x) {
        const { flood, water } = game;
        if (!flood.active) return -Infinity;
        const wet = water.depthAt(x) > water.config.hDry ? water.surfaceAt(x) : -Infinity;
        return Math.max(flood.level, wet);
    }

    /** Verdadero si algún tanque del inventario tiene partículas. */
    armed(me) {
        for (const tank of me.tanks.values()) if (tank > 0) return true;
        return false;
    }

    /** Nodo de la plataforma que sostiene el punto de aparición `point` (la más alta bajo él, a menos de 1,2 m), o `null`. */
    pickupNode(point) {
        let best = null;
        this.nav.nodes.forEach((n, i) => {
            if (point.x < n.minX || point.x > n.maxX || n.top > point.y || point.y - n.top > PICKUP_ABOVE) return;
            if (best === null || n.top > this.nav.nodes[best].top) best = i;
        });
        return best;
    }

    /**
     * Sin arma o con los tanques vacíos (puntos de arma), o con salud menor que `repairHp` (puntos de reparación), va al
     * punto de aparición listo más barato de la ruta cuyo nodo esté sobre la línea segura y a `pickupReach` aristas o menos. Devuelve verdadero si usó el frame.
     */
    seekPickup(me, cur, points) {
        const wantsWeapon = !this.armed(me);
        const wantsRepair = me.hp < this.config.repairHp;
        if (cur === null || !(wantsWeapon || wantsRepair)) return false;
        const { dist, parent } = this.search(cur);
        let best = null;
        let lower = null;
        for (const point of points) {
            if (!point.active || !(point.kind === "repair" ? wantsRepair : wantsWeapon)) continue;
            const node = this.pickupNode(point);
            if (node === null || dist[node] === Infinity) continue;
            let hops = 0;
            for (let n = node; parent[n] !== -1; n = parent[n]) hops++;
            if (hops > this.config.pickupReach) continue;
            const isLower = this.nav.nodes[node].top < this.nav.nodes[cur].top - 1e-9;
            const slot = isLower ? lower : best;
            if (slot === null || dist[node] < slot.cost) {
                const found = { point, node, cost: dist[node] };
                if (isLower) lower = found;
                else best = found;
            }
        }
        best ??= lower;
        if (best === null) return false;
        if (best.node === cur) this.walkWithin(cur, me.torso.GetPosition().get_x(), best.point.x);
        else this.navigate(me, cur, best.node);
        return true;
    }

    /**
     * Capa de combate (stick derecho y gatillo), superpuesta al movimiento: con línea de vista a distancia media apunta y
     * dispara en ráfagas de `burst` s con `burstCooldown` s entre ráfagas, sin gastar la `reserve` del tanque salvo con
     * el rival a menos de `reserveRange`.
     */
    fight(me, foe, cur, foeNode, adx, dx, dy, now) {
        const cfg = this.config.shoot;
        if (adx > cfg.max) return;
        if (adx < cfg.min && cur !== null && cur === foeNode) return;
        const tank = me.tanks.get(me.weapon) ?? 0;
        if (tank <= 0) return;
        if (!this.lineOfSight(me, foe)) return;
        if (now - this.aimStamp >= cfg.aimRefresh) {
            this.aimOffset = (this.rng() * 2 - 1) * cfg.aimError;
            this.aimStamp = now;
        }
        const sign = Math.sign(dx) || 1;
        const lift = this.lift(adx, dy, weaponById(me.weapon)?.speed ?? 14);
        const angle = Math.atan2(dy + lift, adx) + this.aimOffset;
        this.aim(sign * Math.cos(angle), Math.sin(angle));
        if (Math.hypot(adx, dy) >= this.config.reserveRange && tank <= this.config.reserve * weaponById(me.weapon).tank) return;
        if (now >= this.burstUntil && now >= this.burstReadyAt) {
            this.burstUntil = now + this.config.burst;
            this.burstReadyAt = this.burstUntil + this.config.burstCooldown;
        }
        if (now < this.burstUntil) this.press(PAD.fire);
    }

    /** Elevación (m) que compensa la caída del chorro a `distance` horizontal con velocidad `speed`. */
    lift(distance, dy, speed) {
        let lift = 0;
        for (let i = 0; i < 3; i++) {
            const angle = Math.atan2(dy + lift, distance);
            const t = distance / (speed * Math.cos(angle));
            lift = 0.5 * GRAVITY * t * t;
        }
        return lift;
    }

    lineOfSight(me, foe) {
        const a = me.torso.GetPosition();
        const b = foe.torso.GetPosition();
        const hit = this.raycaster.cast(a.get_x(), a.get_y(), b.get_x(), b.get_y(), me.ownBodies);
        return hit !== null && foe.ownBodies.has(hit.bodyPtr);
    }

    /**
     * Elige el arma por la cruceta (la misma acción de cambio directo del jugador). Un tanque que pasó a estar lleno
     * (arma recién recogida) se equipa enseguida y la más reciente gana; con el tanque equipado vacío elige al azar,
     * con `rng`, entre las que tienen carga. Sin armas cargadas no hace nada.
     */
    pickWeapon(me) {
        const seen = this.tankSeen;
        this.tankSeen = new Map(WEAPONS.map((w) => [w.id, me.tanks.get(w.id) ?? 0]));
        if (seen !== null) {
            for (const w of WEAPONS) if (this.tankSeen.get(w.id) > seen.get(w.id) && this.tankSeen.get(w.id) >= w.tank) this.weaponTarget = w.id;
        }
        if (this.weaponTarget !== null && (this.weaponTarget === me.weapon || this.tankSeen.get(this.weaponTarget) <= 0)) this.weaponTarget = null;
        if (this.weaponTarget === null && (this.tankSeen.get(me.weapon) ?? 0) <= 0) {
            const loaded = WEAPONS.filter((w) => this.tankSeen.get(w.id) > 0);
            if (loaded.length > 0) this.weaponTarget = loaded[Math.floor(this.rng() * loaded.length)].id;
        }
        if (this.weaponTarget !== null) this.pulse(PAD.weapons[WEAPONS.findIndex((w) => w.id === this.weaponTarget)]);
    }

    /** Se acerca al rival (en su plataforma, o por la ruta hasta la plataforma que elige). */
    chase(me, foe, cur, adx, dx, dy, dir, now) {
        const cfg = this.config;
        if (adx < cfg.melee.airRange + 1) this.aim(dx, dy);
        const px = me.torso.GetPosition().get_x();
        if (cur !== null && this.foeNode === cur) {
            if (adx > cfg.melee.stop) this.walkWithin(cur, px, px + dx - dir * cfg.melee.stop);
            return;
        }
        if (cur !== null && now >= this.replanAt) {
            this.goal = this.pickGoal(cur, foe);
            this.replanAt = now + cfg.replan;
        }
        this.navigate(me, cur, this.goal);
    }

    /** Plataforma alcanzable que más conviene: cerca del rival y de preferencia más alta que él. */
    pickGoal(cur, foe) {
        const dist = this.distances(cur);
        const fx = foe.torso.GetPosition().get_x();
        const fy = this.foeNode === null ? foe.torso.GetPosition().get_y() - this.offsetY : this.nav.nodes[this.foeNode].top;
        let best = cur;
        let bestScore = -Infinity;
        this.nav.nodes.forEach((n, i) => {
            if (dist[i] === Infinity) return;
            const h = Math.max(0, n.minX - fx, fx - n.maxX);
            const score = -h + (n.top >= fy + 0.8 ? this.config.highBonus : 0) - dist[i] * this.config.hopCost;
            if (score > bestScore) {
                bestScore = score;
                best = i;
            }
        });
        return best;
    }

    /** Índice de la plataforma más alta alcanzable desde `from` (la misma si no hay ninguna; `null` en el aire). */
    highest(from) {
        if (from === null) return null;
        const dist = this.distances(from);
        let best = from;
        this.nav.nodes.forEach((n, i) => {
            if (dist[i] !== Infinity && n.top > this.nav.nodes[best].top) best = i;
        });
        return best;
    }

    /**
     * Costo mínimo de ruta desde `from` a cada nodo (`Infinity` si no se llega). No pasa por nodos con tope bajo
     * `minTop` (la línea segura).
     */
    distances(from) {
        return this.search(from).dist;
    }

    /**
     * Ruta de menor costo desde `from` (Dijkstra sobre `nav.costs`): `{ dist, parent }` por nodo. Descarta las aristas con margen
     * bajo `riskMin` salvo la única salida hacia arriba de una plataforma (`dijkstra`) y, si aun así no se llega a ninguna más alta que `from`, todas.
     * Se calcula una vez por frame para cada combinación de `from`, `minTop` y `riskMin`.
     */
    search(from) {
        const key = `${from}|${this.minTop}|${this.riskMin}`;
        if (this.cache !== null && this.cache.frame === this.frame && this.cache.key === key) return this.cache.result;
        let result = this.dijkstra(from, this.riskMin);
        if (this.riskMin > 0) {
            const { nodes } = this.nav;
            const up = nodes.some((n, i) => result.dist[i] !== Infinity && n.top > nodes[from].top + EPS);
            if (!up) result = this.dijkstra(from, 0);
        }
        this.cache = { frame: this.frame, key, result };
        return result;
    }

    /** Dijkstra desde `from` sin pasar por nodos bajo `minTop` ni por aristas con margen menor que `minMargin`, salvo los saltos hacia arriba desde una plataforma que no tiene ninguno con margen suficiente (su única salida hacia arriba). */
    dijkstra(from, minMargin) {
        const { nodes, edges, costs, margins } = this.nav;
        const dist = nodes.map(() => Infinity);
        const parent = nodes.map(() => -2);
        const done = nodes.map(() => false);
        const safeUp = nodes.map((a, i) => edges[i].some((to, k) => !isLost(nodes[to]) && margins[i][k] >= minMargin && nodes[to].top > a.top + EPS));
        dist[from] = 0;
        parent[from] = -1;
        for (;;) {
            let node = -1;
            for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (node < 0 || dist[i] < dist[node])) node = i;
            if (node < 0) break;
            done[node] = true;
            edges[node].forEach((to, k) => {
                if (isLost(nodes[to]) || nodes[to].top < this.minTop || dist[node] + costs[node][k] >= dist[to]) return;
                const rising = nodes[to].top > nodes[node].top + EPS;
                if (margins[node][k] < minMargin && !(rising && !safeUp[node])) return;
                dist[to] = dist[node] + costs[node][k];
                parent[to] = node;
            });
        }
        return { dist, parent };
    }

    /** Primer nodo de la ruta de menor costo de `from` a `goal`, o -1 si no hay. */
    nextStep(from, goal) {
        const { parent } = this.search(from);
        if (parent[goal] === -2) return -1;
        let node = goal;
        while (parent[node] !== from) node = parent[node];
        return node;
    }

    /**
     * Plataforma sobre la que está parado el robot (pies a la altura de su tope), o `null` si está en el aire. Apoyado cuenta
     * hasta `survival.edge.guard` m de torso fuera del borde (con los pies en la orilla); en el aire, hasta 0,3 m.
     */
    supportOf(player) {
        const x = player.torso.GetPosition().get_x();
        const low = player.lowestPoint() - this.offsetY;
        const slack = player.grounded ? this.config.survival.edge.guard : 0.3;
        let best = null;
        this.nav.nodes.forEach((n, i) => {
            if (n.solid?.broken || x < n.minX - slack || x > n.maxX + slack || Math.abs(low - n.top) > 0.35) return;
            if (best === null || n.top > this.nav.nodes[best].top) best = i;
        });
        return best;
    }

    /** Camina hacia `x` sin pasar de los bordes de la plataforma `node`. */
    walkWithin(node, px, x) {
        const n = this.nav.nodes[node];
        this.walkTo(px, clamp(x, n.minX + this.config.edgeMargin, n.maxX - this.config.edgeMargin));
    }

    /**
     * Va hasta la plataforma `goal` por la ruta del grafo: camina hasta el punto de salto y salta, se deja caer de un
     * borde o baja con abajo + A desde una atravesable. En el aire corrige hacia el destino sin soltar el stick hasta
     * estar sobre él; apoyado, nunca usa el control de aire.
     */
    navigate(me, cur, goal) {
        const px = me.torso.GetPosition().get_x();
        if (cur === null) {
            if (me.grounded) this.steerInside(me);
            else this.airControl(me, px);
            return;
        }
        if (goal === null || goal === cur) return;
        const next = this.nextStep(cur, goal);
        if (next < 0) return;
        this.committed = next;
        this.stepToward(me, this.nav.nodes[cur], this.nav.nodes[next], false, this.base === "panic");
    }

    /** Un paso de la ruta de la plataforma `a` a la `b`: alinearse y saltar en vertical, o caminar al borde y saltar o dejarse caer. Con `force`, salta aunque no esté en el punto de despegue; con `rush` (pánico), salta en vertical sin esperar a que baje la velocidad horizontal. */
    stepToward(me, a, b, force, rush = false) {
        const px = me.torso.GetPosition().get_x();
        const jump = this.config.jump;
        const lo = Math.max(a.minX, b.minX);
        const hi = Math.min(a.maxX, b.maxX);
        const overlap = hi - lo > 2 * jump.inset;
        const dy = b.top - a.top;
        const py = me.torso.GetPosition().get_y() - this.offsetY;
        const foe = this.foeAt;
        const covered = foe !== null && Math.abs(foe.x - px) < jump.foeClear.dx && foe.y - py > 0.5 && foe.y - py < jump.foeClear.dy;
        const left = lo + jump.inset;
        const right = hi - jump.inset;
        const center = covered ? (Math.abs(left - foe.x) > Math.abs(right - foe.x) ? left : right) : (lo + hi) / 2;
        if (overlap) {
            if (Math.abs(px - center) > jump.align) {
                this.walkTo(px, center);
            } else if (dy < 0 && a.oneWay) {
                this.pad.axes[1] = 1;
                this.pulse(PAD.jump);
            } else if (dy >= 0 && (force || rush || Math.abs(me.torso.GetLinearVelocity().get_x()) <= jump.settle)) {
                this.pulse(PAD.jump);
            }
            return;
        }
        const dir = Math.sign((b.minX + b.maxX) / 2 - px) || 1;
        this.walk(dir);
        if (dy < jump.dropBelow) return;
        const dist = Math.max(0, b.minX - px, px - b.maxX);
        const edge = dir > 0 ? a.maxX - px : px - a.minX;
        if (me.grounded && (force || dist <= jump.distance || edge <= jump.edge)) this.pulse(PAD.jump);
    }

    /**
     * En el aire: empuja hacia el destino comprometido (o, sin él o si ya cae bajo su tope, hacia `landingNode`) hasta estar dentro de él y ahí suelta el
     * stick. Devuelve `{ index, safe }` del destino (`safe`: queda sobre la línea segura).
     */
    airControl(me, px) {
        let dest = this.committed;
        let safe = false;
        const low = me.lowestPoint() - this.offsetY;
        const vy = me.torso.GetLinearVelocity().get_y();
        if (dest !== null && (isLost(this.nav.nodes[dest]) || (vy < 0 && this.nav.nodes[dest].top > low + LANDING_SLACK))) dest = null;
        if (dest === null) {
            const landing = landingNode(this.nav.nodes, px, low, vy, this.minTop);
            if (landing.index === null) return landing;
            dest = landing.index;
            safe = landing.safe;
        } else {
            safe = this.nav.nodes[dest].top >= this.minTop;
        }
        const n = this.nav.nodes[dest];
        const center = (n.minX + n.maxX) / 2;
        const lo = Math.min(n.minX + this.config.jump.inset, center);
        const hi = Math.max(n.maxX - this.config.jump.inset, center);
        if (px < lo) this.walk(1);
        else if (px > hi) this.walk(-1);
        return { index: dest, safe };
    }
}
