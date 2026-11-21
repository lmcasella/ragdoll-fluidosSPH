import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, giveAllWeapons } from "./helpers/game.js";

const START = 9;
const A = 0;
const B = 1;
const DOWN = 13;

/** Aprieta un botón del gamepad 0 un frame y lo suelta otro, para que cada pulsación sea un flanco. */
function tapPad(game, button) {
    game.setPad(0, { buttons: [button] });
    game.frame();
    game.setPad(0);
    game.frame();
}

const tapKey = (game, code) => {
    game.emit("keydown", { code, repeat: false, preventDefault() {} });
    game.frame();
    game.emit("keyup", { code, repeat: false, preventDefault() {} });
    game.frame();
};

async function playing() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(5);
    return game;
}

const torsoX = (game) => game.state.players[0].torso.GetPosition().get_x();

test("Start pausa durante la partida y el reloj y el robot quedan quietos 60 frames", async () => {
    const game = await playing();
    const { match } = game.state;
    tapPad(game, START);
    assert.equal(match.state, "paused");
    assert.equal(match.resumeState, "playing");
    const roundTime = match.roundTime;
    const x = torsoX(game);
    const y = game.state.players[0].torso.GetPosition().get_y();
    game.setPad(0, { axes: [1, 0, 0, 0] });
    game.frames(60);
    assert.equal(match.roundTime, roundTime);
    assert.equal(torsoX(game), x);
    assert.equal(game.state.players[0].torso.GetPosition().get_y(), y);
    assert.ok(!game.state.screens.pause.el.hidden, "el menú de pausa se ve");
});

test("Start otra vez reanuda y la partida sigue corriendo", async () => {
    const game = await playing();
    const { match } = game.state;
    tapPad(game, START);
    game.frames(10);
    tapPad(game, START);
    assert.equal(match.state, "playing");
    const roundTime = match.roundTime;
    game.frames(30);
    assert.ok(match.roundTime > roundTime);
});

test("Continuar reanuda, y pausar en la cuenta regresiva vuelve a la cuenta regresiva", async () => {
    const game = await playing();
    const { match } = game.state;
    match.startCountdown();
    const timer = match.timer;
    tapPad(game, START);
    assert.equal(match.state, "paused");
    assert.equal(match.resumeState, "countdown");
    game.frames(60);
    assert.equal(match.timer, timer);
    tapPad(game, A);
    assert.equal(match.state, "countdown");
    game.frames(10);
    assert.ok(match.timer < timer);
});

test("Controles abre la ayuda y B vuelve al menú de pausa", async () => {
    const game = await playing();
    const { match, screens } = game.state;
    tapPad(game, START);
    tapPad(game, DOWN);
    tapPad(game, A);
    assert.equal(match.state, "paused");
    assert.ok(!screens.help.el.hidden && screens.pause.el.hidden);
    tapPad(game, B);
    assert.equal(match.state, "paused");
    assert.ok(screens.help.el.hidden && !screens.pause.el.hidden);
    tapPad(game, B);
    assert.equal(match.state, "playing");
});

test("Salir al menú deja la partida en el título", async () => {
    const game = await playing();
    const { match } = game.state;
    match.wins[0] = 1;
    tapPad(game, START);
    tapPad(game, DOWN);
    tapPad(game, DOWN);
    tapPad(game, A);
    assert.equal(match.state, "title");
    assert.deepEqual(match.wins, [0, 0]);
    assert.ok(!game.state.screens.menu.el.hidden);
});

test("Escape del teclado también pausa y reanuda", async () => {
    const game = await playing();
    const { match } = game.state;
    tapKey(game, "Escape");
    assert.equal(match.state, "paused");
    tapKey(game, "Escape");
    assert.equal(match.state, "playing");
});

test("con la pausa abierta, la cruceta no cambia de arma", async () => {
    const game = await playing();
    giveAllWeapons(game);
    const player = game.state.players[0];
    const weapon = player.weapon;
    tapPad(game, START);
    for (const button of [12, 13, 14, 15, 5, 4]) tapPad(game, button);
    assert.equal(player.weapon, weapon);
});

test("la pausa solo existe en la cuenta regresiva y en la partida", async () => {
    const game = await playing();
    const { match } = game.state;
    match.state = "roundOver";
    match.timer = 3;
    tapPad(game, START);
    assert.notEqual(match.state, "paused");
});
