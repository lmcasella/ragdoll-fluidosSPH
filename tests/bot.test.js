/**
 * Bot de prueba (#151) sobre la escena real: el script de `index.html` con LiquidFun real. El bot maneja a J2 como un
 * gamepad virtual (`Input.setVirtualPad`); J1 es un gamepad simulado que el test aprieta a mano.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { LEVEL } = await import("../js/level.js");
const { Bot, BOT, buildNav } = await import("../js/bot.js");
const { MELEE } = await import("../js/melee.js");
const { PAD } = await import("../js/Input.js");

const BUTTON_PUNCH = 1;
const BUTTON_FIRE = 7;
const NO_RNG = () => 0;

/** Juego con el bot en J2 (`rng` constante: reacción mínima, defensa que acierta y sin error de puntería) y J1 con un gamepad quieto. */
async function start({ rng = NO_RNG, bot = true } = {}) {
    globalThis.location = { search: "" };
    const game = await loadGame();
    game.setPad(0);
    if (bot) game.state.bots.set(1, new Bot({ k: 1, world: game.state.world, rng }));
    game.frames(40);
    return game;
}

const pos = (game, k) => game.state.players[k].torso.GetPosition();
const botOf = (game) => game.state.bots.get(1);
const nodeIndex = (bot, x, top) => bot.nav.nodes.findIndex((n) => n.minX < x && n.maxX > x && Math.abs(n.top - top) < 0.01);

/** Pone al robot `k` en x (conserva la altura relativa y las velocidades en cero) trasladando todas sus piezas. */
function teleport(game, k, x, y) {
    const player = game.state.players[k];
    const base = player.torso.GetPosition();
    const dx = x - base.get_x();
    const dy = y - base.get_y();
    const vec = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const p = body.GetPosition();
        vec.set_x(p.get_x() + dx);
        vec.set_y(p.get_y() + dy);
        body.SetTransform(vec, body.GetAngle());
        vec.set_x(0);
        vec.set_y(0);
        body.SetLinearVelocity(vec);
    }
    Box2D.destroy(vec);
}

test("bot: el grafo de plataformas y la plataforma más alta alcanzable desde cada isla", async () => {
    const bot = new Bot({ k: 1, world: (await start({ bot: false })).state.world });
    const { nodes } = buildNav(LEVEL, BOT);
    const left = nodeIndex(bot, 9, 4);
    const right = nodeIndex(bot, 47, 4);
    const tops = (from) => {
        const dist = bot.distances(from);
        return nodes.filter((_, i) => dist[i] !== Infinity).map((n) => n.top);
    };
    console.log(`desde la isla derecha: tope más alto ${bot.nav.nodes[bot.highest(right)].top} m; desde la izquierda: ${bot.nav.nodes[bot.highest(left)].top} m`);
    console.log(`alcanzables desde la derecha: ${tops(right).map((t) => t.toFixed(1)).join(", ")}`);
    assert.ok(bot.nav.nodes[bot.highest(right)].top >= 7);
});

test("bot: llega solo a la plataforma más alta alcanzable en 20 s", async () => {
    const game = await start();
    const bot = botOf(game);
    const goal = bot.highest(bot.supportOf(game.state.players[1]));
    const { top, minX, maxX } = bot.nav.nodes[goal];
    bot.goal = goal;
    bot.replanAt = Infinity;
    let arrived = null;
    for (let i = 0; i < 20 * 60 && arrived === null; i++) {
        game.frame();
        if (bot.supportOf(game.state.players[1]) === goal && game.state.players[1].grounded) arrived = i / 60;
    }
    console.log(`el bot llega a la plataforma de tope ${top} m (x ${minX} a ${maxX}) en ${arrived} s`);
    assert.ok(arrived !== null && arrived <= 20, `no llegó: x ${pos(game, 1).get_x().toFixed(2)} y ${pos(game, 1).get_y().toFixed(2)}`);
});

/** Pone a J1 sobre el piso de la isla derecha, a `gap` m a la izquierda de J2 y mirándolo, y recién entonces activa al bot. */
function faceOff(game, gap, rng = NO_RNG, activate = true) {
    const x = pos(game, 1).get_x();
    teleport(game, 0, x - gap, pos(game, 1).get_y());
    game.frames(30);
    if (activate) arm(game, rng);
}

