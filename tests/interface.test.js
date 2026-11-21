/**
 * Interfaz HTML (#216, docs/design/18-interfaz.md) sobre el juego real: visibilidad por pantalla, el DOM refleja el estado de
 * `Menu`, `HelpScreen` y `ControlsScreen`, y cada evento de la tabla de sonidos dispara el suyo con el AudioContext falso.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { createFakeAudioContext } from "./helpers/fake-audio.js";

const { UI_SOUNDS, UI_VOLUME } = await import("../js/audio.js");
const { MENU } = await import("../js/menu.js");

const A = 0;
const B = 1;
const LB = 4;
const RB = 5;
const SELECT = 8;
const START = 9;
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const stick = (x, y) => ({ axes: [x, y, 0, 0] });

/** Aprieta un gamepad un frame, lo suelta y deja pasar más de 70 ms para que la navegación vuelva a sonar. */
function tap(game, pad, k = 0) {
    game.setPad(k, pad);
    game.frames(1);
    game.setPad(k);
    game.frames(6);
}

function key(game, code) {
    game.emit("keydown", { code, repeat: false, preventDefault() {} });
    game.frames(1);
    game.emit("keyup", { code });
    game.frames(6);
}

async function title({ pads = 1, fake = null, ...options } = {}) {
    globalThis.location = { search: "" };
    const game = await loadGame({ intro: true, audioContext: fake?.FakeAudioContext, ...options });
    for (let k = 0; k < pads; k++) game.setPad(k);
    game.frames(8);
    if (fake) {
        game.emit("keydown", { code: "KeyZ", repeat: false, preventDefault() {} });
        await tick();
        game.frames(8);
        fake.plays.length = 0;
    }
    return game;
}

const names = (fake) => fake.plays.map((p) => p.buffer.url.match(/\/([^/]+)\.ogg$/)[1]).filter((n) => n.startsWith("ui_"));
const row = (game, id) => game.state.screens.menu.rows[id];
const goTo = (game, id) => {
    game.state.menu.cursor = MENU.rows.findIndex((r) => r.id === id);
};

test("el HUD está oculto en el título, el menú, los controles y la asignación, y visible en la partida", async () => {
    const game = await title({ pads: 1 });
    const { hud, screens, menu } = game.state;
    assert.equal(game.state.match.state, "title");
    assert.ok(hud.root.hidden, "título y menú");
    assert.ok(!screens.menu.el.hidden && !screens.root.hidden);

    goTo(game, "controls");
    tap(game, { buttons: [A] });
    assert.ok(hud.root.hidden, "controles");
    assert.ok(!screens.help.el.hidden);
    tap(game, { buttons: [B] });

    goTo(game, "play");
    tap(game, { buttons: [A] });
    assert.ok(hud.root.hidden, "asignación");
    assert.ok(!screens.assign.el.hidden && screens.menu.el.hidden);
    assert.equal(game.hudTexts.length, 0, "nada dibujado en el canvas de interfaz");

    tap(game, { buttons: [START] });
    assert.equal(game.state.match.state, "countdown");
    assert.ok(!hud.root.hidden, "cuenta regresiva");
    assert.ok(screens.root.hidden, "los menús se van");
    game.frames(200);
    assert.equal(game.state.match.state, "playing");
    assert.ok(!hud.root.hidden, "partida");
    assert.equal(menu.cursor, MENU.rows.length - 1);
    game.state.match.state = "roundOver";
    game.frames(2);
    assert.ok(!hud.root.hidden, "fin de ronda");
    game.state.match.state = "matchOver";
    game.state.match.matchWinner = 0;
    game.frames(2);
    assert.ok(!hud.root.hidden && !hud.final.el.hidden, "fin de partida");
});

