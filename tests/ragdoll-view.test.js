/**
 * Dibujo del robot y del agua en PIXI (#309, docs/design/03-robots.md y 14-agua.md): las figuras viven en `rag.view`,
 * no se crean si el JSON trae sprites, los efectos son `tint` sobre cualquier hijo y después del spawn no se crea nada por frame.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGame } from "./helpers/game.js";
import { installFakePixi } from "./helpers/fake-pixi.js";
import { RagdollShapes, createRagdollShapes } from "../src/ragdoll/RagdollShapes.js";
import { mixTint, parseHexColor, tintParts } from "../src/ragdoll/ragdollTint.js";
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

function fakeBody(x, y, angle) {
    return { GetPosition: () => ({ get_x: () => x, get_y: () => y }), GetAngle: () => angle };
}

function boxItem(body) {
    return { body, bodyId: "b_1", type: "box", centerX: 0.1, centerY: 0.2, angle: 0.3, halfWidth: 0.5, halfHeight: 0.25 };
}

test("con un JSON que trae un sprite no se crea RagdollShapes y sin sprites sí", () => {
    installFakePixi();
    const view = new PIXI.Container();
    const items = [boxItem(fakeBody(0, 0, 0))];
    const withSprite = { ...ROBOT_JSON, sprites: [{ id: "sprite_1", src: "robot.png" }] };
    const before = PIXI.Graphics.constructed;
    assert.equal(createRagdollShapes({ view, items, json: withSprite }), null);
    assert.equal(PIXI.Graphics.constructed, before, "no se crea ningún Graphics");
    assert.equal(view.children.length, 0);
    const shapes = createRagdollShapes({ view, items, json: ROBOT_JSON });
    assert.ok(shapes instanceof RagdollShapes);
    assert.equal(view.children.length, 2 * items.length, "un relleno y un contorno por pieza, dentro de la vista");
});

test("el destello y el mojado se aplican como tint sobre un hijo Sprite, sin suponer que es un Graphics", () => {
    installFakePixi();
    const sprite = new PIXI.Sprite(PIXI.Texture.from({ width: 1, height: 1 }));
    const parts = [{ body: fakeBody(0, 0, 0), bodyId: "b_1", fill: sprite, outline: null }];
    const player = { wet: false, dead: false, flashAmount: () => 0 };
    tintParts(parts, player, PLAYER_COLOR, 0);
    assert.equal(sprite.tint, PLAYER_COLOR_PACKED, "color por jugador");
    player.flashAmount = () => 1;
    tintParts(parts, player, PLAYER_COLOR, 0);
    assert.equal(sprite.tint, FLASH_RED, "destello pleno");
    player.flashAmount = () => 0;
    player.wet = true;
    tintParts(parts, player, PLAYER_COLOR, 0);
    assert.equal(sprite.tint, mixTint(PLAYER_COLOR, 0, 0.35), "mojado en la fase 0 del parpadeo");
    assert.notEqual(sprite.tint, PLAYER_COLOR_PACKED);
    player.dead = true;
    tintParts(parts, player, PLAYER_COLOR, 0);
    assert.equal(sprite.tint, PLAYER_COLOR_PACKED, "un robot muerto no parpadea");
});

test("mixTint iguala la mezcla de color de Canvas 2D: base, destello y mojado redondeados por canal", () => {
    assert.equal(mixTint([255, 153, 51], 0, 0), 0xff9933);
    assert.equal(mixTint([255, 153, 51], 1, 0), 0xff2828);
    assert.equal(mixTint([255, 153, 51], 0, 1), 0x28dcff);
    const half = mixTint([200, 100, 0], 0.5, 0);
    assert.equal(half, (Math.round(227.5) << 16) | (70 << 8) | 20);
});

test("la sincronización pone cada hijo en la pose del cuerpo, en px y con la Y y el ángulo invertidos", () => {
    installFakePixi();
    const view = new PIXI.Container();
    const body = fakeBody(2, 3, 0.5);
    const shapes = new RagdollShapes({ view, items: [boxItem(body)], pixelsPerMeter: PIXELS_PER_METER });
    syncParts(shapes.parts, PIXELS_PER_METER);
    for (const child of view.children) {
        assert.equal(child.position.x, 2 * PIXELS_PER_METER);
        assert.equal(child.position.y, -3 * PIXELS_PER_METER);
        assert.equal(child.rotation, -0.5);
    }
});

test("el contorno se rehace solo cuando el zoom cambia su grosor más de un 10 %", () => {
    installFakePixi();
    const shapes = new RagdollShapes({ view: new PIXI.Container(), items: [boxItem(fakeBody(0, 0, 0))], pixelsPerMeter: PIXELS_PER_METER });
    const SCREEN_SCALE = 40;
    shapes.followZoom(SCREEN_SCALE);
    shapes.followZoom(SCREEN_SCALE);
    shapes.followZoom(SCREEN_SCALE * 1.05);
    assert.equal(shapes.outlineBuilds, 1, "un cambio chico de zoom no lo rehace");
    shapes.followZoom(SCREEN_SCALE * 2);
    assert.equal(shapes.outlineBuilds, 2, "un cambio grande sí");
    assert.ok(Math.abs(shapes.outlineWidth * SCREEN_SCALE * 2 / PIXELS_PER_METER - 1.5) < POSE_TOLERANCE, "1,5 px en pantalla");
});

test("en el juego, todo lo que dibuja el robot está dentro de rag.view, colgada de la capa de robots, en la escala del JSON", async () => {
    const game = await loadGame();
    game.frames(SETTLE_FRAMES);
    const { players, scene } = game.state;
    assert.equal(scene.ragdollLayer.scale.y, -1, "la capa de robots invierte la Y como espera RagImporter");
    for (const player of players) {
        const { view } = player.rag;
        assert.equal(view.parent, scene.ragdollLayer);
        assert.equal(player.painter.shapes.pixelsPerMeter, PIXELS_PER_METER);
        assert.equal(view.children.length, 2 * player.renderItems.length);
        for (const part of player.painter.shapes.parts) {
            assert.equal(part.fill.parent, view);
            assert.equal(part.outline.parent, view);
            const position = part.body.GetPosition();
            assert.ok(Math.abs(part.fill.position.x - position.get_x() * PIXELS_PER_METER) < POSE_TOLERANCE);
            assert.ok(Math.abs(part.fill.position.y + position.get_y() * PIXELS_PER_METER) < POSE_TOLERANCE);
            assert.ok(Math.abs(part.fill.rotation + part.body.GetAngle()) < POSE_TOLERANCE);
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
