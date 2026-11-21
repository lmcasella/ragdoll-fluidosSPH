/**
 * Supervivencia del bot (#174, #166) en Infinito sobre la escena real con LiquidFun, más las funciones puras del modo de
 * supervivencia. S2: bot contra bot, 0 suicidios (difícil, semillas 1 a 10, 120 s; normal, 1 a 5). S3: `?bot=2` con J1
 * quieto e inmortal, difícil, semillas 1 a 10 (la 8 incluida): J2 vivo a los 180 s y sobre los 60 m locales. S4 a S6 salen de
 * las mismas partidas: rachas de quietud, saltos de ruta que aterrizan donde querían y caídas sin elegir tras un golpe.
 * S7: unitarios de `survivalMode`, `jumpMargin`, `landingNode`, `edgeInward` y `lungeFits`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runBots } from "./helpers/bot-run.js";

const require = createRequire(import.meta.url);
globalThis.Box2D = require("../vendor/liquidfun.js");

const { BOT, buildNav, canReach, edgeInward, jumpMargin, landingNode, lungeFits, survivalMode } = await import("../js/bot.js");
const { LEVEL } = await import("../js/level.js");

const HARD_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const NORMAL_SEEDS = [1, 2, 3, 4, 5];
const FIGHT_SECONDS = 120;
const SOLO_SECONDS = 180;
const SOLO_MIN_HEIGHT = 60;
const CLIMB_IDLE = 0.5 + 1 / 60;
const PANIC_IDLE = 0.25;
const MIN_LANDED = 0.95;

const memo = new Map();

/** Corre una vez cada combinación de parámetros y comparte el resultado entre los tests. */
function cached(key, options) {
    if (!memo.has(key)) memo.set(key, runBots(options));
    return memo.get(key);
}

const fights = [
    ...HARD_SEEDS.map((seed) => ({ seed, difficulty: "hard" })),
    ...NORMAL_SEEDS.map((seed) => ({ seed, difficulty: "normal" })),
];
const solos = HARD_SEEDS.map((seed) => ({ seed, difficulty: "hard" }));

const fight = ({ seed, difficulty }) => cached(`fight-${difficulty}-${seed}`, { seed, difficulty, seconds: FIGHT_SECONDS });
const solo = ({ seed, difficulty }) =>
    cached(`solo-${difficulty}-${seed}`, { seed, difficulty, seconds: SOLO_SECONDS, bots: "2", immortalFirst: true });

test("S2: bot contra bot en Infinito (difícil 1 a 10, normal 1 a 5, 120 s): 0 suicidios", { timeout: 1800000 }, async () => {
    const failures = [];
    for (const run of fights) {
        const r = await fight(run);
        const suicides = r.kills.filter((k) => !k.provoked);
        console.log(
            `S2 ${run.difficulty} semilla ${run.seed}: ${r.seconds.toFixed(1)} s, ahogados ${r.kills.map((k) => `J${k.k + 1} a los ${k.at.toFixed(1)} s${k.provoked ? "" : " (suicidio)"}`).join(", ") || "ninguno"}`,
        );
        if (suicides.length > 0) failures.push(`${run.difficulty} ${run.seed}: ${suicides.map((k) => `J${k.k + 1}@${k.at.toFixed(1)}`).join(", ")}`);
    }
    assert.deepEqual(failures, []);
});

test("S3: ?bot=2 con J1 quieto e inmortal (difícil, semillas 1 a 10): J2 vivo a los 180 s y sobre los 60 m locales", { timeout: 1800000 }, async () => {
    const failures = [];
    for (const run of solos) {
        const r = await solo(run);
        const { game } = r;
        const me = game.state.players[1];
        const height = me.torso.GetPosition().get_y() - game.state.climb.offsetY;
        console.log(`S3 semilla ${run.seed}: ${r.seconds.toFixed(1)} s, J2 vivo ${!me.dead}, altura local ${height.toFixed(1)} m (máxima ${r.maxHeight[1].toFixed(1)} m)`);
        if (me.dead || r.seconds < SOLO_SECONDS || height <= SOLO_MIN_HEIGHT) failures.push(`semilla ${run.seed}: ${r.seconds.toFixed(1)} s, vivo ${!me.dead}, ${height.toFixed(1)} m`);
    }
    assert.deepEqual(failures, []);
});

