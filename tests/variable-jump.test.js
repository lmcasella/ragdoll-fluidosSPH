/**
 * Salto variable y caída rápida (#152) sobre la escena real: el script de `index.js` con LiquidFun real y gamepad
 * simulado. Alturas medidas como la elevación del punto más bajo del robot sobre su posición de reposo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const BUTTON_A = 0;
const STEP = { x: 4.5, bottom: 6.6, top: 7.0 };
const FULL_JUMP = 4.135;
const NO_PAD = { axes: [0, 0, 0, 0] };
const HOLD_A = { buttons: [BUTTON_A] };
const PRESS_DROP = { buttons: [BUTTON_A], axes: [0, 1, 0, 0] };
const DOWN = { axes: [0, 1, 0, 0] };

async function start() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(40);
    return game;
}

const torsoX = (game) => game.state.players[0].torso.GetPosition().get_x();
const torsoVy = (game) => game.state.players[0].torso.GetLinearVelocity().get_y();
const extent = (game) => game.state.platforms.measure(game.state.platforms.owners.get(0));

/** Aprieta A `held` frames y lo suelta; devuelve la altura máxima de los pies sobre el reposo en los 120 frames siguientes. */
function jumpHeight(game, held) {
    const rest = extent(game).low;
    let peak = 0;
    game.setPad(0, HOLD_A);
    for (let i = 0; i < held; i++) {
        game.frame();
        peak = Math.max(peak, extent(game).low - rest);
    }
    game.setPad(0, NO_PAD);
    for (let i = 0; i < 120; i++) {
        game.frame();
        peak = Math.max(peak, extent(game).low - rest);
    }
    return peak;
}

test("salto variable: un toque de A deja un salto de 1,2 a 1,8 m", async () => {
    const game = await start();
    const height = jumpHeight(game, 1);
    console.log(`toque: altura máxima de los pies ${height.toFixed(3)} m`);
    assert.ok(height >= 1.2 && height <= 1.8, `${height} m`);
});

test("salto variable: A mantenido conserva el salto completo de antes (4,135 m medidos en main, margen 0,1 m)", async () => {
    const game = await start();
    const height = jumpHeight(game, 60);
    console.log(`mantenido: altura máxima de los pies ${height.toFixed(3)} m`);
    assert.ok(Math.abs(height - FULL_JUMP) <= 0.1, `${height} m`);
});

/** Salta con A mantenido hasta el apex y mide los segundos desde ahí hasta apoyar los pies, con o sin abajo. */
function fallSeconds(game, down) {
    const rest = extent(game).low;
    game.setPad(0, HOLD_A);
    game.frames(5);
    while (torsoVy(game) > 0) game.frame();
    game.setPad(0, down ? DOWN : NO_PAD);
    let frames = 0;
    while (extent(game).low > rest + 0.02 && frames < 240) {
        game.frame();
        frames++;
    }
    return frames / 60;
}

test("caída rápida: con el stick abajo la caída desde la misma altura tarda 8 a 16 % menos", async () => {
    const normal = fallSeconds(await start(), false);
    const fast = fallSeconds(await start(), true);
    const reduction = (1 - fast / normal) * 100;
    console.log(`caída ${normal.toFixed(3)} s, con abajo ${fast.toFixed(3)} s (${reduction.toFixed(1)} % menos)`);
    assert.ok(reduction >= 8 && reduction <= 16, `${reduction} %`);
});

test("caída rápida: abajo en el piso o subiendo no cambia el salto", async () => {
    const game = await start();
    game.setPad(0, DOWN);
    game.frames(30);
    game.setPad(0, { buttons: [BUTTON_A], axes: [0, 0.3, 0, 0] });
    const rest = extent(game).low;
    let peak = 0;
    for (let i = 0; i < 60; i++) {
        game.frame();
        peak = Math.max(peak, extent(game).low - rest);
    }
    assert.ok(Math.abs(peak - FULL_JUMP) <= 0.1, `${peak} m`);
});

function walkTo(game, x, dir) {
    game.setPad(0, { axes: [dir, 0, 0, 0] });
    for (let i = 0; i < 400 && (dir < 0 ? torsoX(game) > x : torsoX(game) < x); i++) game.frame();
    game.setPad(0);
    game.frames(30);
}

test("caída rápida: abajo + A sobre una atravesable sigue bajando en 0,3 s los pies y 0,6 s el robot", async () => {
    const game = await start();
    walkTo(game, STEP.x + 0.8, -1);
    game.setPad(0, HOLD_A);
    game.frames(60);
    game.setPad(0);
    game.frames(120);
    assert.ok(Math.abs(extent(game).low - STEP.top) < 0.05, "arranca parado sobre el escalón");
    game.setPad(0, PRESS_DROP);
    game.frame();
    game.setPad(0, NO_PAD);
    let frames = 0;
    let feetFrames = null;
    while (extent(game).high >= STEP.bottom && frames < 120) {
        game.frame();
        frames++;
        if (feetFrames === null && extent(game).low < STEP.bottom) feetFrames = frames;
    }
    console.log(`bajada: robot entero ${(frames / 60).toFixed(3)} s, pies ${(feetFrames / 60).toFixed(3)} s`);
    assert.ok(feetFrames / 60 <= 0.3, `pies ${feetFrames / 60} s`);
    assert.ok(frames / 60 <= 0.6, `${frames / 60} s`);
});