function arm(game, rng) {
    game.state.bots.set(1, new Bot({ k: 1, world: game.state.world, rng }));
}

/** Corre `frames` frames y devuelve lo que `watch` junta en cada uno. */
function run(game, frames, watch) {
    for (let i = 0; i < frames; i++) {
        game.frame();
        watch(i / 60);
    }
}

test("bot: bloquea el golpe del rival que arranca a menos de 2 m", async () => {
    const game = await start({ bot: false });
    faceOff(game, 1.3, NO_RNG, false);
    const me = () => game.state.players[1];
    const kinds = new Set();
    game.setPad(0, { buttons: [BUTTON_PUNCH] });
    game.frame();
    game.setPad(0);
    arm(game, NO_RNG);
    const bot = botOf(game);
    let blocked = false;
    run(game, 60, () => {
        blocked ||= me().blocking;
        for (const h of game.state.melee.hits) kinds.add(h.kind);
    });
    console.log(`golpes registrados ${[...kinds].join(", ") || "ninguno"}; el bot bloqueó ${blocked}; vida del bot ${me().hp}`);
    assert.ok(blocked);
    assert.ok(kinds.has("block"));
    assert.equal(me().hp, 100);
    assert.ok(bot.defends);
});

test("bot: rueda hacia atrás ante un golpe que rompe la guardia", async () => {
    const game = await start({ bot: false });
    faceOff(game, 1.5);
    const rival = game.state.players[0];
    assert.ok(MELEE.attacks.combo3.breaksGuard);
    rival.beginAttack("combo3", rival.now);
    let rolled = false;
    const startX = pos(game, 1).get_x();
    let farthest = 0;
    run(game, 60, () => {
        rolled ||= game.state.players[1].clipState === "rollBack";
        farthest = Math.max(farthest, pos(game, 1).get_x() - startX);
    });
    console.log(`rodó hacia atrás ${rolled}; se alejó ${farthest.toFixed(2)} m; vida del bot ${game.state.players[1].hp}`);
    assert.ok(rolled);
});

test("bot: golpea en el aire con el rival abajo y cerca", async () => {
    const game = await start();
    const x = pos(game, 1).get_x();
    teleport(game, 0, x - 1, pos(game, 1).get_y());
    teleport(game, 1, x, pos(game, 1).get_y() + 3);
    const names = new Set();
    run(game, 40, () => {
        const attack = game.state.players[1].attack;
        if (attack) names.add(attack);
    });
    console.log(`ataques del bot en el aire: ${[...names].join(", ") || "ninguno"}`);
    assert.ok(names.has("airPunch") || names.has("airKick"));
});

test("bot: encadena el combo con el rival aturdido", async () => {
    const game = await start({ bot: false });
    faceOff(game, 1.3);
    const rival = game.state.players[0];
    rival.stun(3, rival.now);
    const names = new Set();
    run(game, 90, () => {
        const attack = game.state.players[1].attack;
        if (attack) names.add(attack);
    });
    console.log(`ataques del bot: ${[...names].join(", ")}; vida del rival ${game.state.players[0].hp}`);
    assert.ok(names.has("combo1") && names.has("combo2"));
});

test("bot: dispara con línea de vista a distancia media", async () => {
    const game = await start({ bot: false });
    faceOff(game, 7);
    const bot = botOf(game);
    const before = game.state.particleSystem.GetParticleCount();
    let fired = 0;
    run(game, 90, () => {
        if (bot.pad.buttons[BUTTON_FIRE].pressed) fired++;
    });
    const made = game.state.particleSystem.GetParticleCount() - before;
    console.log(`frames con el gatillo apretado ${fired}; partículas nuevas ${made}; rival mojado ${game.state.players[0].wet}`);
    assert.ok(fired > 30);
    assert.ok(made > 0);
    assert.ok(game.state.players[0].wet, "el chorro llega al rival");
});

