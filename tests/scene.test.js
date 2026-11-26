/**
 * Escena PIXI única (#308, docs/design/07-sph.md §7.4): un solo canvas en el DOM, nivel que se reconstruye solo cuando
 * cambia, umbral de las gotas con la fórmula del shader y escala de píxeles por metro del JSON del robot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGame } from "./helpers/game.js";
import { installFakePixi } from "./helpers/fake-pixi.js";
import { Camera } from "../src/render/camera.js";
import { THRESHOLD_GAIN, THRESHOLD_OFFSET, thresholdAlpha } from "../src/render/thresholdFilter.js";

const SETTLE_FRAMES = 5;
const WATCH_FRAMES = 30;
const ROBOT_PIXELS_PER_METER = JSON.parse(readFileSync(new URL("../assets/robot.rag.json", import.meta.url), "utf8")).units.pixelsPerMeter;
const MAX_SCALE = 64;
const VIEW_WIDTH = 1280;
const VIEW_HEIGHT = 720;

test("durante una ronda hay un solo canvas en el DOM", async () => {
    const game = await loadGame();
    game.frames(WATCH_FRAMES);
    assert.equal(game.state.match.state, "playing");
    assert.equal(document.querySelectorAll("canvas").length, 1);
    assert.equal(game.state.scene.application.renders > 0, true, "la escena se dibuja en cada frame");
});

test("el nivel no se reconstruye entre frames si no cambió y sí cuando se rompe una plataforma rompible", async () => {
    const game = await loadGame();
    const { levelView, breakable } = game.state;
    game.frames(SETTLE_FRAMES);
    const fixedBuilds = levelView.fixedBuilds;
    const breakableBuilds = levelView.breakableBuilds;
    assert.ok(fixedBuilds > 0 && breakableBuilds > 0, "se armó una vez");
    game.frames(WATCH_FRAMES);
    assert.equal(levelView.fixedBuilds, fixedBuilds, "los sólidos fijos no se reconstruyen");
    assert.equal(levelView.breakableBuilds, breakableBuilds, "los rompibles intactos no se reconstruyen");

    const entry = [...breakable.entries.values()][0];
    const { solid } = entry;
    entry.respawnAt = Infinity;
    solid.broken = true;
    game.frames(SETTLE_FRAMES);
    assert.equal(levelView.breakableBuilds, breakableBuilds + 1, "romper una plataforma reconstruye solo los rompibles");
    assert.equal(levelView.fixedBuilds, fixedBuilds, "romper una plataforma no toca los sólidos fijos");
    entry.respawnAt = 0;
    game.frames(SETTLE_FRAMES);
    assert.equal(levelView.breakableBuilds, breakableBuilds + 2, "restaurarla los reconstruye de nuevo");
});

test("el nivel de Infinito sube sin reconstruirse: el desplazamiento vertical es la posición del contenedor", async () => {
    const game = await loadGame({ map: "infinite" });
    const { levelView } = game.state;
    game.frames(SETTLE_FRAMES);
    assert.ok(levelView.fixedBuilds > 0);
    assert.equal(levelView.container.position.y, game.state.climb.offsetY * ROBOT_PIXELS_PER_METER);
});

test("el filtro de umbral: alfa de salida 0 hasta 0,5, rampa hasta 0,55 y 1 desde ahí", () => {
    assert.equal(THRESHOLD_GAIN, 20);
    assert.equal(THRESHOLD_OFFSET, -10);
    assert.equal(thresholdAlpha(0), 0);
    assert.equal(thresholdAlpha(0.5), 0);
    assert.equal(thresholdAlpha(0.55), 1);
    assert.equal(thresholdAlpha(1), 1);
    assert.ok(Math.abs(thresholdAlpha(0.525) - 0.5) < 1e-9, "a mitad de la rampa, la mitad");
});

test("la cámara usa los px por metro del JSON del robot y su zoom máximo es 64 px/m", async () => {
    const game = await loadGame();
    assert.equal(ROBOT_PIXELS_PER_METER, 32);
    const { camera } = game.state;
    assert.equal(camera.ppm, ROBOT_PIXELS_PER_METER);

    const closeCamera = new Camera({ minX: 0, maxX: 56, minY: 0, maxY: 31.5 }, ROBOT_PIXELS_PER_METER);
    closeCamera.resize(VIEW_WIDTH, VIEW_HEIGHT);
    const together = [{ x: 28, y: 5 }, { x: 28.1, y: 5 }];
    for (let frame = 0; frame < 600; frame++) closeCamera.update(together, 1 / 60, frame === 0);
    assert.ok(Math.abs(closeCamera.scale - MAX_SCALE) < 1e-9, `escala ${closeCamera.scale}`);
});

test("la cámara pone en el mundo PIXI el mismo zoom con Y invertida y la misma posición que en Canvas 2D", () => {
    installFakePixi();
    const camera = new Camera({ minX: 0, maxX: 56, minY: 0, maxY: 31.5 }, ROBOT_PIXELS_PER_METER);
    camera.resize(VIEW_WIDTH, VIEW_HEIGHT);
    camera.update([{ x: 20, y: 8 }, { x: 30, y: 9 }], 1 / 60, true);
    const container = new PIXI.Container();
    camera.applyTo(container);
    const scale = camera.scale;
    assert.equal(container.scale.x, camera.zoom);
    assert.equal(container.scale.y, -camera.zoom);
    const screen = camera.toScreen(25, 8);
    const pixelX = container.position.x + 25 * ROBOT_PIXELS_PER_METER * container.scale.x;
    const pixelY = container.position.y + 8 * ROBOT_PIXELS_PER_METER * container.scale.y;
    assert.ok(Math.abs(pixelX - screen.x) < 1e-9 && Math.abs(pixelY - screen.y) < 1e-9, `escala ${scale}`);
});