test("S4: apoyado y libre sin moverse ni saltar, como mucho 0,5 s seguidos en climb y 0,25 s en panic o con menos de 2,5 m de holgura", { timeout: 1800000 }, async () => {
    const failures = [];
    let worstClimb = 0;
    let worstPanic = 0;
    for (const run of [...fights, ...solos]) {
        const r = await (solos.includes(run) ? solo(run) : fight(run));
        for (const [k, idle] of Object.entries(r.idle)) {
            worstClimb = Math.max(worstClimb, idle.climb);
            worstPanic = Math.max(worstPanic, idle.panic);
            if (idle.climb > CLIMB_IDLE || idle.panic > PANIC_IDLE) {
                failures.push(`${run.difficulty} ${run.seed} J${Number(k) + 1}: climb ${idle.climb.toFixed(2)} s, panic ${idle.panic.toFixed(2)} s`);
            }
        }
    }
    console.log(`S4: racha de quietud máxima en climb ${worstClimb.toFixed(2)} s y en panic ${worstPanic.toFixed(2)} s`);
    assert.deepEqual(failures, []);
});

test("S5: al menos el 95 % de los saltos de ruta en safe y climb aterriza en la plataforma elegida o más arriba", { timeout: 1800000 }, async () => {
    let total = 0;
    let ok = 0;
    for (const run of [...fights, ...solos]) {
        const r = await (solos.includes(run) ? solo(run) : fight(run));
        total += r.jumps.total;
        ok += r.jumps.ok;
    }
    console.log(`S5: ${ok} de ${total} saltos de ruta aterrizaron en la plataforma elegida o más arriba (${((ok / total) * 100).toFixed(1)} %)`);
    assert.ok(total > 100, `solo ${total} saltos medidos`);
    assert.ok(ok / total >= MIN_LANDED, `${((ok / total) * 100).toFixed(1)} %`);
});

test("S6: tras un golpe recibido apoyado, ninguna caída a una plataforma más baja con el stick en 0 más de 0,3 s desde que termina el aturdimiento", { timeout: 1800000 }, async () => {
    const falls = [];
    for (const run of [...fights, ...solos]) {
        const r = await (solos.includes(run) ? solo(run) : fight(run));
        for (const f of r.unchosenFalls) falls.push(`${run.difficulty} ${run.seed} J${f.k + 1} a los ${f.at.toFixed(1)} s`);
    }
    console.log(`S6: caídas sin elegir tras un golpe ${falls.length}`);
    assert.deepEqual(falls, []);
});

const SURVIVAL = BOT.survival;

test("S7: survivalMode según la holgura y el tiempo hasta el agua", () => {
    const closing = 0.4;
    assert.equal(survivalMode(Infinity, closing), "safe");
    assert.equal(survivalMode(20, closing), "safe");
    assert.equal(survivalMode(SURVIVAL.climb.margin + SURVIVAL.climb.lead * closing, closing), "safe");
    assert.equal(survivalMode(SURVIVAL.climb.margin + SURVIVAL.climb.lead * closing - 0.01, closing), "climb");
    assert.equal(survivalMode(SURVIVAL.panic.clearance, closing), "climb");
    assert.equal(survivalMode(SURVIVAL.panic.clearance - 0.01, closing), "panic");
    assert.equal(survivalMode(0, closing), "panic");
    assert.equal(survivalMode(-1, closing), "panic");
    assert.equal(survivalMode(3, 1), "panic", "con 3 m a 1 m/s faltan 3 s: menos de panic.time");
    assert.equal(survivalMode(5, 1), "climb");
    assert.equal(survivalMode(3, 0), "climb", "sin cierre no hay tiempo hasta el agua");
});

test("S7: jumpMargin vale 1 en el centro de la regla, 0 en el límite y fuera, y baja al acercarse al límite", () => {
    assert.equal(jumpMargin(0.001, 0), 1 - 0.001 / BOT.reach.up.dy);
    assert.equal(jumpMargin(BOT.reach.up.dy, 0), 0);
    assert.equal(jumpMargin(BOT.reach.up.dy, BOT.reach.up.gap), 0);
    assert.equal(jumpMargin(BOT.reach.up.dy + 0.1, 0), 0);
    assert.equal(jumpMargin(BOT.reach.short.dy, BOT.reach.short.gap), 0);
    assert.equal(jumpMargin(0, 0), 1);
    assert.equal(jumpMargin(-2, BOT.reach.downGap), 0);
    assert.ok(Math.abs(jumpMargin(-2, BOT.reach.downGap / 2) - 0.5) < 1e-12);
    assert.ok(jumpMargin(1, 3) > 0, "un hueco de 3 m entra en la regla corta con 1 m de desnivel");
    assert.ok(jumpMargin(2.5, 0) < jumpMargin(1.5, 0));
    for (let dy = -4; dy <= 4; dy += 0.25) {
        for (let gap = 0; gap <= 5; gap += 0.25) {
            const m = jumpMargin(dy, gap);
            assert.ok(m >= 0 && m <= 1);
            if (!canReach(dy, gap)) assert.equal(m, 0, `dy ${dy} hueco ${gap}`);
        }
    }
});