test("el menú se navega con gamepad y el DOM refleja el foco y los valores", async () => {
    const game = await title();
    const { menu } = game.state;
    assert.ok(row(game, "play").el.classes.has("focus"), "foco inicial en jugar");
    assert.ok(!row(game, "map").el.classes.has("focus"));

    tap(game, stick(0, -1));
    assert.ok(row(game, "controls").el.classes.has("focus") && !row(game, "play").el.classes.has("focus"));
    tap(game, stick(0, -1));
    tap(game, stick(0, -1));
    assert.ok(row(game, "map").el.classes.has("focus"));
    assert.deepEqual(MENU.rows.map((r) => r.id), ["map", "difficulty", "controls", "play"]);

    assert.equal(menu.choice.map, "infinite");
    assert.ok(row(game, "map").val.innerHTML.includes("#40dcff"), "miniatura del mapa Infinito");
    assert.ok(row(game, "map").right.classes.has("dim"), "sin valor a la derecha, la flecha se apaga");
    assert.ok(!row(game, "map").left.classes.has("dim"));
    tap(game, stick(-1, 0));
    assert.equal(menu.choice.map, "classic");
    assert.ok(!row(game, "map").val.innerHTML.includes("#40dcff"), "miniatura del Clásico");
    assert.ok(row(game, "map").val.classes.has("sl-l"), "el valor entra deslizándose desde el lado de la flecha");
    assert.ok(row(game, "map").left.classes.has("dim"));

    tap(game, stick(0, 1));
    assert.ok(row(game, "difficulty").el.classes.has("focus"));
    const pips = () => (row(game, "difficulty").val.innerHTML.match(/ic-pip on/g) ?? []).length;
    assert.equal(pips(), 2, "Normal = 2 de 3");
    tap(game, stick(1, 0));
    assert.equal(pips(), 3, "Difícil = 3 de 3");
    tap(game, stick(-1, 0));
    tap(game, stick(-1, 0));
    assert.equal(pips(), 1, "Fácil = 1 de 3");
    tap(game, stick(1, 0));
    tap(game, stick(1, 0));
    tap(game, stick(1, 0));
    assert.equal(menu.choice.difficulty, "dummy");
    assert.ok(row(game, "difficulty").val.innerHTML.includes("ic-dummy"));
    assert.ok(!/Fácil|Normal|Difícil|Muñeco|Mapa|Bot|Controles/.test(game.state.screens.menu.el.allText.replace("WATERBOTS", "")), "sin palabras: solo íconos");
});

test("la asignación refleja los dispositivos: fichas, columnas, bots y glifos", async () => {
    const game = await title({ pads: 2 });
    const { screens, asignacion } = game.state;
    goTo(game, "play");
    tap(game, { buttons: [A] });
    const { assign } = screens;
    assert.ok(!assign.el.hidden);
    assert.deepEqual([...assign.tokens.keys()], ["keyboard", "pad:0", "pad:1"]);
    const tok = (id) => assign.tokens.get(id);
    assert.ok(tok("keyboard").el.classes.has("joined") && tok("keyboard").el.classes.has("p1"));
    assert.ok(!tok("pad:0").el.classes.has("joined") && !tok("pad:1").el.classes.has("joined"));
    assert.ok(!tok("pad:0").invite.hidden, "sin sumar: glifo A + plus");
    assert.equal(tok("pad:0").el.styleValues["--x"], "180", "el gamepad 1 en la columna de J1");
    assert.equal(tok("pad:1").el.styleValues["--x"], "1160", "el gamepad 2 en la de J2");
    assert.ok(tok("pad:1").right.classes.has("dim") && tok("pad:0").left.classes.has("dim"), "flechas contra la pared al 25 %");
    assert.ok(tok("pad:0").el.children[1].innerHTML.includes("<b>1</b>") && tok("pad:1").el.children[1].innerHTML.includes("<b>2</b>"), "número de gamepad");
    assert.deepEqual(assign.columns.map((c) => c.el.classes.has("bot")), [false, false]);
    assert.ok(assign.columns[0].status.innerHTML.includes("ic-ok"), "J1 con dispositivo sumado: tilde");
    assert.ok(!assign.columns[1].status.innerHTML.includes("ic-ok"), "J2 todavía sin sumar");
    assert.ok(assign.hints.innerHTML.includes("g-a") && assign.hints.innerHTML.includes("g-start"), "glifos del gamepad");

    tap(game, { buttons: [SELECT] }, 1);
    assert.ok(tok("pad:1").el.classes.has("joined") && tok("pad:1").el.classes.has("p2"));
    assert.ok(tok("pad:1").invite.hidden);
    assert.ok(assign.columns[1].status.innerHTML.includes("ic-ok"));

    tap(game, stick(1, 0), 0);
    assert.equal(tok("pad:0").el.styleValues["--x"], "670", "pasa a la bandeja");
    assert.ok(tok("pad:0").el.classes.has("tray"));
    tap(game, stick(1, 0), 1);
    tap(game, stick(-1, 0), 1);
    assert.deepEqual(assign.columns.map((c) => c.el.classes.has("bot")), [false, true], "J2 sin dispositivo: el bot");
    assert.ok(assign.columns[1].status.innerHTML.includes("ic-bot"));
    assert.deepEqual(asignacion.view.bots, [1]);

    key(game, "ArrowRight");
    assert.ok(assign.hints.innerHTML.includes("Enter") && !assign.hints.innerHTML.includes("g-a"), "glifos del teclado tras usarlo");
    game.removePad(1);
    game.frames(3);
    assert.deepEqual([...assign.tokens.keys()], ["keyboard", "pad:0"], "el gamepad desconectado deja de aparecer");
    assert.ok(!/ahog|muert/i.test(screens.root.allText));
});

