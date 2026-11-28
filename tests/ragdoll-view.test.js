/**
 * Dibujo del robot y del agua en PIXI (#309, #351, docs/design/03-robots.md y 14-agua.md): el arte por pieza vive en `rag.view`,
 * los efectos son `tint` sobre la pintura y después del spawn no se crea nada por frame.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGame } from "./helpers/game.js";
import { createFakeRobotTextures, installFakePixi } from "./helpers/fake-pixi.js";
import { RagdollSprites } from "../src/ragdoll/RagdollSprites.js";
import { ROBOT_ART } from "../src/ragdoll/robotArt.js";
import { isRobotBackLayer, robotLayerOf } from "../src/ragdoll/robotLayers.js";
import { mixTint, parseHexColor, scaleTint, tintParts } from "../src/ragdoll/ragdollTint.js";
import { syncParts } from "../src/ragdoll/ragdollSync.js";
import { MATERIALS } from "../src/fluids/materials.js";

const ROBOT_JSON = JSON.parse(readFileSync(new URL("../assets/robot.rag.json", import.meta.url), "utf8"));
const PIXELS_PER_METER = ROBOT_JSON.units.pixelsPerMeter;
const SETTLE_FRAMES = 10;
const WATCH_FRAMES = 60;
const POSE_TOLERANCE = 1e-6;
const FLASH_RED = 0xff2828;
const PLAYER_COLOR = parseHexColor("#ff9933");
const PLAYER_COLOR_PACKED = 0xff9933;
const WHITE_TINT = 0xffffff;
const ANCHOR_CENTER = 0.5;
const TEXTURES = createFakeRobotTextures();

/** Cuerpo falso cuya pose se escribe en `pose`. */
function fakeBody() {
    const body = { pose: { x: 0, y: 0, angle: 0 } };
    body.GetPosition = () => ({ get_x: () => body.pose.x, get_y: () => body.pose.y });
    body.GetAngle = () => body.pose.angle;
    return body;
}

/**
 * Arma los sprites de un robot entero con cuerpos falsos.
 * @param {number} side lado al que mira el robot, 1 o -1
 */
function buildSprites(side) {
    installFakePixi();
    const view = new PIXI.Container();
    const bodies = new Map(ROBOT_JSON.bodies.map((body) => [body.id, fakeBody()]));
    const items = ROBOT_JSON.bodies.map((body) => ({ body: bodies.get(body.id), bodyId: body.id }));
    const sprites = new RagdollSprites({ view, items, textures: TEXTURES, pixelsPerMeter: PIXELS_PER_METER, side });
    return { view, sprites, bodies };
}
test("cada cuerpo del robot tiene un contenedor con la pintura y el detalle de su pieza, en su capa y a escala", () => {
    for (const side of [1, -1]) {
        const { view, sprites } = buildSprites(side);
        assert.equal(view.sortableChildren, true);
        assert.equal(sprites.parts.length, ROBOT_JSON.bodies.length);
        const spriteScale = (ROBOT_ART.sideMeters * PIXELS_PER_METER) / ROBOT_ART.rasterPixels;
        for (const part of sprites.parts) {
            const textures = TEXTURES[ROBOT_ART.pieceOfBody[part.bodyId]];
            assert.equal(part.display.parent, view);
            assert.deepEqual(part.display.children, [part.paint, part.trim]);
            assert.equal(part.paint.texture, textures.paint);
            assert.equal(part.trim.texture, textures.trim);
            assert.equal(part.display.zIndex, robotLayerOf(part.bodyId, side), `${part.bodyId} lado ${side}`);
            assert.equal(part.paint.anchor.x, ANCHOR_CENTER);
            assert.equal(part.paint.anchor.y, ANCHOR_CENTER);
            assert.ok(Math.abs(part.paint.scale.x - spriteScale * side) < POSE_TOLERANCE, "espejado según el lado");
            assert.ok(Math.abs(part.trim.scale.y - spriteScale) < POSE_TOLERANCE);
        }
    }
});

test("las piezas de atrás llevan el oscurecido en la pintura y en el detalle, y las de adelante no", () => {
    for (const side of [1, -1]) {
        const { sprites } = buildSprites(side);
        for (const part of sprites.parts) {
            const isBack = isRobotBackLayer(robotLayerOf(part.bodyId, side));
            assert.equal(part.shade, isBack ? ROBOT_ART.backShade : 1, part.bodyId);
            assert.equal(part.trim.tint, scaleTint(WHITE_TINT, part.shade), part.bodyId);
        }
        assert.ok(sprites.parts.some((part) => part.shade < 1));
    }
});

test("el color del jugador, el destello y el mojado se aplican a la pintura y el detalle no cambia", () => {
    const { sprites } = buildSprites(1);
    const player = { wet: false, dead: false, flashAmount: () => 0 };
    const trimTints = sprites.parts.map((part) => part.trim.tint);
    const checkPaint = (expected, label) => {
        for (const part of sprites.parts) assert.equal(part.paint.tint, scaleTint(expected, part.shade), `${label} ${part.bodyId}`);
    };
    tintParts(sprites.parts, player, PLAYER_COLOR, 0);
    checkPaint(PLAYER_COLOR_PACKED, "color del jugador");
    player.flashAmount = () => 1;
    tintParts(sprites.parts, player, PLAYER_COLOR, 0);
    checkPaint(FLASH_RED, "destello");
    player.flashAmount = () => 0;
    player.wet = true;
    tintParts(sprites.parts, player, PLAYER_COLOR, 0);
    checkPaint(mixTint(PLAYER_COLOR, 0, 0.35), "mojado");
    assert.deepEqual(sprites.parts.map((part) => part.trim.tint), trimTints, "el detalle conserva su tinte fijo");
});

