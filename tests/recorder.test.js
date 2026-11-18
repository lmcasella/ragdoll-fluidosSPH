/** Graba 60 frames del juego con LiquidFun real y un gamepad simulado, y valida el JSON del grabador. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGame } from "./helpers/game.js";
import { recordGame } from "./helpers/recorder.js";

const RT = 7;

test("graba 60 frames con partículas, piezas y sólidos, y el JSON se relee entero", async () => {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    const recorder = recordGame(game, "chorro");
    game.setPad(0, { buttons: [RT] });
    for (let i = 0; i < 60; i++) {
        game.frame();
        recorder.capture();
    }

    const dir = mkdtempSync(join(tmpdir(), "recorder-"));
    try {
        const file = recorder.save(join(dir, "nested", "chorro.json"));
        const { meta, frames } = JSON.parse(readFileSync(file, "utf8"));

        assert.equal(frames.length, 60);
        assert.equal(meta.solids.length, 13);
        assert.deepEqual(meta.systems.map((s) => s.id), ["disparos"]);
        assert.deepEqual(Object.keys(meta.field), ["x0", "dx", "n", "beds"]);
        assert.equal(meta.field.beds.length, meta.field.n);
        assert.ok(meta.pieces.length > 0);
        assert.ok(meta.pieces.every((p) => p.shapes.length > 0));

        for (const frame of frames) {
            assert.equal(frame.particles.length, 1);
            for (const p of frame.particles) {
                assert.equal(p.x.length, p.y.length);
                assert.equal(p.x.length, p.color.length);
                assert.equal(p.x.length, p.tag.length);
            }
            assert.equal(frame.pieces.length, meta.pieces.length);
            assert.ok(frame.pieces.every((q) => q.length === 3 && q.every(Number.isFinite)));
            assert.equal(frame.eta.length, meta.field.n);
            assert.ok(frame.eta.every((v, i) => Number.isFinite(v) && v >= meta.field.beds[i] - 1e-9));
        }

        const shots = frames.map((f) => f.particles[0].x.length);
        assert.ok(shots[59] > shots[0], "el chorro suma partículas");
        assert.ok(frames[0].eta.some((v, i) => v > meta.field.beds[i]), "la pileta tiene agua");
        const pool = frames[0].eta.filter((v, i) => v > meta.field.beds[i] + 1e-3);
        assert.ok(pool.every((v) => Math.abs(v - 3) < 1e-3), "la pileta arranca asentada en 3 m");
        assert.ok(Math.abs(frames[59].t - 59 / 60) < 1e-3);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