test("S7: buildNav guarda el margen de cada arista, suma el riesgo al costo y no baja más de drop.max", () => {
    const nav = buildNav(LEVEL, BOT);
    let edges = 0;
    nav.nodes.forEach((a, i) => {
        nav.edges[i].forEach((j, k) => {
            edges++;
            const b = nav.nodes[j];
            const expected = jumpMargin(b.top - a.top, Math.max(0, b.minX - a.maxX, a.minX - b.maxX));
            assert.equal(nav.margins[i][k], expected);
            const base = nav.costs[i][k] - SURVIVAL.risk.weight * (1 - expected);
            assert.ok(Math.abs(base - BOT.cost.jump) < 1e-9 || Math.abs(base - BOT.cost.through) < 1e-9);
            assert.ok(b.top - a.top >= -SURVIVAL.drop.max);
        });
    });
    assert.ok(edges > 0);
    const column = {
        solids: [0, -5, -7].map((y) => ({ kind: "platform", x: 0, y, w: 4, h: 0.4 })),
    };
    const drops = buildNav(column, BOT);
    assert.deepEqual(drops.edges[0], [1], "una caída de 5 m entra y una de 7 m, no");
});

test("S7: landingNode elige la plataforma más alta alcanzable en la caída que quede sobre el agua", () => {
    const nodes = [
        { minX: 0, maxX: 4, top: 10 },
        { minX: 6, maxX: 10, top: 8 },
        { minX: 20, maxX: 24, top: 9 },
        { minX: 0, maxX: 4, top: 2 },
        { minX: 5, maxX: 9, top: 20 },
    ];
    const hover = (x, low, vy, line) => landingNode(nodes, x, low, vy, line);
    assert.deepEqual(hover(2, 12, 0, 0), { index: 0, safe: true }, "la más alta bajo los pies");
    assert.deepEqual(hover(5, 12, 0, 0), { index: 0, safe: true }, "a igual alcance gana la más alta, no la de menor hueco");
    assert.deepEqual(hover(5, 12, 0, 9), { index: 0, safe: true });
    assert.deepEqual(hover(8, 9, 0, 0), { index: 1, safe: true }, "la de arriba (top 10) ya no está bajo los pies");
    assert.deepEqual(hover(2, 12, 0, 11), { index: 0, safe: false }, "ninguna llega a la línea: la más alta, insegura");
    assert.deepEqual(hover(22, 30, 0, 0), { index: 2, safe: true }, "sin otra al alcance lateral, la de abajo de los pies");
    const lejos = landingNode([{ minX: 100, maxX: 104, top: 1 }], 0, 2, 0, 0);
    assert.deepEqual(lejos, { index: 0, safe: false }, "sin ninguna al alcance cae a la de menor hueco, insegura");
    assert.deepEqual(landingNode([], 0, 5, 0, 0), { index: null, safe: false });
    assert.deepEqual(landingNode([{ minX: 0, maxX: 1, top: 9 }], 0, 5, 0, 0), { index: null, safe: false }, "una plataforma sobre los pies no cuenta");
});

test("S7: edgeInward y lungeFits, apoyo en el borde", () => {
    const node = { minX: 10, maxX: 20 };
    const guard = SURVIVAL.edge.guard;
    assert.equal(edgeInward(15, node, guard), 0);
    assert.equal(edgeInward(10 + guard, node, guard), 0);
    assert.equal(edgeInward(10 + guard - 0.01, node, guard), 1);
    assert.equal(edgeInward(20 - guard + 0.01, node, guard), -1);
    assert.equal(edgeInward(9, node, guard), 1, "con el torso fuera por la izquierda vuelve hacia adentro");
    assert.equal(edgeInward(21, node, guard), -1, "con el torso fuera por la derecha vuelve hacia adentro");
    const narrow = { minX: 0, maxX: 1 };
    assert.equal(edgeInward(0.2, narrow, guard), 1, "en una plataforma angosta apunta al centro");
    assert.equal(edgeInward(0.8, narrow, guard), -1);
    assert.equal(edgeInward(0.5, narrow, guard), 0);
    const room = SURVIVAL.edge.lungeRoom;
    assert.equal(lungeFits(15, 1, node, room), true);
    assert.equal(lungeFits(20 - room, 1, node, room), true);
    assert.equal(lungeFits(20 - room + 0.01, 1, node, room), false);
    assert.equal(lungeFits(10 + room - 0.01, -1, node, room), false);
    assert.equal(lungeFits(10 + room, -1, node, room), true);
});
