/**
 * Partida de bots en Infinito sobre la escena real con LiquidFun, para medir la supervivencia (#174). `runBots` corre hasta
 * `seconds` s de partida o el fin de la ronda y devuelve:
 * - `kills`: cada ahogo, `provoked` si el robot estuvo noqueado, aturdido o levantándose, o recibió un golpe
 *   o líquido del rival en los `KO_WINDOW` s anteriores (si no, es un suicidio);
 * - `idle`: por robot con bot, la racha más larga (s) apoyado y libre con el stick en 0 sin saltar, golpear ni bloquear,
 *   en modo `climb` y en `panic` o con menos de `PANIC_CLEARANCE` m de holgura;
 * - `jumps`: saltos de ruta (despegue apretando el salto con un destino elegido en `safe` o `climb`) y cuántos aterrizaron en
 *   la plataforma elegida o más arriba (se descartan los golpeados en el aire);
 * - `unchosenFalls`: caídas a una plataforma más baja (sin salto, sin impulso hacia arriba y sin destino elegido), después de un golpe recibido apoyado, con el stick en 0 más de
 *   `STICK_ZERO` s desde que terminó el aturdimiento;
 * - `maxHeight`: la mayor altura local del torso de cada robot.
 */
import { loadGame } from "./game.js";

export const KO_WINDOW = 3;
export const PANIC_CLEARANCE = 2.5;
export const STICK_ZERO = 0.3;
const FALL_WINDOW = 6;
const LAND_TOLERANCE = 0.35;
const FALL_DROP = 0.5;
const noop = () => {};

/**
 * @param {object} options
 * @param {number} options.seed Semilla del mapa y de los bots.
 * @param {string} [options.difficulty] Dificultad del menú.
 * @param {number} [options.seconds] Duración máxima de la partida, s.
 * @param {string} [options.bots] Valor de `?bot=` (`"1,2"` o `"2"`).
 * @param {boolean} [options.immortalFirst] J1 quieto e inmortal (sin bot).
 */
