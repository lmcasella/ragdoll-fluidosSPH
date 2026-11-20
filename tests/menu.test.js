/**
 * Menú principal (#154) sobre la escena real: el script de `index.html` con LiquidFun real, gamepad y teclado simulados.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { DIFFICULTY } = await import("../js/bot.js");
const { MENU, Menu } = await import("../js/menu.js");

const A = 0;
const START = 9;
const DPAD = { up: 12, down: 13, left: 14, right: 15 };
const ROW = { mode: 0, difficulty: 1, map: 2, play: 3 };

async function title({ search = "", storage } = {}) {
    globalThis.location = { search };
    const game = await loadGame({ intro: true, storage });
    game.setPad(0);
    game.frames(5);
    return game;
}

/** Aprieta un gamepad un frame y lo suelta otro, para que el menú vea un solo flanco. */
function tap(game, pad) {
    game.setPad(0, pad);
    game.frames(1);
    game.setPad(0);
    game.frames(1);
}

const stick = (x, y) => ({ axes: [x, y, 0, 0] });
const button = (b) => ({ buttons: [b] });

function key(game, code, frames = 1) {
    game.emit("keydown", { code, preventDefault() {} });
    game.frames(frames);
    game.emit("keyup", { code });
    game.frames(1);
}

function memory(initial = {}) {
    const data = new Map(Object.entries(initial));
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, String(v)) };
}

test("menu: se recorre entera y se arranca la partida solo con gamepad (stick y cruceta)", async () => {
    const game = await title();
    const { menu, match } = game.state;
    assert.equal(match.state, "title");
    assert.equal(menu.cursor, ROW.play);

    tap(game, stick(0, -1));
    assert.equal(menu.cursor, ROW.map);
    tap(game, stick(0, -1));
    assert.equal(menu.cursor, ROW.mode, "la dificultad se saltea sin bots");
    tap(game, { buttons: [DPAD.right] });
    assert.equal(menu.choice.mode, "bot");
    tap(game, stick(0, 1));
    assert.equal(menu.cursor, ROW.difficulty);
    tap(game, stick(1, 0));
    assert.equal(menu.choice.difficulty, "hard");
    tap(game, { buttons: [DPAD.left] });
    tap(game, { buttons: [DPAD.left] });
    assert.equal(menu.choice.difficulty, "easy");
    tap(game, { buttons: [DPAD.down] });
    assert.equal(menu.cursor, ROW.map);
    tap(game, { buttons: [DPAD.down] });
    assert.equal(menu.cursor, ROW.play);
    tap(game, button(DPAD.down));
    assert.equal(menu.cursor, ROW.play, "no pasa de la última fila");
    assert.equal(match.state, "title");

    tap(game, button(A));
    assert.equal(match.state, "countdown");
    assert.deepEqual([...game.state.bots.keys()], [1]);
    console.log(`partida con ${JSON.stringify(menu.choice)} arrancada solo con el gamepad`);
});

test("menu: Start sobre Jugar también arranca", async () => {
    const game = await title();
    tap(game, button(START));
    assert.equal(game.state.match.state, "countdown");
});

test("menu: cada modo arranca la partida correcta", async () => {
    const expected = { versus: [], bot: [1], botbot: [0, 1] };
    for (const [mode, bots] of Object.entries(expected)) {
        const game = await title();
        game.state.menu.values.mode = mode;
        tap(game, button(A));
        assert.equal(game.state.match.state, "countdown", mode);
        assert.deepEqual([...game.state.bots.keys()].sort(), bots, mode);
        assert.equal(game.state.players.length, 2);
    }
});

test("menu: cada dificultad aplica su preset al bot", async () => {
    for (const [id, preset] of Object.entries(DIFFICULTY)) {
        const game = await title();
        game.state.menu.values.mode = "botbot";
        game.state.menu.values.difficulty = id;
        tap(game, button(A));
        assert.equal(game.state.bots.size, 2);
        for (const bot of game.state.bots.values()) {
            assert.deepEqual(bot.config.reaction, preset.reaction, id);
            assert.equal(bot.config.shoot.aimError, preset.aimError, id);
            assert.equal(bot.config.defense, preset.defense, id);
        }
    }
    console.log(`presets aplicados: ${JSON.stringify(DIFFICULTY)}`);
});

test("menu: Infinito es el mapa por defecto, habilitado, y Clásico se puede elegir", async () => {
    const fresh = new Menu({ storage: null });
    assert.equal(fresh.choice.map, "infinite");
    const infinite = MENU.rows.find((row) => row.id === "map").values.find((v) => v.id === "infinite");
    assert.ok(!infinite.disabled);

    const game = await title();
    const { menu } = game.state;
    tap(game, stick(0, -1));
    assert.equal(menu.cursor, ROW.map);
    tap(game, stick(-1, 0));
    assert.equal(menu.choice.map, "classic");
    tap(game, stick(1, 0));
    assert.equal(menu.choice.map, "infinite");
});

test("menu: una elección guardada con la clave anterior se ignora y llega el default Infinito", async () => {
    const old = memory({ "ragdoll-fluidos.menu": JSON.stringify({ mode: "bot", difficulty: "hard", map: "classic" }) });
    assert.deepEqual((await title({ storage: old })).state.menu.choice, { mode: "versus", difficulty: "normal", map: "infinite", bots: [] });
    assert.notEqual(MENU.storageKey, "ragdoll-fluidos.menu");
});

