import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

/** Partida terminada con los dos jugadores en gamepads (el teclado sin asignar) y el bloqueo del cartel vencido. */
async function matchOver() {
    const game = await loadGame();
    game.state.asignacion.assignment = { "pad:0": 0, "pad:1": 1 };
    game.setPad(0);
    game.setPad(1);
    const { match } = game.state;
    match.state = "matchOver";
    match.matchWinner = 0;
    match.timer = 0;
    return game;
}

const tap = (game, code) => {
    game.emit("keydown", { code, repeat: false, preventDefault() {} });
    game.frame();
    game.emit("keyup", { code, repeat: false, preventDefault() {} });
};

test("fin de partida: Escape vuelve al menú aunque el teclado no esté asignado a ningún jugador", async () => {
    const game = await matchOver();
    tap(game, "Escape");
    assert.equal(game.state.match.state, "title");
});

test("fin de partida: Enter pide la revancha aunque el teclado no esté asignado a ningún jugador", async () => {
    const game = await matchOver();
    tap(game, "Enter");
    assert.equal(game.state.match.state, "countdown");
});
