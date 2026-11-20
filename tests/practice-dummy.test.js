import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

test("#239: con un solo control y el rival en Muñeco, la ronda en Clásico no termina en 60 s sin atacar", { timeout: 600000 }, async () => {
    globalThis.location = { search: "?bot=2" };
    const game = await loadGame({ map: "classic" });
    const { menu, match } = game.state;
    menu.values.difficulty = "dummy";
    game.state.arrancarPartida();
    match.state = "playing";
    const [, p2] = game.state.players;
    const start = p2.torso.GetPosition().get_x();
    for (let f = 0; f < 60 * 60 && match.state === "playing"; f++) game.frame();
    globalThis.location = { search: "" };
    assert.equal(match.state, "playing");
    assert.equal(game.state.players[1].dead, false);
    assert.ok(Math.abs(game.state.players[1].torso.GetPosition().get_x() - start) < 1);
});