test("un robot muerto no parpadea con el mojado", () => {
    const { sprites } = buildSprites(1);
    const player = { wet: true, dead: true, flashAmount: () => 0 };
    tintParts(sprites.parts, player, PLAYER_COLOR, 0);
    const front = sprites.parts.find((part) => part.shade === 1);
    assert.equal(front.paint.tint, PLAYER_COLOR_PACKED);
});
test("mixTint iguala la mezcla de color de Canvas 2D: base, destello y mojado redondeados por canal", () => {
    assert.equal(mixTint([255, 153, 51], 0, 0), 0xff9933);
    assert.equal(mixTint([255, 153, 51], 1, 0), 0xff2828);
    assert.equal(mixTint([255, 153, 51], 0, 1), 0x28dcff);
    const half = mixTint([200, 100, 0], 0.5, 0);
    assert.equal(half, (Math.round(227.5) << 16) | (70 << 8) | 20);
});

test("la sincronización pone cada contenedor en la pose del cuerpo, en px y con la Y y el ángulo invertidos", () => {
    const { sprites, bodies } = buildSprites(1);
    for (const [index, part] of sprites.parts.entries()) {
        bodies.get(part.bodyId).pose = { x: index + 2, y: index + 3, angle: 0.5 + index };
    }
    syncParts(sprites.parts, PIXELS_PER_METER);
    for (const [index, part] of sprites.parts.entries()) {
        assert.equal(part.display.position.x, (index + 2) * PIXELS_PER_METER);
        assert.equal(part.display.position.y, -(index + 3) * PIXELS_PER_METER);
        assert.equal(part.display.rotation, -(0.5 + index));
    }
});

test("en el juego, todo lo que dibuja el robot está dentro de rag.view, colgada de la capa de robots, en la escala del JSON", async () => {
    const game = await loadGame();
    game.frames(SETTLE_FRAMES);
    const { players, scene } = game.state;
    assert.equal(scene.ragdollLayer.scale.y, -1, "la capa de robots invierte la Y como espera RagImporter");
    for (const player of players) {
        const { view } = player.rag;
        assert.equal(view.parent, scene.ragdollLayer);
        assert.equal(player.painter.pixelsPerMeter, PIXELS_PER_METER);
        assert.equal(view.children.length, ROBOT_JSON.bodies.length, "un contenedor por cuerpo");
        for (const part of player.painter.parts) {
            assert.equal(part.display.parent, view);
            const position = part.body.GetPosition();
            assert.ok(Math.abs(part.display.position.x - position.get_x() * PIXELS_PER_METER) < POSE_TOLERANCE);
            assert.ok(Math.abs(part.display.position.y + position.get_y() * PIXELS_PER_METER) < POSE_TOLERANCE);
            assert.ok(Math.abs(part.display.rotation + part.body.GetAngle()) < POSE_TOLERANCE);
        }
    }
});

test("después del spawn no se crean Graphics ni objetos nativos por frame, ni con chispas y burbujas ni con agua con ácido", async () => {
    const game = await loadGame();
    const { players, water } = game.state;
    game.frames(SETTLE_FRAMES);
    const nativeClasses = Object.keys(Box2D).filter((name) => /^b2/.test(name) && typeof Box2D[name] === "function");
    const originals = new Map(nativeClasses.map((name) => [name, Box2D[name]]));
    let nativeConstructions = 0;
    for (const [name, original] of originals) {
        Box2D[name] = new Proxy(original, {
            construct(target, args, newTarget) {
                nativeConstructions++;
                return Reflect.construct(target, args, newTarget);
            },
        });
    }
    const graphicsBefore = PIXI.Graphics.constructed;
    try {
        for (let frame = 0; frame < WATCH_FRAMES; frame++) {
            for (const player of players) player.soak(MATERIALS.acid.sigmaE);
            game.frame();
        }
    } finally {
        for (const [name, original] of originals) Box2D[name] = original;
    }
    assert.ok(players.some((player) => player.painter.effects.graphics.circles.length > 0), "las burbujas se dibujaron");
    assert.equal(PIXI.Graphics.constructed, graphicsBefore, "ningún Graphics nuevo");
    assert.equal(nativeConstructions, 0, "ningún objeto nativo nuevo");
    assert.ok(water.N > 0);
});

test("al cambiar de ronda no quedan Graphics huérfanos: las vistas viejas se destruyen y las capas solo tienen lo de los robots vivos", async () => {
    const game = await loadGame();
    game.frames(SETTLE_FRAMES);
    const { players, scene } = game.state;
    const old = players.map((player) => ({ view: player.rag.view, effects: player.painter.effects.graphics }));
    game.state.arrancarPartida();
    game.frames(SETTLE_FRAMES);
    for (const { view, effects } of old) {
        assert.equal(view.destroyed, true, "la vista vieja se destruye");
        assert.ok(view.children.every((child) => child.destroyed), "con todas sus figuras");
        assert.equal(effects.destroyed, true, "y las chispas y burbujas del robot viejo");
        assert.equal(effects.parent, null);
    }
    assert.deepEqual(scene.ragdollLayer.children, players.map((player) => player.rag.view));
    assert.deepEqual(scene.effectsLayer.children, players.map((player) => player.painter.effects.graphics));
});
