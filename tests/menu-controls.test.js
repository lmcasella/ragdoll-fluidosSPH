/**
 * #163: el cartel de controles se dibuja solo en el menú principal, debajo de las opciones, y no durante la partida.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { CONTROLS_HELP } from "../js/render.js";
test("#163: el cartel de controles se dibuja en el menú principal y no durante la partida", async () => {
    globalThis.location = { search: "" };
    const game = await loadGame({ intro: true });
    assert.equal(game.state.match.state, "title");
    game.frames(2);
    for (const line of CONTROLS_HELP) assert.ok(game.hudTexts.includes(line), `falta en el menú: ${line}`);
    game.state.arrancarPartida();
    game.state.match.state = "playing";
    game.frames(3);
    assert.equal(game.state.match.state, "playing");
    for (const line of CONTROLS_HELP) assert.ok(!game.hudTexts.includes(line), `se dibujó en partida: ${line}`);
});
