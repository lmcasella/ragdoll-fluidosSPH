/**
 * #163 y #216: la ayuda de controles vive en su propia pantalla (fila "Controles" del menú), con pestañas gamepad y teclado;
 * ya no se dibuja en el canvas ni durante la partida.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const { HELP, HelpScreen, MENU } = await import("../src/ui/menu.js");

const A = 0;
const B = 1;
const LB = 4;
const RB = 5;

function tap(game, pad, k = 0) {
    game.setPad(k, pad);
    game.frames(1);
    game.setPad(k);
    game.frames(1);
}

const stick = (x, y) => ({ axes: [x, y, 0, 0] });

test("la pantalla de controles se abre desde la fila Controles, cambia de pestaña con LB y RB y vuelve con B", async () => {
    globalThis.location = { search: "" };
    const game = await loadGame({ intro: true });
    game.setPad(0);
    game.frames(3);
    const { menu, screens, ayuda } = game.state;
    assert.equal(game.hudTexts.length, 0, "ya no se dibuja texto de ayuda en el canvas");
    assert.ok(screens.help.el.hidden);

    tap(game, stick(0, -1));
    assert.equal(MENU.rows[menu.cursor].id, "controls");
    tap(game, { buttons: [A] });
    assert.ok(!screens.help.el.hidden, "A sobre la fila abre la pantalla");
    assert.ok(screens.menu.el.hidden && screens.assign.el.hidden);
    assert.equal(game.state.match.state, "title");
    assert.equal(ayuda.view.tab, "pad");
    assert.ok(screens.help.tabs.pad.classes.has("on") && !screens.help.tabs.keyboard.classes.has("on"));
    assert.ok(!screens.help.bodies.pad.hidden && screens.help.bodies.keyboard.hidden);

    tap(game, { buttons: [RB] });
    assert.equal(ayuda.view.tab, "keyboard");
    assert.ok(screens.help.tabs.keyboard.classes.has("on"));
    assert.ok(screens.help.bodies.pad.hidden && !screens.help.bodies.keyboard.hidden);
    tap(game, { buttons: [RB] });
    assert.equal(ayuda.view.tab, "keyboard", "no pasa de la última pestaña");
    tap(game, { buttons: [LB] });
    assert.equal(ayuda.view.tab, "pad");

    tap(game, { buttons: [B] });
    assert.ok(screens.help.el.hidden && !screens.menu.el.hidden, "B vuelve al menú");
    assert.equal(MENU.rows[menu.cursor].id, "controls", "con el foco donde estaba");
    ayuda.open();
    assert.equal(ayuda.view.tab, "pad");
});

test("la pantalla de controles muestra las acciones del gamepad con una palabra y la tarjeta única del teclado de J1", () => {
    const words = [...HELP.pad.left, ...HELP.pad.right, ...HELP.pad.combos].map((e) => e.word).filter(Boolean);
    assert.deepEqual(words, ["Bloquear", "Moverse", "Disparar", "Gancho", "Golpe", "Saltar", "Apuntar", "Rodar", "Bajar", "Patada", "Combo"]);
    assert.ok(!HELP.pad.right.some((e) => e.glyph === "Y"), "Y no se muestra");
    for (const row of HELP.keyboard.rows.filter((r) => r.word)) {
        assert.ok(words.includes(row.word), `mismas palabras que el gamepad: ${row.word}`);
    }
    const bloquear = HELP.keyboard.rows.find((r) => r.word === "Bloquear");
    assert.deepEqual(bloquear.keys, ["Shift"], "las teclas que usa KEYBOARD_LAYOUT");
    assert.deepEqual(HELP.keyboard.rows.find((r) => r.word === "Saltar").keys, ["Espacio"]);
    const screen = new HelpScreen();
    assert.equal(screen.update({ x: 1 }), null);
    assert.equal(screen.view.tab, "keyboard", "el teclado cambia de pestaña con izquierda y derecha");
    assert.equal(screen.update({ back: true }), "back");
});

test("la ayuda de controles no está en la partida", async () => {
    globalThis.location = { search: "" };
    const game = await loadGame({ intro: true });
    game.state.arrancarPartida();
    game.state.match.state = "playing";
    game.frames(3);
    assert.ok(game.state.screens.root.hidden);
    assert.ok(game.state.screens.help.el.hidden);
});
