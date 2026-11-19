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
 * - `safeMargin` y `safeLead`: con la inundación activa, la línea segura es el nivel del agua + `safeMargin` (m) + la
 *   velocidad de subida × `safeLead` (s); el bot no elige ni cruza plataformas por debajo y, si está debajo, sube;
 *   `edgeMargin`: distancia mínima al borde de una plataforma al caminar sin cruzar;
 * - `reach`: regla de alcance del salto: subir hasta `up.dy` con hueco hasta `up.gap`, o hasta `short.dy` con hueco
 *   hasta `short.gap`; `downGap` es el hueco máximo al bajar o cruzar a nivel;
 * - `through`: subida vertical a través de una plataforma que solapa por encima: `overlap` (m) horizontal mínimo;
 *   `cost`: costo de cada arista del grafo, menor para `through` que para un salto diagonal (`jump`);
 * - `jump`: `distance` (a cuánto del destino salta), `edge` (a cuánto del borde salta aunque esté lejos), `inset` (margen
 *   dentro del destino donde suelta el stick), `dropBelow` (desnivel desde el que ya no salta sino que se deja caer),
 *   `align` (tolerancia al alinearse bajo un destino);
 * - `highBonus`: puntaje extra por una plataforma más alta que el rival; `hopCost`: costo por salto de ruta;
 *   `replan`: cada cuánto reelige destino;
 * - `pickupReach`: sin arma o con los tanques vacíos, aristas máximas de la ruta hasta un punto de aparición para ir a buscarlo.
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
    safeMargin: 4,
    safeLead: 5,
    edgeMargin: 0.5,
    reach: { up: { dy: 3.3, gap: 2 }, short: { dy: 2, gap: 3.5 }, downGap: 3.5 },
    through: { overlap: 1.5 },
    cost: { through: 0.6, jump: 1 },
    jump: { distance: 2.5, edge: 0.6, inset: 0.6, dropBelow: -1, align: 0.3 },
    highBonus: 4,
    hopCost: 0.3,
    replan: 0.5,
    pickupReach: 3,
};

/**
 * Presets de dificultad del menú (#154): `reaction` ([mín, máx], s), `aimError` (rad) y `defense` (probabilidad) que
 * reemplazan esos valores de `BOT`. `normal` es el `BOT` tal cual.
 */
export const DIFFICULTY = {
    easy: { reaction: [0.3, 0.5], aimError: 0.1, defense: 0.4 },
    normal: { reaction: [0.15, 0.35], aimError: 0.05, defense: 0.7 },
    hard: { reaction: [0.1, 0.2], aimError: 0.02, defense: 0.9 },
};

/** Tabla `BOT` con el preset de `difficulty` aplicado (`normal` si no existe). */
export function botConfig(difficulty) {
    const preset = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
    return { ...BOT, reaction: [...preset.reaction], defense: preset.defense, shoot: { ...BOT.shoot, aimError: preset.aimError } };
}

const GRAVITY = 10;

/** Altura máxima (m) de un punto de aparición sobre la plataforma que lo sostiene. */
const PICKUP_ABOVE = 1.2;
const WALK_DEADZONE = 0.15;

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
 * hueco de hasta `downGap`. Una plataforma encima de otra (hueco 0) cuenta como alcanzable si el desnivel entra.
 */
