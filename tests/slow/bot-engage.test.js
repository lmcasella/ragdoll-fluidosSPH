/**
 * Bots que se enfrentan en Infinito (#173): bot contra bot sobre la escena real con LiquidFun, semillas 1 a 5, 60 s o hasta
 * que termina la ronda. Cuenta golpes y líquido que recibe cada uno del otro, la distancia vertical entre torsos mientras
 * los dos viven y las muertes por agua: KO si el robot estuvo noqueado, aturdido o levantándose, o recibió un golpe o líquido
 * del rival, en los `KO_WINDOW` s anteriores a morir; suicidio si no. Los suicidios tienen que ser 0 (#174).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "../helpers/game.js";

const SEEDS = [1, 2, 3, 4, 5];
const FRAMES = 60 * 60;
const MAX_DY = 10;
const MIN_HITS = 3;
const MIN_CLOSE_SHARE = 0.8;
const LIQUID_GAP = 0.5;
const KO_WINDOW = 3;

/** Corre una partida de bots en Infinito y devuelve las métricas de la semilla. */
async function measure(seed) {
    globalThis.location = { search: `?bot=1,2&seed=${seed}` };
    const game = await loadGame({ map: "infinite" });
    const { players, match, melee, damage } = game.state;
    let meleeHits = 0;
    let liquidHits = 0;
    let lastLiquid = -Infinity;
    let frames = 0;
    const pushHit = melee.hits.push.bind(melee.hits);
    melee.hits.push = (...items) => {
        meleeHits += items.filter((h) => h.kind === "hit").length;
        return pushHit(...items);
    };
    const lastHurt = [-Infinity, -Infinity];
    const disabledAt = [-Infinity, -Infinity];
    const pushEvent = melee.events.push.bind(melee.events);
    melee.events.push = (...items) => {
        for (const e of items) if (e.kind === "hit" || e.kind === "blockBreak") lastHurt[e.victim] = frames / 60;
        return pushEvent(...items);
    };
    const pushFluid = damage.fluidHits.push.bind(damage.fluidHits);
    damage.fluidHits.push = (...items) => {
        for (const item of items) {
            if (!item.shot || item.shot.owner === item.owner.index) continue;
            const t = frames / 60;
            if (t - lastLiquid >= LIQUID_GAP) liquidHits++;
            lastLiquid = t;
            lastHurt[item.owner.index] = t;
        }
        return pushFluid(...items);
    };
    const kills = [];
    const seen = [false, false];
    let bothAlive = 0;
    let close = 0;
    while (frames < FRAMES && match.state === "playing") {
        game.frame();
        frames++;
        players.forEach((p, k) => {
            if (!p.drowned || seen[k]) return;
            seen[k] = true;
            kills.push({ k, ko: frames / 60 - disabledAt[k] <= KO_WINDOW || frames / 60 - lastHurt[k] <= KO_WINDOW });
        });
        players.forEach((p, k) => {
            if (!p.drowned && (p.knockedOut || p.isStunned() || p.recovering())) disabledAt[k] = frames / 60;
        });
        if (players.some((p) => p.dead)) continue;
        bothAlive++;
        const dy = Math.abs(players[0].torso.GetPosition().get_y() - players[1].torso.GetPosition().get_y());
        if (dy <= MAX_DY) close++;
    }
    globalThis.location = { search: "" };
    const ko = kills.filter((d) => d.ko).length;
    return { seed, seconds: frames / 60, meleeHits, liquidHits, bothAlive, close, ko, suicides: kills.length - ko };
}

test("bot contra bot en Infinito, semillas 1 a 5: se atacan y se mantienen a menos de 10 m de altura", { timeout: 1800000 }, async () => {
    const failures = [];
    let alive = 0;
    let close = 0;
    let suicides = 0;
    for (const seed of SEEDS) {
        const m = await measure(seed);
        alive += m.bothAlive;
        close += m.close;
        suicides += m.suicides;
        const hits = m.meleeHits + m.liquidHits;
        console.log(
            `semilla ${seed}: ${m.seconds.toFixed(1)} s, golpes ${m.meleeHits}, impactos de líquido ${m.liquidHits}, cerca ${m.bothAlive ? ((m.close / m.bothAlive) * 100).toFixed(0) : "-"} %, KO ${m.ko}, suicidios ${m.suicides}`,
        );
        if (hits < MIN_HITS) failures.push(`semilla ${seed}: ${hits} ataques`);
    }
    const share = alive ? close / alive : 0;
    console.log(`distancia vertical <= ${MAX_DY} m: ${(share * 100).toFixed(1)} % del tiempo con los dos vivos; suicidios en total ${suicides}`);
    if (share < MIN_CLOSE_SHARE) failures.push(`cerca ${(share * 100).toFixed(1)} %`);
    if (suicides > 0) failures.push(`${suicides} suicidios`);
    assert.deepEqual(failures, []);
});
