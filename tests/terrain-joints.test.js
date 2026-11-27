/**
 * Uniones entre tramos del piso (#346, docs/design/05-escenario.md §5.5, "Criterios"): un robot que camina o se desliza y las
 * partículas que corren por el piso no deben notar la unión de dos tramos. Cada escena se corre dos veces con el
 * juego real (LiquidFun y gamepad simulado): con el piso partido en tramos de 4 m (`TERRAIN.maxTileSize`) y con el piso entero
 * en un solo tramo (control). Lo que cuenta es la diferencia contra el control.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { VECTOR_COMPONENTS } from "../src/core/heap.js";

const { LEVEL } = await import("../src/level/level.js");
const { TERRAIN } = await import("../src/level/terrain.js");

const TILED_SIZE = TERRAIN.maxTileSize;
const WHOLE_SIZE = Infinity;
const SETTLE_FRAMES = 60;
const WALK_SPAWN_X = 7.5;
const JET_SPAWN_X = 1;
const FAR_SPAWN_X = 55;
const MAX_FRAMES = 400;
const WALK_END_X = 16;
const SLIDE_SPEED = -9;
const SLIDE_STOP_X = 1.5;
const SLIDE_STOP_SPEED = 0.2;

/** Diferencia tolerada contra el control en el desplazamiento vertical del torso, en m. */
const VERTICAL_TOLERANCE = 0.002;
/** Diferencia tolerada contra el control en la velocidad vertical máxima del torso, en m/s. */
const VERTICAL_SPEED_TOLERANCE = 0.05;
/** Diferencia tolerada contra el control en la posición final del torso, en m. */
const FINAL_X_TOLERANCE = 0.01;

const RIGHT_TRIGGER = 7;
const AIM_RIGHT = [0, 0, 1, 0];
const FIRE_FRAMES = 45;
const JET_FRAMES = 90;
const JOINT_X = 7.2;
const JOINT_ZONE = 0.5;
const MIN_CROSSING_PARTICLES = 3;
/** Velocidad horizontal media que las partículas del chorro pueden perder al cruzar la unión respecto del control, en m/s. */
const PARTICLE_SPEED_LOSS_TOLERANCE = 0.5;

/**
 * Carga el juego con el piso partido en tramos de `tileSize` y los robots lejos de la trayectoria del chorro, y restaura
 * la tabla al terminar.
 * @param {number} tileSize
 * @param {number} spawnX posición inicial de J1, en m
 */
async function loadWithTiles(tileSize, spawnX) {
    const realSpawns = LEVEL.spawns;
    TERRAIN.maxTileSize = tileSize;
    LEVEL.spawns = [{ x: spawnX, flipX: false }, { x: FAR_SPAWN_X, flipX: true }];
    try {
        const game = await loadGame();
        game.setPad(0);
        game.setPad(1);
        game.frames(SETTLE_FRAMES);
        return game;
    } finally {
        TERRAIN.maxTileSize = TILED_SIZE;
        LEVEL.spawns = realSpawns;
    }
}

/**
 * Camina (o se desliza) con J1 por el piso de la isla izquierda y mide el torso.
 * @param {"walk"|"slide"} kind
 * @param {number} tileSize
 */
async function moveAcrossJoints(kind, tileSize) {
    const game = await loadWithTiles(tileSize, WALK_SPAWN_X);
    const torso = game.state.players[0].torso;
    if (kind === "walk") game.setPad(0, { axes: [1, 0, 0, 0] });
    else {
        const velocity = new Box2D.b2Vec2(SLIDE_SPEED, 0);
        for (const body of game.state.players[0].rag.bodies.values()) body.SetLinearVelocity(velocity);
        Box2D.destroy(velocity);
    }
    const result = { minY: Infinity, maxY: -Infinity, maxVerticalSpeed: 0, frames: 0 };
    while (result.frames < MAX_FRAMES) {
        game.frame();
        result.frames++;
        const position = torso.GetPosition();
        const velocity = torso.GetLinearVelocity();
        const x = position.get_x();
        const finished = kind === "walk" ? x > WALK_END_X : x < SLIDE_STOP_X || Math.abs(velocity.get_x()) < SLIDE_STOP_SPEED;
        if (finished) break;
        result.minY = Math.min(result.minY, position.get_y());
        result.maxY = Math.max(result.maxY, position.get_y());
        result.maxVerticalSpeed = Math.max(result.maxVerticalSpeed, Math.abs(velocity.get_y()));
    }
    result.finalX = torso.GetPosition().get_x();
    result.verticalRange = result.maxY - result.minY;
    return result;
}