export function buildNav(level = LEVEL, config = BOT) {
    const floorTop = level.pool?.killY ?? -Infinity;
    const nodes = [];
    for (const s of level.solids) {
        if (s.kind !== "floor" && s.kind !== "platform") continue;
        const top = s.y + s.h / 2;
        if (top <= floorTop) continue;
        nodes.push({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, top, oneWay: !!s.oneWay });
    }
    const { up, short, downGap } = config.reach;
    const { through, cost } = config;
    const edges = nodes.map(() => []);
    const costs = nodes.map(() => []);
    nodes.forEach((a, i) => {
        nodes.forEach((b, j) => {
            if (i === j) return;
            const gap = Math.max(0, b.minX - a.maxX, a.minX - b.maxX);
            const dy = b.top - a.top;
            const ok = dy > 0 ? (dy <= up.dy && gap <= up.gap) || (dy <= short.dy && gap <= short.gap) : gap <= downGap;
            if (!ok) return;
            const vertical = dy > 0 && dy <= up.dy && Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) >= through.overlap;
            edges[i].push(j);
            costs[i].push(vertical ? cost.through : cost.jump);
        });
    });
    return { nodes, edges, costs };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Bot de prueba: un gamepad virtual para un jugador (patrón "intención, no dispositivo"). Una vez por frame lee el
 * estado del juego y escribe `pad` (botones y ejes del mapeo "standard") que `Input.setVirtualPad` entrega como si
 * fuera un gamepad real; no toca robots ni física. Solo usa el raycaster del mundo (sin memoria nativa propia).
 * La aleatoriedad (demora de reacción, error de puntería, acierto de defensa) sale de `rng`, que se puede inyectar
 * o derivar de `seed`.
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
        this.replanAt = 0;
    }

    /** Olvida lo percibido y decidido (ronda nueva). */
    reset() {
        this.minTop = -Infinity;
        this.jumping = false;
        this.committed = null;
        this.goal = null;
        this.replanAt = 0;
        this.foeNode = null;
        this.threat = null;
        this.threatAt = 0;
        this.threatDelay = 0;
        this.defends = false;
        this.blockUntil = -Infinity;
        this.aimOffset = 0;
        this.aimStamp = -Infinity;
        this.weaponStamp = -Infinity;
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
     * @param {object} game `{ players, match, flood, water }` del juego.
     * @param {number} now Reloj de simulación, s.
     * @returns {object} El gamepad virtual (el mismo objeto cada vez).
     */
    update(game, now) {
        this.pad.axes.fill(0);
        for (const b of this.pad.buttons) b.pressed = false;
        this.think(game, now);
        this.holdJump(game.players[this.k]);
        this.previous.forEach((_, i) => (this.previous[i] = this.pad.buttons[i].pressed));
        return this.pad;
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

    think(game, now) {
        const me = game.players[this.k];
        if (game.match.state !== "playing" || me.dead) return;
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
        const cur = me.grounded && me.torso.GetLinearVelocity().get_y() < 1 ? this.supportOf(me) : null;
        if (cur !== null) this.committed = null;
        const level = this.floodLevel(game, mx);
        this.minTop = this.safeLine(game, level);
        const below = cur !== null && this.nav.nodes[cur].top < this.minTop;
        if (!foe) {
            if (below) this.escape(me, cur);
            else this.navigate(me, cur, this.highest(cur));
            return;
        }
        const foePos = foe.torso.GetPosition();
        const dx = foePos.get_x() - mx;
        const dy = foePos.get_y() - me.torso.GetPosition().get_y();
        const adx = Math.abs(dx);
        const dir = Math.sign(dx) || me.side;
        const foeNode = this.supportOf(foe);
        if (foeNode !== null) this.foeNode = foeNode;
        const cfg = this.config;

        if (me.isStunned(now) || me.reacting(now) || me.rolling(now)) {
            if (adx < cfg.shoot.max) this.aim(dx, dy);
            return;
        }

        const near = adx < cfg.blockRange && Math.abs(dy) < cfg.melee.vertical + 0.3;
        const threatened = near && foe.side * dx < 0;
        this.watchThreat(foe, now);
        if (threatened && (this.defend(me, foe, cur, dir, now) || (this.defends && foe.attack !== null))) {
            this.aim(dx, dy);
            return;
        }
        if (this.melee(me, foe, cur, adx, dx, dy, dir, now)) return;
        if (below) {
            this.escape(me, cur);
            return;
        }
        if (this.seekPickup(me, cur, game.pickups ?? [])) return;
        if (this.shoot(me, foe, cur, foeNode, adx, dx, dy, now)) return;
        const foeTop = foeNode === null ? foePos.get_y() : this.nav.nodes[foeNode].top;
        if (foeTop < this.minTop) {
            this.navigate(me, cur, this.highest(cur));
            return;
        }
        this.chase(me, foe, cur, adx, dx, dy, dir, now);
    }

    /**
     * Línea segura (m): nivel del agua + `safeMargin` + velocidad de subida × `safeLead`; `-Infinity` sin inundación.
     */
    safeLine(game, level) {
        const rise = game.flood.riseSpeed ?? game.flood.config?.riseSpeed ?? 0;
        return level + this.config.safeMargin + rise * this.config.safeLead;
    }

    /**
     * Sube desde una plataforma bajo la línea segura: va a la más cercana (en saltos) que esté sobre la línea, o a la más
     * alta alcanzable si ninguna llega; en este tramo puede pasar por plataformas bajo la línea.
     */
    escape(me, cur) {
        const line = this.minTop;
        this.minTop = -Infinity;
        const dist = this.distances(cur);
        let best = null;
        this.nav.nodes.forEach((n, i) => {
            if (dist[i] === Infinity || n.top < line) return;
            if (best === null || dist[i] < dist[best] || (dist[i] === dist[best] && n.top > this.nav.nodes[best].top)) best = i;
        });
        this.navigate(me, cur, best ?? this.highest(cur));
        this.minTop = line;
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

    /** Golpes: combo, golpe en el aire y rueda hacia atrás con poca vida. Devuelve verdadero si usó el frame. */
    melee(me, foe, cur, adx, dx, dy, dir, now) {
        const cfg = this.config.melee;
        if (!me.grounded) {
            if (adx >= cfg.airRange || dy >= -cfg.airDrop) return false;
            this.aim(dx, dy);
            if (-dy >= cfg.kickDrop) this.pad.axes[1] = 1;
            this.pulse(PAD.punch);
            return true;
        }
        if (me.attack !== null) {
            const row = me.rig.melee.attacks[me.attack];
            this.aim(dx, dy);
            const connected = me.attackHit && (foe.isStunned(now) || foe.blocking);
            if (connected && me.nextAttack === null && now - me.attackStart >= row.active[0]) this.pulse(PAD.punch);
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
        if (now >= me.meleeReadyAt) this.pulse(PAD.punch);
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
     * Sin arma o con los tanques vacíos, va al punto de aparición listo más barato de la ruta cuyo nodo esté sobre la línea
     * segura y a `pickupReach` aristas o menos. Devuelve verdadero si usó el frame.
     */
    seekPickup(me, cur, points) {
        if (cur === null || this.armed(me)) return false;
        const { dist, parent } = this.search(cur);
        let best = null;
        for (const point of points) {
            if (!point.active) continue;
            const node = this.pickupNode(point);
            if (node === null || dist[node] === Infinity) continue;
            let hops = 0;
            for (let n = node; parent[n] !== -1; n = parent[n]) hops++;
            if (hops > this.config.pickupReach) continue;
            if (best === null || dist[node] < best.cost) best = { point, node, cost: dist[node] };
        }
        if (best === null) return false;
        if (best.node === cur) this.walkWithin(cur, me.torso.GetPosition().get_x(), best.point.x);
        else this.navigate(me, cur, best.node);
        return true;
    }

    /** Dispara con línea de vista a distancia media. Devuelve verdadero si usó el frame. */
    shoot(me, foe, cur, foeNode, adx, dx, dy, now) {
        const cfg = this.config.shoot;
        if (adx > cfg.max) return false;
        if (adx < cfg.min && cur !== null && cur === foeNode) return false;
        if ((me.tanks.get(me.weapon) ?? 0) <= 0) {
            this.pickWeapon(me, now);
            return false;
        }
        if (!this.lineOfSight(me, foe)) return false;
        this.pickWeapon(me, now);
        if (now - this.aimStamp >= cfg.aimRefresh) {
            this.aimOffset = (this.rng() * 2 - 1) * cfg.aimError;
            this.aimStamp = now;
        }
        const sign = Math.sign(dx) || 1;
        const lift = this.lift(adx, dy, weaponById(me.weapon)?.speed ?? 14);
        const angle = Math.atan2(dy + lift, adx) + this.aimOffset;
        this.aim(sign * Math.cos(angle), Math.sin(angle));
        this.press(PAD.fire);
        return true;
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

    /** Equipa el arma con más daño por segundo que tenga tanque, si no es la actual. */
    pickWeapon(me, now) {
        if (now - this.weaponStamp < 0.5) return;
        let best = null;
        WEAPONS.forEach((w, i) => {
            if ((me.tanks.get(w.id) ?? 0) <= 0) return;
            if (best === null || w.dps > WEAPONS[best].dps) best = i;
        });
        if (best === null || WEAPONS[best].id === me.weapon) return;
        this.weaponStamp = now;
        this.pulse(PAD.weapons[best]);
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
        const fy = this.foeNode === null ? foe.torso.GetPosition().get_y() : this.nav.nodes[this.foeNode].top;
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

    /** Ruta de menor costo desde `from` (Dijkstra sobre `nav.costs`): `{ dist, parent }` por nodo. */
    search(from) {
        const { nodes, edges, costs } = this.nav;
        const dist = nodes.map(() => Infinity);
        const parent = nodes.map(() => -2);
        const done = nodes.map(() => false);
        dist[from] = 0;
        parent[from] = -1;
        for (;;) {
            let node = -1;
            for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (node < 0 || dist[i] < dist[node])) node = i;
            if (node < 0) break;
            done[node] = true;
            edges[node].forEach((to, k) => {
                if (nodes[to].top < this.minTop || dist[node] + costs[node][k] >= dist[to]) return;
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

    /** Plataforma sobre la que está parado el robot (pies a la altura de su tope), o `null` si está en el aire. */
    supportOf(player) {
        const x = player.torso.GetPosition().get_x();
        const low = player.lowestPoint();
        let best = null;
        this.nav.nodes.forEach((n, i) => {
            if (x < n.minX - 0.3 || x > n.maxX + 0.3 || Math.abs(low - n.top) > 0.35) return;
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
     * estar sobre él.
     */
    navigate(me, cur, goal) {
        const px = me.torso.GetPosition().get_x();
        if (cur === null) {
            this.airControl(me, px);
            return;
        }
        if (goal === null || goal === cur) return;
        const next = this.nextStep(cur, goal);
        if (next < 0) return;
        this.committed = next;
        const jump = this.config.jump;
        const a = this.nav.nodes[cur];
        const b = this.nav.nodes[next];
        const lo = Math.max(a.minX, b.minX);
        const hi = Math.min(a.maxX, b.maxX);
        const overlap = hi - lo > 2 * jump.inset;
        const dy = b.top - a.top;
        const center = (lo + hi) / 2;
        if (overlap) {
            if (Math.abs(px - center) > jump.align) {
                this.walkTo(px, center);
            } else if (dy < 0 && a.oneWay) {
                this.pad.axes[1] = 1;
                this.pulse(PAD.jump);
            } else if (dy >= 0) {
                this.pulse(PAD.jump);
            }
            return;
        }
        const dir = Math.sign((b.minX + b.maxX) / 2 - px) || 1;
        this.walk(dir);
        if (dy < jump.dropBelow) return;
        const dist = Math.max(0, b.minX - px, px - b.maxX);
        const edge = dir > 0 ? a.maxX - px : px - a.minX;
        if (me.grounded && (dist <= jump.distance || edge <= jump.edge)) this.pulse(PAD.jump);
    }

    /** En el aire: empuja hacia el destino comprometido hasta estar dentro de él y ahí suelta el stick. */
    airControl(me, px) {
        let dest = this.committed;
        if (dest === null) {
            const low = me.lowestPoint();
            let bestGap = Infinity;
            this.nav.nodes.forEach((n, i) => {
                if (n.top > low + 0.3) return;
                const gap = Math.max(0, n.minX - px, px - n.maxX);
                if (gap < bestGap) {
                    bestGap = gap;
                    dest = i;
                }
            });
            if (dest === null) return;
        }
        const n = this.nav.nodes[dest];
        const center = (n.minX + n.maxX) / 2;
        const lo = Math.min(n.minX + this.config.jump.inset, center);
        const hi = Math.max(n.maxX - this.config.jump.inset, center);
        if (px < lo) this.walk(1);
        else if (px > hi) this.walk(-1);
    }
}
