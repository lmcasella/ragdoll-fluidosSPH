/**
 * Menú principal (#154) y pantalla de asignación de controles (#223) sobre la escena real: el script de `index.html`
 * con LiquidFun real, gamepads y teclado simulados.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { DIFFICULTY } = await import("../js/bot.js");
const { MENU, Menu, CONTROLS, defaultAssignment } = await import("../js/menu.js");

const A = 0;
const B = 1;
const SELECT = 8;
const START = 9;
const DPAD = { up: 12, down: 13, left: 14, right: 15 };
const ROW = { map: 0, difficulty: 1, controls: 2, play: 3 };

/**
 * Abre el título con `pads` gamepads sueltos (0, 1 o 2). Con `search` se simula la URL y con `storage` el
 * `localStorage`.
 */
async function title({ search = "", storage, pads = 1 } = {}) {
    globalThis.location = { search };
    const game = await loadGame({ intro: true, storage });
    for (let k = 0; k < pads; k++) game.setPad(k);
    game.frames(5);
    return game;
}

/** Aprieta un gamepad un frame y lo suelta otro, para que el menú vea un solo flanco. */
function tap(game, pad, k = 0) {
    game.setPad(k, pad);
    game.frames(1);
    game.setPad(k);
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

const onScreen = (game) => !game.state.screens.assign.el.hidden;

/** Confirma Jugar con el gamepad 0 y deja la pantalla de asignación abierta. */
function openScreen(game) {
    tap(game, button(A));
    assert.ok(onScreen(game), "la pantalla de asignación está abierta");
    assert.equal(game.state.match.state, "title");
}

const column = (game, id) => game.state.asignacion.column(id);

test("menu: se recorre entera y se arranca la partida solo con gamepad (stick, cruceta y pantalla de asignación)", async () => {
    const game = await title();
    const { menu, match } = game.state;
    assert.equal(match.state, "title");
    assert.equal(menu.cursor, ROW.play);
    assert.deepEqual(MENU.rows.map((r) => r.id), ["map", "difficulty", "controls", "play"], "Mapa primero, fila de controles y sin fila de modo");

    tap(game, stick(0, -1));
    assert.equal(menu.cursor, ROW.controls);
    tap(game, stick(0, -1));
    assert.equal(menu.cursor, ROW.difficulty);
    tap(game, stick(1, 0));
    assert.equal(menu.choice.difficulty, "hard");
    tap(game, { buttons: [DPAD.left] });
    tap(game, { buttons: [DPAD.left] });
    assert.equal(menu.choice.difficulty, "easy");
    tap(game, { buttons: [DPAD.down] });
    assert.equal(menu.cursor, ROW.controls);
    tap(game, { buttons: [DPAD.down] });
    assert.equal(menu.cursor, ROW.play);
    tap(game, button(DPAD.down));
    assert.equal(menu.cursor, ROW.play, "no pasa de la última fila");
    assert.equal(match.state, "title");

    openScreen(game);
    tap(game, button(A));
    assert.equal(match.state, "title", "A suma al gamepad sin confirmar");
    tap(game, button(A));
    assert.equal(match.state, "countdown");
    assert.deepEqual([...game.state.bots.keys()], []);
    console.log(`partida con ${JSON.stringify(menu.choice)} arrancada solo con el gamepad, bots: ninguno`);
});

test("menu: Start sobre Jugar abre la pantalla y Start en la pantalla arranca", async () => {
    const game = await title();
    tap(game, button(START));
    assert.ok(onScreen(game));
    assert.equal(game.state.match.state, "title");
    tap(game, button(START));
    assert.equal(game.state.match.state, "countdown");
});

test("asignación: valores por defecto con 0, 1 y 2 gamepads", async () => {
    assert.deepEqual(defaultAssignment(["keyboard"]), { keyboard: 0 });
    assert.deepEqual(defaultAssignment(["keyboard", "pad:0"]), { keyboard: 0, "pad:0": 1 });
    assert.deepEqual(defaultAssignment(["keyboard", "pad:0", "pad:1"]), { keyboard: 0, "pad:0": 0, "pad:1": 1 });
    assert.deepEqual(defaultAssignment(["keyboard", "pad:0", "pad:1", "pad:2"]), { keyboard: 0, "pad:0": 0, "pad:1": 1, "pad:2": null });

    const expected = [
        { pads: 0, assignment: { keyboard: 0 }, bots: [1] },
        { pads: 1, assignment: { keyboard: 0, "pad:0": 1 }, bots: [] },
        { pads: 2, assignment: { keyboard: 0, "pad:0": 0, "pad:1": 1 }, bots: [] },
    ];
    for (const { pads, assignment, bots } of expected) {
        const game = await title({ pads });
        key(game, "Enter");
        assert.ok(onScreen(game), `${pads} gamepads`);
        assert.deepEqual(game.state.asignacion.assignment, assignment, `${pads} gamepads`);
        assert.deepEqual(game.state.asignacion.bots, bots, `${pads} gamepads`);
        key(game, "Enter");
        assert.equal(game.state.match.state, "countdown", `${pads} gamepads`);
        assert.deepEqual([...game.state.bots.keys()], bots, `${pads} gamepads`);
        assert.deepEqual(game.state.input.assignment, assignment, `${pads} gamepads`);
    }
});

test("asignación: cada dispositivo se mueve con su propio stick o cruceta, y los bots salen de los jugadores sin dispositivo", async () => {
    const game = await title({ pads: 2 });
    openScreen(game);
    assert.deepEqual([column(game, "keyboard"), column(game, "pad:0"), column(game, "pad:1")], [0, 0, 2]);

    tap(game, stick(1, 0), 1);
    assert.deepEqual([column(game, "keyboard"), column(game, "pad:0"), column(game, "pad:1")], [0, 0, 2], "el gamepad 2 ya está en J2");
    tap(game, stick(-1, 0), 1);
    assert.equal(column(game, "pad:1"), 1);
    assert.equal(column(game, "pad:0"), 0, "el otro dispositivo no se mueve");
    assert.deepEqual(game.state.asignacion.bots, [1], "J2 sin dispositivo lo maneja el bot");

    tap(game, button(DPAD.right), 0);
    assert.equal(column(game, "pad:0"), 1);
    key(game, "KeyD");
    assert.equal(column(game, "keyboard"), 1);
    assert.deepEqual(game.state.asignacion.bots, [0, 1], "sin dispositivos, los dos son bots");
    assert.ok(game.state.screens.assign.columns.every((c) => c.el.classes.has("bot")), "las dos columnas sin dispositivo muestran al bot");

    key(game, "ArrowRight");
    assert.equal(column(game, "keyboard"), 2);
    assert.deepEqual(game.state.asignacion.bots, [0], "J1 sin dispositivo lo maneja el bot");

    tap(game, button(START));
    assert.equal(game.state.match.state, "countdown");
    assert.deepEqual([...game.state.bots.keys()], [0]);
    assert.equal(game.state.input.assignment.keyboard, 1);
});

test("asignación: un jugador sin dispositivo queda en bot con la dificultad del menú y todos sin dispositivo son bots", async () => {
    for (const [id, preset] of Object.entries(DIFFICULTY)) {
        const game = await title({ pads: 0 });
        game.state.menu.values.difficulty = id;
        key(game, "Enter");
        key(game, "KeyD");
        assert.equal(column(game, "keyboard"), 1);
        key(game, "Enter");
        assert.equal(game.state.match.state, "countdown", id);
        assert.equal(game.state.bots.size, 2, id);
        for (const bot of game.state.bots.values()) {
            assert.deepEqual(bot.config.reaction, preset.reaction, id);
            assert.equal(bot.config.shoot.aimError, preset.aimError, id);
            assert.equal(bot.config.defense, preset.defense, id);
        }
    }
    console.log(`presets aplicados: ${JSON.stringify(DIFFICULTY)}`);
});

test("asignación: un gamepad sin apretar aparece atenuado; Select o A lo suman y lo resaltan", async () => {
    const game = await title({ pads: 2 });
    key(game, "Enter");
    const joined = () => game.state.asignacion.view.devices.map((d) => d.joined);
    assert.deepEqual(joined(), [true, false, false]);
    tap(game, button(SELECT), 1);
    assert.deepEqual(joined(), [true, false, true]);
    tap(game, button(A), 0);
    assert.deepEqual(joined(), [true, true, true]);
    assert.equal(game.state.match.state, "title", "sumarse no confirma");
    assert.deepEqual(game.state.asignacion.view.devices.map((d) => d.label), ["Teclado y mouse", "Gamepad 1", "Gamepad 2"]);
});

test("asignación: se navega solo con el teclado (A/D, flechas, Enter y Escape)", async () => {
    const game = await title({ pads: 0 });
    const { match } = game.state;
    key(game, "Enter");
    assert.ok(onScreen(game));
    key(game, "KeyD");
    assert.equal(column(game, "keyboard"), 1);
    key(game, "ArrowLeft");
    assert.equal(column(game, "keyboard"), 0);
    key(game, "ArrowLeft");
    assert.equal(column(game, "keyboard"), 0, "no pasa de J1");
    key(game, "Escape");
    assert.ok(!onScreen(game), "Escape vuelve al menú");
    assert.equal(match.state, "title");
    key(game, "Enter");
    assert.ok(onScreen(game));
    key(game, "Enter");
    assert.equal(match.state, "countdown");
});

test("asignación: B vuelve al menú, sin arrancar y con el cursor donde estaba", async () => {
    const game = await title();
    openScreen(game);
    tap(game, button(B));
    assert.ok(!onScreen(game));
    assert.equal(game.state.match.state, "title");
    assert.equal(game.state.menu.cursor, ROW.play);
});

test("asignación: conectar o desconectar un gamepad actualiza la pantalla", async () => {
    const game = await title({ pads: 0 });
    key(game, "Enter");
    assert.deepEqual(game.state.asignacion.ids, ["keyboard"]);
    assert.deepEqual(game.state.asignacion.bots, [1]);
    game.setPad(0);
    game.frames(2);
    assert.deepEqual(game.state.asignacion.ids, ["keyboard", "pad:0"]);
    assert.deepEqual(game.state.asignacion.bots, []);
    assert.ok(game.state.screens.assign.tokens.has("pad:0"), "el gamepad conectado aparece como ficha");
    game.setPad(1);
    game.frames(2);
    assert.deepEqual(game.state.asignacion.assignment, { keyboard: 0, "pad:0": 0, "pad:1": 1 });
    game.removePad(1);
    game.frames(2);
    assert.deepEqual(game.state.asignacion.ids, ["keyboard", "pad:0"]);
    assert.deepEqual(game.state.asignacion.assignment, { keyboard: 0, "pad:0": 1 });
    game.removePad(0);
    game.frames(2);
    assert.deepEqual(game.state.asignacion.assignment, { keyboard: 0 });
});

test("asignación: se recuerda la última y, si el dispositivo guardado ya no está, vale la de por defecto", async () => {
    const storage = memory();
    const first = await title({ storage, pads: 2 });
    key(first, "Enter");
    tap(first, stick(1, 0), 0);
    assert.equal(column(first, "pad:0"), 1);
    key(first, "Enter");
    assert.equal(first.state.match.state, "countdown");
    assert.deepEqual(JSON.parse(storage.data.get(CONTROLS.storageKey)), { keyboard: 0, "pad:0": null, "pad:1": 1 });

    const same = await title({ storage, pads: 2 });
    key(same, "Enter");
    assert.deepEqual(same.state.asignacion.assignment, { keyboard: 0, "pad:0": null, "pad:1": 1 });

    const fewer = await title({ storage, pads: 1 });
    key(fewer, "Enter");
    assert.deepEqual(fewer.state.asignacion.assignment, { keyboard: 0, "pad:0": 1 });

    const broken = memory({ [CONTROLS.storageKey]: "{no es json" });
    const game = await title({ storage: broken, pads: 1 });
    key(game, "Enter");
    assert.deepEqual(game.state.asignacion.assignment, { keyboard: 0, "pad:0": 1 });
});

test("asignación: con el teclado y un gamepad en el mismo jugador se combinan sin que el teclado pise al gamepad", async () => {
    const game = await title({ pads: 2 });
    key(game, "Enter");
    key(game, "Enter");
    assert.equal(game.state.match.state, "countdown");
    game.frames(190);
    assert.equal(game.state.match.state, "playing");
    const [j1] = game.state.input.poll();
    game.emit("keydown", { code: "KeyA", preventDefault() {} });
    game.setPad(0, { axes: [1, 0, 0, 0] });
    const [mixed] = game.state.input.poll();
    assert.deepEqual([mixed.left, mixed.right], [true, true]);
    assert.equal(j1.left, false);
    game.emit("keyup", { code: "KeyA" });
    game.setPad(0);
});

test("menu: Infinito es el mapa por defecto, habilitado, y Clásico se puede elegir", async () => {
    const fresh = new Menu({ storage: null });
    assert.equal(fresh.choice.map, "infinite");
    const infinite = MENU.rows.find((row) => row.id === "map").values.find((v) => v.id === "infinite");
    assert.ok(!infinite.disabled);

    const game = await title();
    const { menu } = game.state;
    menu.cursor = ROW.map;
    tap(game, stick(-1, 0));
    assert.equal(menu.choice.map, "classic");
    tap(game, stick(1, 0));
    assert.equal(menu.choice.map, "infinite");
});

test("menu: una elección guardada con la clave anterior se ignora y llega el default Infinito", async () => {
    const old = memory({ "ragdoll-fluidos.menu.v2": JSON.stringify({ mode: "bot", difficulty: "hard", map: "classic" }) });
    assert.deepEqual((await title({ storage: old })).state.menu.choice, { difficulty: "normal", map: "infinite" });
    assert.equal(MENU.storageKey, "ragdoll-fluidos.menu.v3");
});

test("menu: Clásico elegido se guarda y se arranca como mapa clásico", async () => {
    const storage = memory();
    const game = await title({ storage });
    game.state.menu.cursor = ROW.map;
    tap(game, stick(-1, 0));
    assert.equal(JSON.parse(storage.data.get(MENU.storageKey)).map, "classic");
    game.state.menu.cursor = ROW.play;
    openScreen(game);
    tap(game, button(START));
    assert.equal(game.state.match.state, "countdown");
    assert.equal(game.state.map, "classic");
    assert.equal(game.state.climb, null);
});

test("menu: el teclado navega como respaldo (flechas, WASD, Enter)", async () => {
    const game = await title();
    const { menu, match } = game.state;
    key(game, "ArrowUp");
    assert.equal(menu.cursor, ROW.controls);
    key(game, "KeyW");
    assert.equal(menu.cursor, ROW.difficulty);
    key(game, "ArrowRight");
    assert.equal(menu.choice.difficulty, "hard");
    key(game, "KeyA");
    assert.equal(menu.choice.difficulty, "normal");
    key(game, "KeyS");
    key(game, "ArrowDown");
    key(game, "ArrowDown");
    assert.equal(menu.cursor, ROW.play);
    key(game, "Enter");
    assert.ok(onScreen(game));
    key(game, "Enter");
    assert.equal(match.state, "countdown");
});

test("menu: con el gamepad empujando, el teclado no lo pisa", async () => {
    const game = await title();
    const { menu } = game.state;
    game.emit("keydown", { code: "KeyS", preventDefault() {} });
    game.setPad(0, stick(0, -1));
    game.frames(1);
    assert.equal(menu.cursor, ROW.controls, "el stick arriba gana sobre abajo del teclado");
    game.setPad(0);
    game.emit("keyup", { code: "KeyS" });
    game.frames(2);

    tap(game, stick(0, -1));
    assert.equal(menu.cursor, ROW.difficulty);
    tap(game, { buttons: [DPAD.right] });
    assert.equal(menu.choice.difficulty, "hard");
    game.emit("keydown", { code: "ArrowRight", preventDefault() {} });
    game.setPad(0, { buttons: [DPAD.left] });
    game.frames(1);
    assert.equal(menu.choice.difficulty, "normal", "la cruceta izquierda gana sobre la derecha del teclado");
    game.emit("keyup", { code: "ArrowRight" });
});

test("menu: mantener el stick no saltea filas (retardo y repetición)", async () => {
    const game = await title();
    const { menu } = game.state;
    menu.cursor = ROW.play;
    game.setPad(0, stick(0, -1));
    game.frames(12);
    assert.equal(menu.cursor, ROW.controls, "0,2 s mantenido mueve una sola fila");
    game.frames(48);
    console.log(`tras 1 s mantenido el cursor está en la fila ${menu.cursor}`);
    assert.equal(menu.cursor, ROW.map, "llega al tope sin pasarse");
    game.setPad(0);
});

test("menu: sin localStorage, con almacenamiento que falla o con datos rotos arranca con los defaults", async () => {
    const defaults = { difficulty: "normal", map: "infinite" };
    assert.deepEqual((await title()).state.menu.choice, defaults);

    const broken = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    const game = await title({ storage: broken });
    assert.deepEqual(game.state.menu.choice, defaults);
    game.state.menu.cursor = ROW.difficulty;
    tap(game, stick(1, 0));
    assert.equal(game.state.menu.choice.difficulty, "hard");

    const garbage = memory({ [MENU.storageKey]: "{no es json" });
    assert.deepEqual((await title({ storage: garbage })).state.menu.choice, defaults);
});

test("menu: recuerda la última elección", async () => {
    const storage = memory();
    const first = await title({ storage });
    first.state.menu.cursor = ROW.difficulty;
    tap(first, stick(1, 0));
    tap(first, stick(0, -1));
    tap(first, stick(-1, 0));
    assert.deepEqual(JSON.parse(storage.data.get(MENU.storageKey)), { difficulty: "hard", map: "classic" });

    const second = await title({ storage });
    assert.deepEqual(second.state.menu.choice, { difficulty: "hard", map: "classic" });
});

test("menu: ?bot= fuerza bots, salta la pantalla de asignación y gana sobre la asignación", async () => {
    const solo = await title({ search: "?bot=2", pads: 2 });
    tap(solo, button(A));
    assert.ok(!onScreen(solo));
    assert.equal(solo.state.match.state, "countdown");
    assert.deepEqual([...solo.state.bots.keys()], [1]);

    const both = await title({ search: "?bot=1,2", pads: 0 });
    key(both, "Enter");
    assert.equal(both.state.match.state, "countdown");
    assert.deepEqual([...both.state.bots.keys()].sort(), [0, 1]);

    const none = await title({ search: "", pads: 2 });
    key(none, "Enter");
    assert.ok(onScreen(none));
    assert.equal(none.state.match.state, "title");
});

test("menu: Start en el fin de partida vuelve al menú, sin bots, con el cursor en Jugar y sin la pantalla de asignación", async () => {
    const game = await title({ pads: 0 });
    const { match, menu } = game.state;
    key(game, "Enter");
    key(game, "Enter");
    assert.equal(game.state.bots.size, 1);
    match.state = "matchOver";
    match.timer = 0;
    menu.cursor = ROW.difficulty;
    key(game, "Escape");
    assert.equal(match.state, "title");
    assert.equal(menu.cursor, ROW.play);
    game.frames(2);
    assert.equal(game.state.bots.size, 0);
    assert.equal(match.state, "title", "el Start que volvió al menú no arranca la partida");
    assert.ok(!onScreen(game), "vuelve al menú y no a la pantalla de asignación");
});