export async function runBots({ seed, difficulty = "normal", seconds = 120, bots: botParam = "1,2", immortalFirst = false }) {
    globalThis.location = { search: `?bot=${botParam}&seed=${seed}` };
    const game = await loadGame({ map: "infinite" });
    const state = game.state;
    if (difficulty !== "normal") {
        state.menu.values.difficulty = difficulty;
        state.arrancarPartida();
        state.match.state = "playing";
    }
    const { players, bots, match, melee, damage } = state;
    if (immortalFirst) Object.assign(players[0], { drown: noop, hurt: noop, burn: noop, takeDamage: noop });
    const ks = [...bots.keys()];
    let frames = 0;
    const time = () => frames / 60;
    const lastHurt = players.map(() => -Infinity);
    const struck = players.map(() => null);
    const pushEvent = melee.events.push.bind(melee.events);
    melee.events.push = (...items) => {
        for (const e of items) {
            if (e.kind !== "hit" && e.kind !== "blockBreak") continue;
            lastHurt[e.victim] = time();
            if (players[e.victim].grounded) struck[e.victim] = { at: time(), stunEnd: null, zeroSince: null, counted: false };
        }
        return pushEvent(...items);
    };
    const pushFluid = damage.fluidHits.push.bind(damage.fluidHits);
    damage.fluidHits.push = (...items) => {
        for (const item of items) if (item.shot && item.shot.owner !== item.owner.index) lastHurt[item.owner.index] = time();
        return pushFluid(...items);
    };

    const kills = [];
    const seen = players.map(() => false);
    const disabledAt = players.map(() => -Infinity);
    const idle = Object.fromEntries(ks.map((k) => [k, { climb: 0, panic: 0 }]));
    const streak = Object.fromEntries(ks.map((k) => [k, { climb: 0, panic: 0 }]));
    const jumps = { total: 0, ok: 0, failures: [] };
    const flight = Object.fromEntries(ks.map((k) => [k, null]));
    const wasGrounded = players.map(() => true);
    const lastJump = players.map(() => -Infinity);
    const unchosenFalls = [];
    const pendingFall = players.map(() => null);
    const supportTop = players.map(() => null);
    const maxHeight = players.map(() => -Infinity);

    while (frames < seconds * 60 && match.state === "playing") {
        game.frame();
        frames++;
        const t = time();
        players.forEach((p, k) => {
            maxHeight[k] = Math.max(maxHeight[k], p.torso.GetPosition().get_y() - state.climb.offsetY);
            if (p.drowned && !seen[k]) {
                seen[k] = true;
                kills.push({ k, at: t, provoked: t - disabledAt[k] <= KO_WINDOW || t - lastHurt[k] <= KO_WINDOW });
            }
            if (!p.drowned && (p.knockedOut || p.isStunned() || p.recovering())) disabledAt[k] = t;
        });
        for (const k of ks) {
            const p = players[k];
            const bot = bots.get(k);
            if (p.dead || p.knockedOut) {
                flight[k] = null;
                streak[k].climb = 0;
                streak[k].panic = 0;
                continue;
            }
            const pad = bot.pad;
            const jumpPressed = pad.buttons[0].pressed;
            if (jumpPressed) lastJump[k] = t;
            const free = !p.isStunned() && !p.reacting() && !p.rolling() && !p.recovering() && p.attack === null && !p.blocking;
            const still = p.grounded && free && pad.axes[0] === 0 && ![0, 1, 2].some((b) => pad.buttons[b].pressed);
            streak[k].climb = still && bot.base === "climb" ? streak[k].climb + 1 / 60 : 0;
            streak[k].panic = still && (bot.base === "panic" || bot.clearance < PANIC_CLEARANCE) ? streak[k].panic + 1 / 60 : 0;
            idle[k].climb = Math.max(idle[k].climb, streak[k].climb);
            idle[k].panic = Math.max(idle[k].panic, streak[k].panic);

            const takeoff = wasGrounded[k] && !p.grounded;
            if (takeoff && t - lastJump[k] <= 3 / 60 && bot.committed !== null && (bot.base === "safe" || bot.base === "climb")) {
                const target = bot.nav.nodes[bot.committed];
                if (target) flight[k] = { top: target.top, at: t, hurt: false };
            }
            if (flight[k] !== null) {
                if (lastHurt[k] >= flight[k].at) flight[k].hurt = true;
                if (p.grounded && bot.cur !== null) {
                    if (!flight[k].hurt) {
                        jumps.total++;
                        if (bot.supportTop >= flight[k].top - LAND_TOLERANCE) jumps.ok++;
                        else jumps.failures.push({ k, at: t, wanted: flight[k].top, got: bot.supportTop });
                    }
                    flight[k] = null;
                } else if (t - flight[k].at > 5) {
                    flight[k] = null;
                }
            }

            const s = struck[k];
            if (s !== null) {
                if (s.stunEnd === null && !p.isStunned() && !p.reacting()) {
                    s.stunEnd = t;
                    s.zeroSince = pad.axes[0] === 0 ? t : null;
                }
                if (s.stunEnd !== null) {
                    if (pad.axes[0] !== 0) s.zeroSince = null;
                    else s.zeroSince ??= t;
                    const unchosen = takeoff && t - lastJump[k] > 3 / 60 && bot.committed === null && p.torso.GetLinearVelocity().get_y() < 0.5;
                    if (unchosen && !s.counted && s.zeroSince !== null && t - s.zeroSince > STICK_ZERO && supportTop[k] !== null) {
                        s.counted = true;
                        pendingFall[k] = { from: supportTop[k], at: t, hitAt: s.at };
                    }
                }
                if (t - s.at > FALL_WINDOW) struck[k] = null;
            }
            const fall = pendingFall[k];
            if (fall !== null && p.grounded && bot.cur !== null) {
                if (bot.supportTop < fall.from - FALL_DROP) unchosenFalls.push({ k, at: fall.at, hitAt: fall.hitAt, from: fall.from, to: bot.supportTop });
                pendingFall[k] = null;
            } else if (fall !== null && t - fall.at > 5) {
                pendingFall[k] = null;
            }
            if (p.grounded && bot.cur !== null) supportTop[k] = bot.supportTop;
            wasGrounded[k] = p.grounded;
        }
    }
    globalThis.location = { search: "" };
    return { seconds: time(), kills, idle, jumps, unchosenFalls, maxHeight, game, bots };
}
