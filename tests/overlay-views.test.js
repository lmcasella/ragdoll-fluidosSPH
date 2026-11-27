/**
 * Capa superpuesta en PIXI (#311, docs/design/07-sph.md §7.4): recogibles, mira láser, golpes, rueda de armas y capas de debug
 * son gráficos reutilizados de la escena. Con el debug apagado y en frames sucesivos no se crea nada nuevo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, giveAllWeapons } from "./helpers/game.js";
import { installFakePixi } from "./helpers/fake-pixi.js";

const { WEAPONS } = await import("../src/combat/weapons.js");
const { AimLaserView } = await import("../src/render/aimLaserView.js");
const { HitEffectsView, HIT_FX } = await import("../src/render/hitEffectsView.js");
const { WeaponWheelView, WHEEL_RADII } = await import("../src/render/weaponWheelView.js");

const SETTLE_FRAMES = 5;
const WATCH_FRAMES = 60;
const LEFT_BUMPER = 4;
const WHEEL_HOLD_FRAMES = 40;
const PIXELS_PER_METER = 32;
const SCREEN_SCALE = 40;

/** Cantidad de nodos del árbol de la escena: gráficos, textos y contenedores. */
function countNodes(node) {
    return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
}

test("con el debug apagado y en frames sucesivos no se crean gráficos, textos ni nodos nuevos", async () => {
    const game = await loadGame();
    giveAllWeapons(game);
    const { scene, pickupView, debug } = game.state;
    game.setPad(0, { axes: [0, 0, 1, 0] });
    game.frames(SETTLE_FRAMES);
    assert.equal(debug.open, false);
    assert.equal(debug.active, false);
    assert.ok(pickupView.entries.length > 0, "hay recogibles en el nivel");
    const graphics = PIXI.Graphics.constructed;
    const texts = PIXI.Text.constructed;
    const nodes = countNodes(scene.application.stage);
    game.frames(WATCH_FRAMES);
    assert.equal(PIXI.Graphics.constructed, graphics, "ningún Graphics nuevo");
    assert.equal(PIXI.Text.constructed, texts, "ningún Text nuevo");
    assert.equal(countNodes(scene.application.stage), nodes, "ningún nodo nuevo en la escena");
});

test("las capas de debug apagadas quedan vacías: no dibujan ni se redibujan en cada frame", async () => {
    const game = await loadGame();
    const { debugView } = game.state;
    game.frames(SETTLE_FRAMES);
    const layers = [debugView.pointsGraphics, ...Object.values(debugView.layerGraphics)];
    const clears = layers.map((graphics) => graphics.clears);
    game.frames(WATCH_FRAMES);
    assert.deepEqual(layers.map((graphics) => graphics.clears), clears, "no se vuelven a limpiar");
    for (const graphics of layers) assert.equal(graphics.strokes.length + graphics.fills.length, 0);
});

test("un recogible por punto de aparición: círculo con la inicial del arma, tuerca con agujero para la reparación; los inactivos se ocultan", async () => {
    const game = await loadGame();
    const { pickupView } = game.state;
    game.frames(SETTLE_FRAMES);
    const { points } = game.state.pickups;
    assert.ok(points.some((point) => point.kind === "repair"), "el nivel tiene una reparación");
    assert.ok(points.some((point) => point.kind !== "repair"), "y armas");
    points.forEach((point, index) => {
        const entry = pickupView.entries[index];
        assert.equal(entry.node.visible, true);
        if (point.kind === "repair") {
            assert.equal(entry.graphics.polygons.length, 2, "hexágono de relleno y hexágono de borde");
            assert.equal(entry.graphics.fills.length, 1);
            assert.equal(entry.graphics.strokes.length, 1);
            assert.equal(entry.graphics.cuts, 1, "con el agujero recortado del relleno");
            assert.equal(entry.label.visible, false);
        } else {
            const weapon = WEAPONS.find((candidate) => candidate.id === point.weapon);
            assert.equal(entry.graphics.circles.length, 1);
            assert.equal(entry.label.text, weapon.name[0]);
            assert.equal(entry.label.visible, true);
            assert.equal(entry.label.scale.y, -1, "la letra corrige la Y invertida de la cámara");
        }
    });
    game.state.pickups.consume(points[0], Infinity);
    game.frames(2);
    assert.equal(pickupView.entries[0].node.visible, false, "esperando reaparecer, no se dibuja");
    assert.equal(pickupView.entries[1].node.visible, true);
});

test("con el desplazamiento del mapa de ascenso, los recogibles suben con el contenedor sin rearmarse", async () => {
    const game = await loadGame({ map: "infinite" });
    const { pickupView, pickups } = game.state;
    game.frames(SETTLE_FRAMES);
    assert.equal(pickupView.container.position.y, pickups.offsetY * PIXELS_PER_METER);
});

