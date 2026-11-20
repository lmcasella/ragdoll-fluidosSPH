// Loop de partida de punta a punta: el script de index.html con LiquidFun real y gamepad simulado
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const A = 0;
const START = 9;

async function intro() {
    const game = await loadGame({ intro: true });
    game.state.menu.values.map = "classic";
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

const press = (game, button) => {
    game.setPad(0, { buttons: [button] });
    game.frames(1);
    game.setPad(0);
};

/** Del menú a la partida: confirma Jugar y después la pantalla de asignación (con la asignación por defecto de dos gamepads). */
const begin = (game, button) => {
    press(game, button);
    game.frames(1);
    press(game, button);
};

/** Mata al jugador `loser` y deja correr el fin de ronda; con `wait` avanza también la cuenta regresiva siguiente. */
function endRound(game, loser, wait) {
    game.state.players[loser].hp = 0;
    game.frames(1);
    assert.equal(game.state.match.state, "roundOver");
    game.frames(190);
    if (wait && game.state.match.state === "countdown") game.frames(185);
}

const torsoX = (game, k) => game.state.players[k].torso.GetPosition().get_x();

test("título, cuenta regresiva sin movimiento, rondas, fin de partida y revancha", async () => {
    const game = await intro();
    const { match } = game.state;
    assert.equal(match.state, "title");

    game.setPad(0, { axes: [1, 0, 0, 0] });
    game.frames(60);
    assert.equal(match.state, "title");
    const titleX = torsoX(game, 0);
    game.setPad(0);

    press(game, A);
    assert.equal(match.state, "title", "Jugar abre la pantalla de asignación y no arranca");
    game.frames(1);
    press(game, A);
    assert.equal(match.state, "title", "A suma al gamepad sin confirmar");
    game.frames(1);
    press(game, A);
    assert.equal(match.state, "countdown");
    assert.equal(match.banner.title, "3");
    game.frames(5);
    const x0 = torsoX(game, 0);
    assert.ok(Math.abs(x0 - titleX) < 0.5, "el robot sigue en su punto de aparición");
    game.setPad(0, { axes: [1, 0, 0, 0] });
    game.frames(120);
    assert.equal(match.state, "countdown");
    assert.ok(Math.abs(torsoX(game, 0) - x0) < 0.05, `el robot no se mueve en la cuenta regresiva (dx ${torsoX(game, 0) - x0})`);
    assert.equal(match.roundTime, 0);

    game.frames(70);
    assert.equal(match.state, "playing");
    assert.equal(match.banner.title, "¡YA!");
    game.frames(60);
    assert.ok(match.roundTime > 0.9);
    assert.ok(torsoX(game, 0) - x0 > 0.2, "en playing el stick sí mueve al robot");
    game.setPad(0);

    endRound(game, 1, true);
    assert.equal(match.round, 2);
    assert.equal(match.state, "playing");
    assert.deepEqual(match.wins, [1, 0]);

    game.state.players[1].hp = 0;
    game.frames(1);
    assert.equal(match.state, "roundOver");
    game.frames(185);
    assert.equal(match.state, "matchOver");
    assert.equal(match.matchWinner, 0);
    assert.equal(match.banner.subtitle, "2 – 0 · A revancha · Start menú");

    press(game, A);
    game.frames(10);
    assert.equal(match.state, "matchOver", "A antes de 1 s no hace nada");
    game.frames(60);
    press(game, A);
    assert.equal(match.state, "countdown");
    assert.equal(match.round, 1);
    assert.deepEqual(match.wins, [0, 0]);
});

test("Start en el fin de partida vuelve al título", async () => {
    const game = await intro();
    const { match } = game.state;
    begin(game, START);
    assert.equal(match.state, "countdown");
    game.frames(185);
    assert.equal(match.state, "playing");
    match.wins[0] = 1;
    endRound(game, 1, false);
    assert.equal(match.state, "matchOver");
    game.frames(60);
    press(game, START);
    assert.equal(match.state, "title");
    assert.deepEqual(match.wins, [0, 0]);
    assert.equal(game.state.players.every((p) => !p.dead), true);
});