test("sonidos del menú: foco, valor, bloqueado, abrir, volver y pestañas", async () => {
    const fake = createFakeAudioContext();
    const game = await title({ fake });
    tap(game, stick(0, -1));
    assert.deepEqual(names(fake), ["ui_select"], "mover el foco");
    tap(game, stick(0, -1));
    tap(game, stick(0, -1));
    fake.plays.length = 0;
    tap(game, stick(-1, 0));
    assert.deepEqual(names(fake), ["ui_submit1"], "cambiar un valor");
    tap(game, stick(-1, 0));
    assert.deepEqual(names(fake), ["ui_submit1", "ui_submit7"], "contra la pared: intento sobre algo bloqueado");
    fake.plays.length = 0;
    goTo(game, "controls");
    tap(game, { buttons: [A] });
    assert.deepEqual(names(fake), ["ui_confirm"], "abrir controles");
    fake.plays.length = 0;
    tap(game, { buttons: [RB] });
    assert.deepEqual(names(fake), ["ui_submit2"], "cambiar de pestaña");
    tap(game, { buttons: [RB] });
    assert.deepEqual(names(fake), ["ui_submit2"], "sin pestaña siguiente no suena");
    tap(game, { buttons: [B] });
    assert.deepEqual(names(fake), ["ui_submit2", "ui_back"], "volver");
    fake.plays.length = 0;
    goTo(game, "play");
    tap(game, { buttons: [A] });
    assert.deepEqual(names(fake), ["ui_confirm"], "pasar a la asignación");
});

test("sonidos de la asignación: sumar, mover, quitar, conectar, desconectar, volver y empezar", async () => {
    const fake = createFakeAudioContext();
    const game = await title({ fake, pads: 2 });
    goTo(game, "play");
    tap(game, { buttons: [A] });
    fake.plays.length = 0;
    tap(game, { buttons: [A] }, 0);
    assert.deepEqual(names(fake), ["ui_player_join"], "sumar un dispositivo");
    fake.plays.length = 0;
    tap(game, stick(1, 0), 0);
    assert.deepEqual(names(fake), ["ui_player_leave"], "quitar: vuelve a la bandeja");
    fake.plays.length = 0;
    tap(game, stick(1, 0), 0);
    assert.deepEqual(names(fake), ["ui_player_select"], "mover una ficha de columna");
    fake.plays.length = 0;
    tap(game, stick(1, 0), 0);
    assert.deepEqual(names(fake), ["ui_submit7"], "empujar contra la pared");
    fake.plays.length = 0;
    game.removePad(1);
    game.frames(3);
    assert.deepEqual(names(fake), ["ui_player_leave"], "desconectar un gamepad");
    fake.plays.length = 0;
    game.setPad(1);
    game.frames(3);
    assert.deepEqual(names(fake), ["ui_player_join"], "conectar un gamepad");
    fake.plays.length = 0;
    tap(game, { buttons: [B] });
    assert.deepEqual(names(fake), ["ui_back"], "volver");
    goTo(game, "play");
    tap(game, { buttons: [A] });
    fake.plays.length = 0;
    tap(game, { buttons: [START] });
    assert.equal(game.state.match.state, "countdown");
    assert.equal(names(fake)[0], "ui_play", "empezar la partida");
});