test("menu: Clásico elegido se guarda y se arranca como mapa clásico", async () => {
    const storage = memory();
    const game = await title({ storage });
    tap(game, stick(0, -1));
    tap(game, stick(-1, 0));
    assert.equal(JSON.parse(storage.data.get(MENU.storageKey)).map, "classic");
    tap(game, stick(0, 1));
    tap(game, button(A));
    assert.equal(game.state.match.state, "countdown");
    assert.equal(game.state.map, "classic");
    assert.equal(game.state.climb, null);
});

test("menu: el teclado navega como respaldo (flechas, WASD, Enter)", async () => {
    const game = await title();
    const { menu, match } = game.state;
    key(game, "ArrowUp");
    assert.equal(menu.cursor, ROW.map);
    key(game, "KeyW");
    assert.equal(menu.cursor, ROW.mode);
    key(game, "ArrowRight");
    assert.equal(menu.choice.mode, "bot");
    key(game, "KeyD");
    assert.equal(menu.choice.mode, "botbot");
    key(game, "KeyA");
    assert.equal(menu.choice.mode, "bot");
    key(game, "KeyS");
    key(game, "ArrowDown");
    key(game, "ArrowDown");
    assert.equal(menu.cursor, ROW.play);
    key(game, "Enter");
    assert.equal(match.state, "countdown");
});

test("menu: con el gamepad empujando, el teclado no lo pisa", async () => {
    const game = await title();
    const { menu } = game.state;
    game.emit("keydown", { code: "KeyS", preventDefault() {} });
    game.setPad(0, stick(0, -1));
    game.frames(1);
    assert.equal(menu.cursor, ROW.map, "el stick arriba gana sobre abajo del teclado");
    game.setPad(0);
    game.emit("keyup", { code: "KeyS" });
    game.frames(2);

    tap(game, stick(0, -1));
    assert.equal(menu.cursor, ROW.mode);
    tap(game, { buttons: [DPAD.right] });
    assert.equal(menu.choice.mode, "bot");
    game.emit("keydown", { code: "ArrowRight", preventDefault() {} });
    game.setPad(0, { buttons: [DPAD.left] });
    game.frames(1);
    assert.equal(menu.choice.mode, "versus", "la cruceta izquierda gana sobre la derecha del teclado");
    game.emit("keyup", { code: "ArrowRight" });
});

test("menu: mantener el stick no saltea filas (retardo y repetición)", async () => {
    const game = await title();
    const { menu } = game.state;
    menu.values.mode = "bot";
    game.setPad(0, stick(0, -1));
    game.frames(12);
    assert.equal(menu.cursor, ROW.map, "0,2 s mantenido mueve una sola fila");
    game.frames(48);
    console.log(`tras 1 s mantenido el cursor está en la fila ${menu.cursor}`);
    assert.ok(menu.cursor < ROW.map);
    game.setPad(0);
});

test("menu: sin localStorage, con almacenamiento que falla o con datos rotos arranca con los defaults", async () => {
    const defaults = { mode: "versus", difficulty: "normal", map: "infinite", bots: [] };
    assert.deepEqual((await title()).state.menu.choice, defaults);

    const broken = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    const game = await title({ storage: broken });
    assert.deepEqual(game.state.menu.choice, defaults);
    tap(game, stick(0, -1));
    tap(game, stick(0, -1));
    tap(game, stick(1, 0));
    assert.equal(game.state.menu.choice.mode, "bot");

    const garbage = memory({ [MENU.storageKey]: "{no es json" });
    assert.deepEqual((await title({ storage: garbage })).state.menu.choice, defaults);
});

test("menu: recuerda la última elección", async () => {
    const storage = memory();
    const first = await title({ storage });
    tap(first, stick(0, -1));
    tap(first, stick(0, -1));
    tap(first, stick(1, 0));
    tap(first, stick(0, 1));
    tap(first, stick(1, 0));
    assert.deepEqual(JSON.parse(storage.data.get(MENU.storageKey)), { mode: "bot", difficulty: "hard", map: "infinite" });

    const second = await title({ storage });
    assert.deepEqual(second.state.menu.choice, { mode: "bot", difficulty: "hard", map: "infinite", bots: [1] });
});

test("menu: ?bot= preselecciona el modo y gana sobre lo guardado", async () => {
    const storage = memory({ [MENU.storageKey]: JSON.stringify({ mode: "versus" }) });
    assert.equal((await title({ search: "?bot=2", storage })).state.menu.choice.mode, "bot");
    assert.equal((await title({ search: "?bot=1,2" })).state.menu.choice.mode, "botbot");
    assert.equal((await title({ search: "" })).state.menu.choice.mode, "versus");
});

test("menu: Start en el fin de partida vuelve al menú, sin bots y con el cursor en Jugar", async () => {
    const game = await title();
    const { match, menu } = game.state;
    menu.values.mode = "bot";
    tap(game, button(A));
    assert.equal(game.state.bots.size, 1);
    match.state = "matchOver";
    match.timer = 0;
    menu.cursor = ROW.mode;
    tap(game, button(START));
    assert.equal(match.state, "title");
    assert.equal(menu.cursor, ROW.play);
    game.frames(2);
    assert.equal(game.state.bots.size, 0);
    assert.equal(match.state, "title", "el Start que volvió al menú no arranca la partida");
});