test("la rueda de armas se abre con LB mantenido, tiene un sector por arma y se oculta al soltar", async () => {
    const game = await loadGame();
    giveAllWeapons(game);
    const { weaponWheelView } = game.state;
    game.frames(SETTLE_FRAMES);
    assert.equal(weaponWheelView.wheels[0].node.visible, false);
    game.setPad(0, { buttons: [LEFT_BUMPER] });
    game.frames(WHEEL_HOLD_FRAMES);
    const wheel = weaponWheelView.wheels[0];
    assert.equal(wheel.node.visible, true);
    assert.equal(wheel.graphics.arcs, 2 * WEAPONS.length, "dos arcos por sector");
    assert.equal(wheel.labels.filter((label) => label.visible).length, WEAPONS.length);
    assert.deepEqual(wheel.labels.map((label) => label.text), WEAPONS.map((weapon) => weapon.name[0]));
    assert.equal(weaponWheelView.wheels[1].node.visible, false, "la del otro jugador sigue cerrada");
    game.setPad(0);
    game.frames(SETTLE_FRAMES);
    assert.equal(wheel.node.visible, false);
});

test("la rueda marca el arma equipada con borde blanco y agranda el sector apuntado", () => {
    installFakePixi();
    const view = new WeaponWheelView({ parent: new PIXI.Container(), pixelsPerMeter: PIXELS_PER_METER, playerCount: 1 });
    const entries = [
        { name: "Agua", color: [90, 170, 255], fill: 1, equipped: true },
        { name: "Lava", color: [255, 80, 20], fill: 0.5, equipped: false },
    ];
    view.show(0, 3, 4, entries, 1);
    const { graphics } = view.wheels[0];
    assert.equal(graphics.strokes[0].color, "#ffffff");
    assert.ok(graphics.strokes[0].width > graphics.strokes[1].width);
    const FILLS_PER_SECTOR = 3;
    assert.ok(graphics.fills[FILLS_PER_SECTOR].alpha > graphics.fills[0].alpha, "el sector apuntado es más opaco (cada sector rellena el sector y dos barras)");
    assert.ok(WHEEL_RADII.selected > WHEEL_RADII.outer);
    const built = PIXI.Graphics.constructed;
    view.show(0, 3, 4, entries, 0);
    assert.equal(PIXI.Graphics.constructed, built, "volver a mostrar reutiliza los gráficos");
});

test("la mira dibuja una línea con alfa 0,6 y un punto solo si hubo impacto; sin mira borra la anterior", () => {
    installFakePixi();
    const view = new AimLaserView({ parent: new PIXI.Container(), pixelsPerMeter: PIXELS_PER_METER, playerCount: 2 });
    view.draw(0, { x1: 0, y1: 0, x2: 5, y2: 0, hit: false }, "#ff9933", SCREEN_SCALE);
    const [first, second] = view.graphics;
    assert.equal(first.strokes.length, 1);
    assert.equal(first.strokes[0].alpha, 0.6);
    assert.equal(first.circles.length, 0);
    view.draw(0, { x1: 0, y1: 0, x2: 5, y2: 0, hit: true }, "#ff9933", SCREEN_SCALE);
    assert.equal(first.circles.length, 1);
    view.draw(0, null, "#ff9933", SCREEN_SCALE);
    assert.equal(first.strokes.length, 0);
    assert.equal(second.strokes.length, 0, "el otro jugador no se toca");
});

test("los golpes se dibujan con su alfa decreciente y los vencidos se descartan de la lista", () => {
    installFakePixi();
    const view = new HitEffectsView({ parent: new PIXI.Container(), pixelsPerMeter: PIXELS_PER_METER });
    const hits = [
        { x: 1, y: 1, time: 10, kind: "hit" },
        { x: 2, y: 1, time: 10, kind: "block" },
        { x: 3, y: 1, time: 0, kind: "blockBreak" },
    ];
    view.draw(hits, SCREEN_SCALE, 10 + HIT_FX.hit.time / 2);
    assert.equal(hits.length, 2, "el golpe viejo se descartó");
    const { graphics } = view;
    assert.equal(graphics.strokes.length, 2);
    assert.equal(graphics.circles.length, 1, "un círculo para el golpe");
    assert.equal(graphics.moveTos, HIT_FX.block.rays, "un rayo por línea del bloqueo");
    const blockProgress = HIT_FX.hit.time / 2 / HIT_FX.block.time;
    assert.ok(Math.abs(graphics.strokes[0].alpha - (1 - blockProgress)) < 1e-9, "el bloqueo se dibuja primero y con su alfa");
});