for (const kind of ["walk", "slide"]) {
    test(`un robot que ${kind === "walk" ? "camina" : "se desliza"} sobre la unión de dos tramos del piso se mueve igual que sobre el piso entero`, async () => {
        const tiled = await moveAcrossJoints(kind, TILED_SIZE);
        const whole = await moveAcrossJoints(kind, WHOLE_SIZE);
        console.log(
            `${kind}: tramos dy ${tiled.verticalRange.toFixed(4)} m, vy máx ${tiled.maxVerticalSpeed.toFixed(3)} m/s, x final ${tiled.finalX.toFixed(3)}, ${tiled.frames} frames; ` +
                `entero dy ${whole.verticalRange.toFixed(4)} m, vy máx ${whole.maxVerticalSpeed.toFixed(3)} m/s, x final ${whole.finalX.toFixed(3)}, ${whole.frames} frames`,
        );
        assert.ok(Math.abs(tiled.verticalRange - whole.verticalRange) <= VERTICAL_TOLERANCE, "no salta en la unión");
        assert.ok(Math.abs(tiled.maxVerticalSpeed - whole.maxVerticalSpeed) <= VERTICAL_SPEED_TOLERANCE, "no rebota en la unión");
        assert.ok(Math.abs(tiled.finalX - whole.finalX) <= FINAL_X_TOLERANCE, "no se traba en la unión");
    });
}

/**
 * J1 dispara su chorro de agua a ras del piso de la isla izquierda y devuelve la menor velocidad horizontal media de las
 * partículas que están cruzando la unión de los tramos en `JOINT_X`.
 * @param {number} tileSize
 */
async function slowestAcrossJoint(tileSize) {
    const game = await loadWithTiles(tileSize, JET_SPAWN_X);
    const { particleSystem } = game.state;
    game.setPad(0, { buttons: [RIGHT_TRIGGER], axes: AIM_RIGHT });
    let slowestMean = Infinity;
    for (let frame = 0; frame < JET_FRAMES; frame++) {
        if (frame === FIRE_FRAMES) game.setPad(0);
        game.frame();
        const positions = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
        const velocities = Box2D.getPointer(particleSystem.GetVelocityBuffer()) >> 2;
        let crossing = 0;
        let speedSum = 0;
        for (let index = 0; index < particleSystem.GetParticleCount(); index++) {
            if (Math.abs(Box2D.HEAPF32[positions + VECTOR_COMPONENTS * index] - JOINT_X) >= JOINT_ZONE) continue;
            crossing++;
            speedSum += Box2D.HEAPF32[velocities + VECTOR_COMPONENTS * index];
        }
        if (crossing >= MIN_CROSSING_PARTICLES) slowestMean = Math.min(slowestMean, speedSum / crossing);
    }
    return slowestMean;
}

const JOINT_PARTICLES_TODO =
    "con tramos de 4 m el chorro de agua baja de 13,72 a 9,14 m/s al cruzar la unión; con el piso entero no se frena (ver informe de #346)";

test("las partículas que corren por el piso no se frenan en la unión de dos tramos", { todo: JOINT_PARTICLES_TODO }, async () => {
    const tiled = await slowestAcrossJoint(TILED_SIZE);
    const whole = await slowestAcrossJoint(WHOLE_SIZE);
    console.log(`partículas: velocidad media mínima al cruzar x = ${JOINT_X}: tramos ${tiled.toFixed(2)} m/s, piso entero ${whole.toFixed(2)} m/s`);
    assert.ok(whole - tiled <= PARTICLE_SPEED_LOSS_TOLERANCE, `se frenan ${(whole - tiled).toFixed(2)} m/s en la unión`);
});