test("bot: no cae a la pileta por su cuenta en 30 s", async () => {
    const game = await start();
    let lowest = Infinity;
    const supports = new Set();
    run(game, 30 * 60, () => {
        const me = game.state.players[1];
        lowest = Math.min(lowest, me.torso.GetPosition().get_y());
        const s = botOf(game).supportOf(me);
        if (s !== null) supports.add(botOf(game).nav.nodes[s].top);
    });
    console.log(`altura mínima del torso ${lowest.toFixed(2)} m; vivo ${!game.state.players[1].dead}; alturas pisadas ${[...supports].join(", ")}`);
    assert.ok(!game.state.players[1].dead);
    assert.ok(lowest > 3, `torso a ${lowest} m`);
});

test("bot: sube cuando la inundación se acerca", async () => {
    const game = await start();
    game.state.match.roundTime = 62;
    let highest = -Infinity;
    run(game, 15 * 60, () => {
        const me = game.state.players[1];
        highest = Math.max(highest, me.lowestPoint());
    });
    console.log(`pies a ${highest.toFixed(2)} m como máximo con el agua en ${game.state.flood.level.toFixed(2)} m`);
    assert.ok(highest > 7, `pies a ${highest} m`);
    assert.ok(!game.state.players[1].dead);
});

test("bot: ?bot=2 activa al bot de J2 y ?bot=1,2 a los dos", async () => {
    globalThis.location = { search: "?bot=2" };
    assert.deepEqual([...(await loadGame()).state.bots.keys()], [1]);
    globalThis.location = { search: "?bot=1,2" };
    assert.deepEqual([...(await loadGame()).state.bots.keys()], [0, 1]);
    globalThis.location = { search: "" };
    assert.equal((await loadGame()).state.bots.size, 0);
});

test("bot: partida bot contra bot de 60 s sin errores y con impactos de cada lado", async () => {
    globalThis.location = { search: "?bot=1,2&seed=1" };
    const game = await loadGame();
    const { melee, players } = game.state;
    const dealt = [0, 0];
    const connect = melee.connect.bind(melee);
    melee.connect = (attacker, owner, ...rest) => {
        dealt[players.indexOf(attacker)]++;
        return connect(attacker, owner, ...rest);
    };
    run(game, 60 * 60, () => {});
    console.log(`impactos de J1 ${dealt[0]} y de J2 ${dealt[1]}; rondas ganadas ${game.state.match.wins.join(" - ")}; estado ${game.state.match.state}`);
    assert.ok(dealt[0] >= 1 && dealt[1] >= 1);
});

test("bot: con la inundación activa la ruta no pasa por plataformas bajo la línea segura salvo la de partida", async () => {
    const bot = new Bot({ k: 1, world: (await start({ bot: false })).state.world });
    const flood = { active: true, level: 3, config: { riseSpeed: 0.2 } };
    const line = bot.safeLine({ flood }, flood.level);
    assert.equal(line, 3 + BOT.survival.climb.margin + 0.2 * BOT.survival.climb.lead);
    const low = nodeIndex(bot, 9, 4);
    bot.minTop = line;
    const dist = bot.distances(low);
    bot.nav.nodes.forEach((n, i) => {
        if (i !== low && n.top < line) assert.equal(dist[i], Infinity, `nodo ${i} con tope ${n.top} bajo la línea ${line}`);
    });
    assert.equal(bot.safeLine({ flood: { active: false, level: -Infinity, config: { riseSpeed: 0.2 } } }, -Infinity), -Infinity);
});

test("con dos gamepads reales conectados, los jugadores elegidos como bot los maneja el bot", async () => {
    globalThis.location = { search: "?bot=1,2&seed=1" };
    const game = await loadGame();
    delete globalThis.location;
    game.setPad(0);
    game.setPad(1);
    const x0 = [0, 1].map((k) => game.state.players[k].torso.GetPosition().get_x());
    let moved = [0, 0];
    for (let f = 0; f < 600; f++) {
        game.frame();
        moved = moved.map((m, k) => Math.max(m, Math.abs(game.state.players[k].torso.GetPosition().get_x() - x0[k])));
    }
    assert.deepEqual([...game.state.bots.keys()].sort(), [0, 1]);
    assert.ok(moved.every((m) => m > 2), `desplazamiento máximo ${moved.map((m) => m.toFixed(2))}`);
});
