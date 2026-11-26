import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGame } from "./helpers/game.js";

const { withoutJointTracks } = await import("../src/ragdoll/clips.js");

const MAX_ERROR = 15;
const MEAN_ERROR = 5;
const MIN_RISE = 3.8;
const BASE_RISE = 4.02;

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * Salta con el stick derecho fijo en `aim` (Y hacia arriba) y mide, mientras el robot está en el aire, el error angular
 * en grados entre el cañón y la mira y la subida del torso en metros. `walk` suma caminar hacia la derecha.
 */
async function jumpWithAim(aim, { walk = false } = {}) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(40);
    const right = [walk ? 1 : 0, 0, aim[0], -aim[1]];
    game.setPad(0, { axes: right });
    game.frames(60);
    const startY = game.state.players[0].torso.GetPosition().get_y();
    const errors = [];
    let maxY = startY;
    let jumpStartFrame = -1;
    for (let f = 0; f < 150; f++) {
        const jumping = f >= 10 && f < 70;
        game.setPad(0, { buttons: jumping ? [0] : [], axes: right });
        game.frame();
        const player = game.state.players[0];
        if (jumpStartFrame < 0 && player.clipState === "jumpStart") jumpStartFrame = f;
        maxY = Math.max(maxY, player.torso.GetPosition().get_y());
        if (!player.jumping) continue;
        const muzzle = player.muzzle();
        const error = angleDiff(Math.atan2(muzzle.dy, muzzle.dx), Math.atan2(player.aimDir.y, player.aimDir.x));
        errors.push(Math.abs(error) * (180 / Math.PI));
    }
    return {
        frames: errors.length,
        max: Math.max(...errors),
        mean: errors.reduce((a, b) => a + b, 0) / errors.length,
        rise: maxY - startY,
        jumpStartFrame,
    };
}

for (const [name, aim, walk] of [
    ["al costado", [1, 0], false],
    ["al costado y abajo", [1, -0.5], false],
    ["al costado y abajo caminando", [1, -0.5], true],
    ["al costado, hacia el otro lado", [-1, -0.5], false],
    ["arriba", [0.3, 1], false],
    ["casi vertical hacia abajo", [0.3, -1], false],
]) {
    test(`el cañón sigue a la mira durante el salto: ${name}`, async (t) => {
        const result = await jumpWithAim(aim, { walk });
        t.diagnostic(`R2 ${name}: subida ${result.rise.toFixed(2)} m, error máx ${result.max.toFixed(1)}°, medio ${result.mean.toFixed(1)}°, jumpStart en el frame ${result.jumpStartFrame}`);
        assert.equal(result.jumpStartFrame, 10, "jumpStart en el paso del salto");
        assert.ok(result.frames > 90, `el salto dura ${result.frames} pasos`);
        assert.ok(result.max <= MAX_ERROR, `error máximo ${result.max.toFixed(1)}°`);
        assert.ok(result.mean <= MEAN_ERROR, `error medio ${result.mean.toFixed(1)}°`);
        assert.ok(result.rise >= MIN_RISE, `subida ${result.rise.toFixed(2)} m`);
        assert.ok(result.rise >= BASE_RISE * 0.95, `la altura no baja más de 5 %: ${result.rise.toFixed(2)} m`);
    });
}

test("withoutJointTracks quita las pistas de las articulaciones pedidas solo en los clips pedidos", () => {
    const json = {
        joints: [
            { id: "j_1", name: "joint_1" },
            { id: "j_2", name: "joint_2" },
        ],
        clips: [
            { key: "jump", tracks: [{ target: "j_1" }, { target: "j_2" }, { target: "root" }] },
            { key: "walk", tracks: [{ target: "j_1" }] },
        ],
    };
    const out = withoutJointTracks(json, ["jump"], ["joint_1"]);
    assert.deepEqual(out.clips[0].tracks.map((t) => t.target), ["j_2", "root"]);
    assert.deepEqual(out.clips[1].tracks.map((t) => t.target), ["j_1"]);
    assert.equal(json.clips[0].tracks.length, 3, "el original no se modifica");
});

test("el clip jump_start del robot ya no lleva pistas en la cadena del arma", async () => {
    const rig = JSON.parse(readFileSync(new URL("../assets/robot.rag.json", import.meta.url), "utf8"));
    const names = ["back_elbow", "front_elbow", "back_shoulder", "front_shoulder"];
    const ids = new Set(rig.joints.filter((j) => names.includes(j.name)).map((j) => j.id));
    const clean = withoutJointTracks(rig, ["jump_start"], names);
    const jump = clean.clips.find((c) => c.key === "jump_start");
    assert.ok(jump.tracks.length > 0);
    assert.ok(jump.tracks.every((t) => !ids.has(t.target)));
});