test("sonidos de la partida: cuenta, ¡YA!, aviso de inundación, banda de fin de ronda, pausa, bloqueo, revancha y menú", async () => {
    const fake = createFakeAudioContext();
    const game = await title({ fake });
    const { match } = game.state;
    game.state.menu.values.map = "classic";
    game.state.arrancarPartida();
    fake.plays.length = 0;
    game.frames(1);
    assert.deepEqual(names(fake), ["ui_play", "ui_countdown"], "empezar y el 3");
    assert.ok(fake.plays[0].stopped, "el 3 corta al sonido de empezar");
    game.frames(60);
    game.frames(60);
    assert.deepEqual(names(fake), ["ui_play", "ui_countdown", "ui_countdown", "ui_countdown"], "3, 2, 1");
    fake.plays.length = 0;
    game.frames(70);
    assert.equal(match.state, "playing");
    assert.deepEqual(names(fake), ["ui_submit3"], "¡YA!");

    fake.plays.length = 0;
    match.roundTime = game.state.flood.config.start - 5;
    game.frames(2);
    assert.deepEqual(names(fake), ["ui_submit4"], "aviso de inundación próxima");
    fake.plays.length = 0;
    game.frames(5);
    assert.deepEqual(names(fake), [], "una sola vez");

    game.emit("keydown", { code: "F3", repeat: false, preventDefault() {} });
    game.frames(1);
    game.emit("keyup", { code: "F3" });
    game.frames(1);
    assert.deepEqual(names(fake), ["ui_pause"], "abrir el menú de debug");
    game.emit("keydown", { code: "F3", repeat: false, preventDefault() {} });
    game.frames(1);
    game.emit("keyup", { code: "F3" });
    game.frames(1);
    assert.deepEqual(names(fake), ["ui_pause", "ui_pause"], "y cerrarlo");

    fake.plays.length = 0;
    match.state = "roundOver";
    match.roundWinner = 0;
    match.timer = 3;
    game.frames(2);
    assert.ok(names(fake).includes("ui_submit6"), `banda de fin de ronda: ${names(fake)}`);

    fake.plays.length = 0;
    match.state = "matchOver";
    match.matchWinner = 0;
    match.timer = 1;
    game.setPad(0, { buttons: [A] });
    game.frames(1);
    game.setPad(0);
    game.frames(1);
    assert.deepEqual(names(fake), ["ui_submit7"], "botón en su segundo de bloqueo");
    match.timer = 0;
    fake.plays.length = 0;
    game.setPad(0, { buttons: [A] });
    game.frames(1);
    game.setPad(0);
    assert.equal(match.state, "countdown");
    assert.equal(names(fake)[0], "ui_play", "revancha");

    match.state = "matchOver";
    match.timer = 0;
    game.frames(2);
    fake.plays.length = 0;
    game.setPad(0, { buttons: [START] });
    game.frames(1);
    game.setPad(0);
    assert.equal(match.state, "title");
    assert.equal(names(fake)[0], "ui_back", "volver al menú desde el fin de partida");
});

test("sonido del premio de etapa de Infinito", async () => {
    const fake = createFakeAudioContext();
    const game = await title({ fake });
    game.state.menu.values.map = "infinite";
    game.state.arrancarPartida();
    game.frames(200);
    assert.equal(game.state.match.state, "playing");
    fake.plays.length = 0;
    game.state.stagePrizes.banner = { text: "", k: 1, until: 1e9 };
    game.frames(2);
    assert.deepEqual(names(fake), ["ui_submit5"]);
    assert.ok(!game.state.hud.prize.el.hidden);
    assert.equal(game.state.hud.prize.badge.textContent, "J2");
});

test("reglas de sonido de interfaz: uno a la vez, navegación cada 70 ms como mucho y 6 dB bajo los golpes", async () => {
    assert.ok(Math.abs(20 * Math.log10(UI_VOLUME) + 6) < 0.05);
    const files = Object.values(UI_SOUNDS).map((s) => s.file);
    assert.ok(files.every((f) => /^ui_/.test(f)) && !files.some((f) => /^menu_/.test(f)));
    assert.equal(UI_SOUNDS.focus.cooldown, 0.07);

    const fake = createFakeAudioContext();
    const game = await title({ fake });
    const audio = game.state.audio;
    assert.equal(audio.playUi("focus", 10), true);
    assert.equal(audio.playUi("focus", 10.05), false, "dentro de los 70 ms no suena");
    assert.equal(audio.playUi("focus", 10.08), true);
    assert.equal(fake.plays.length, 2);
    assert.ok(fake.plays[0].stopped, "el sonido nuevo corta al anterior");
    assert.equal(audio.playUi("confirm", 10.09), true);
    assert.ok(fake.plays[1].stopped);
    assert.ok(!fake.plays[2].stopped);
    assert.equal(audio.playUi("noExiste", 11), false);
});

test("los archivos de sonido de interfaz existen en audio/sfx como .ogg y no hay .wav", async () => {
    const { existsSync, readdirSync } = await import("node:fs");
    for (const { file } of Object.values(UI_SOUNDS)) {
        assert.ok(existsSync(new URL(`../audio/sfx/${file}.ogg`, import.meta.url)), file);
    }
    const sfx = readdirSync(new URL("../audio/sfx/", import.meta.url));
    assert.ok(!sfx.some((f) => f.endsWith(".wav") || f.startsWith("menu_")));
});
