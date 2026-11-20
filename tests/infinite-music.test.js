import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

test("#224: en Infinito suena una sola pista durante la ronda, sin cambio a los 5 s", { timeout: 300000 }, async () => {
    globalThis.location = { search: "?bot=1,2&seed=3" };
    const game = await loadGame({ map: "infinite" });
    const { audio, match } = game.state;
    const playing = new Set();
    const original = audio.playMusic.bind(audio);
    audio.playMusic = (name) => {
        if (name !== null && match.state === "playing") playing.add(name);
        return original(name);
    };
    for (let f = 0; f < 60 * 12 && match.state === "playing"; f++) game.frame();
    globalThis.location = { search: "" };
    assert.deepEqual([...playing], ["suddenDeath"]);
});
