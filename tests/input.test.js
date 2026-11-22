import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Stubs del navegador antes de importar Input
const handlers = {};
let pads = [];
globalThis.window = {
    addEventListener: (type, fn) => {
        (handlers[type] ??= []).push(fn);
    },
};
Object.defineProperty(globalThis, "navigator", {
    value: { getGamepads: () => pads },
    configurable: true,
});

const { Input, TAP_MAX } = await import("../js/Input.js");

const emit = (type, e = {}) => handlers[type].forEach((fn) => fn(e));
const mouseMove = (x, y) => emit("mousemove", { clientX: x, clientY: y });
const pad = (rx = 0, ry = 0) => ({
    connected: true,
    axes: [0, 0, rx, ry],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
});

/** Teclado en J1, gamepad 0 en J1 y gamepad 1 en J2: lo que cubren estas pruebas, salvo donde se cambia. */
const LEGACY = { keyboard: 0, "pad:0": 0, "pad:1": 1 };

let input;
beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    pads = [pad()];
    input = new Input(2);
    input.setAssignment(LEGACY);
});

test("mouse movido antes del stick: al soltar el stick no hay pointer", () => {
    mouseMove(100, 200);
    assert.deepEqual(input.poll()[0].pointer, { x: 100, y: 200 });

    mouseMove(300, 50);
    pads = [pad(1, 0)];
    const usando = input.poll()[0];
    assert.deepEqual(usando.aim, { x: 1, y: -0 });
    assert.equal(usando.pointer, null);

    pads = [pad()];
    const suelto = input.poll()[0];
    assert.equal(suelto.aim, null);
    assert.equal(suelto.pointer, null);
});

test("mousemove posterior al uso del stick devuelve el pointer", () => {
    pads = [pad(0, -1)];
    input.poll();
    pads = [pad()];
    assert.equal(input.poll()[0].pointer, null);

    mouseMove(10, 20);
    assert.deepEqual(input.poll()[0].pointer, { x: 10, y: 20 });
});

test("el stick sostenido no cede ante el mouse", () => {
    pads = [pad(1, 0)];
    input.poll();
    mouseMove(10, 20);
    assert.equal(input.poll()[0].pointer, null);
});

test("sin mouse movido no hay pointer", () => {
    assert.equal(input.poll()[0].pointer, null);
});

test("el pointer es solo del jugador con el teclado", () => {
    mouseMove(5, 5);
    const [, j2] = input.poll();
    assert.equal(j2.pointer, null);
});

test("el clic es action del J1 solo en un frame", () => {
    emit("mousedown", { button: 0 });
    const [j1, j2] = input.poll();
    assert.equal(j1.action, true);
    assert.equal(j2.action, false);
    assert.equal(input.poll()[0].action, false);
});

const padWith = (...pressed) => {
    const p = pad();
    for (const i of pressed) p.buttons[i].pressed = true;
    return p;
};

test("fire del gamepad se mantiene en varios polls y action es solo el flanco", () => {
    pads = [padWith(7)];
    const first = input.poll()[0];
    assert.equal(first.fire, true);
    assert.equal(first.action, true);
    for (let i = 0; i < 3; i++) {
        const held = input.poll()[0];
        assert.equal(held.fire, true);
        assert.equal(held.action, false);
    }
    pads = [pad()];
    assert.equal(input.poll()[0].fire, false);
});

test("RT también mantiene fire", () => {
    pads = [padWith(7)];
    input.poll();
    const held = input.poll()[0];
    assert.equal(held.fire, true);
    assert.equal(held.action, false);
});

test("Espacio salta y es action en el flanco, pero no dispara", () => {
    emit("keydown", { code: "Space", preventDefault() {} });
    const first = input.poll()[0];
    assert.deepEqual([first.jump, first.action, first.fire], [true, true, false]);
    const held = input.poll()[0];
    assert.deepEqual([held.jump, held.jumpHeld, held.action, held.fire], [false, true, false, false]);
    emit("keyup", { code: "Space" });
});

test("el teclado y el mouse manejan solo al jugador al que están asignados", () => {
    input.setAssignment({ keyboard: 1 });
    emit("keydown", { code: "KeyF", preventDefault() {} });
    emit("mousedown", { button: 0 });
    mouseMove(7, 8);
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.punch, j1.fire, j1.pointer], [false, false, null]);
    assert.deepEqual([j2.punch, j2.fire, j2.pointer], [true, true, { x: 7, y: 8 }]);
    emit("keyup", { code: "KeyF" });
    emit("mouseup", { button: 0 });
});

test("un gamepad maneja al jugador asignado y no a otro, sin importar su orden", () => {
    input.setAssignment({ keyboard: null, "pad:0": 1, "pad:1": 0 });
    pads = [padWith(1), padWith(7)];
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.punch, j1.fire, j2.punch, j2.fire], [false, true, true, false]);
});

test("un jugador sin dispositivos queda quieto aunque haya teclas y gamepads", () => {
    input.setAssignment({ keyboard: null, "pad:0": null });
    pads = [padWith(0, 7)];
    emit("keydown", { code: "KeyA", preventDefault() {} });
    const [j1, j2] = input.poll();
    for (const s of [j1, j2]) assert.deepEqual([s.left, s.jump, s.fire, s.action], [false, false, false, false]);
    emit("keyup", { code: "KeyA" });
});

test("dos gamepads del mismo jugador se combinan con O", () => {
    input.setAssignment({ keyboard: null, "pad:0": 0, "pad:1": 0 });
    pads = [padWith(1), padWith(7)];
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.punch, j1.fire, j2.punch, j2.fire], [true, true, false, false]);
});

test("el mouse mantenido da fire solo al J1 y mouseup lo apaga", () => {
    emit("mousedown", { button: 0 });
    let [j1, j2] = input.poll();
    assert.equal(j1.fire, true);
    assert.equal(j2.fire, false);
    [j1, j2] = input.poll();
    assert.equal(j1.fire, true, "sigue apretado");
    assert.equal(j1.action, false);
    assert.equal(j2.fire, false);
    emit("mouseup", { button: 0 });
    assert.equal(input.poll()[0].fire, false);
});

test("blur apaga el fire del mouse", () => {
    emit("mousedown", { button: 0 });
    input.poll();
    emit("blur");
    assert.equal(input.poll()[0].fire, false);
});

test("soltar el mouse no apaga el fire del gamepad", () => {
    pads = [padWith(7)];
    emit("mousedown", { button: 0 });
    input.poll();
    emit("mouseup", { button: 0 });
    assert.equal(input.poll()[0].fire, true);
});

test("solo el botón principal del mouse dispara", () => {
    emit("mousedown", { button: 2 });
    let [j1] = input.poll();
    assert.equal(j1.fire, false);
    assert.equal(j1.action, false);
    emit("mousedown", { button: 1 });
    assert.equal(input.poll()[0].fire, false);
});

test("soltar otro botón del mouse no apaga el fire del botón principal", () => {
    emit("mousedown", { button: 0 });
    input.poll();
    emit("mouseup", { button: 2 });
    assert.equal(input.poll()[0].fire, true);
});

test("el botón derecho no abre el menú contextual ni apaga el fire del botón izquierdo", () => {
    let prevented = false;
    emit("mousedown", { button: 0 });
    input.poll();
    emit("contextmenu", { button: 2, preventDefault: () => (prevented = true) });
    assert.equal(prevented, true);
    assert.equal(input.poll()[0].fire, true);
});

const padAxes = (buttons, axes) => {
    const p = padWith(...buttons);
    p.axes = axes;
    return p;
};
const key = (code) => emit("keydown", { code, preventDefault() {} });
const unkey = (code) => emit("keyup", { code });

test("el stick izquierdo mueve y arriba no salta; la cruceta no mueve", () => {
    pads = [padAxes([], [0.5, -0.5, 0, 0])];
    let s = input.poll()[0];
    assert.deepEqual([s.right, s.up, s.left, s.down, s.jump, s.drop], [true, true, false, false, false, false]);
    pads = [padAxes([12, 15], [0, 0, 0, 0])];
    s = input.poll()[0];
    assert.deepEqual([s.right, s.up, s.left, s.down], [false, false, false, false]);
});

test("A salta en el flanco y no se repite al mantener", () => {
    pads = [padWith(0)];
    assert.equal(input.poll()[0].jump, true);
    assert.equal(input.poll()[0].jump, false);
});

test("drop: A con ly > 0,6 (0,61), jump con 0,59", () => {
    pads = [padAxes([0], [0, 0.61, 0, 0])];
    let s = input.poll()[0];
    assert.deepEqual([s.drop, s.jump], [true, false]);
    pads = [padAxes([], [0, 0.59, 0, 0])];
    input.poll();
    pads = [padAxes([0], [0, 0.59, 0, 0])];
    s = input.poll()[0];
    assert.deepEqual([s.drop, s.jump], [false, true]);
});

test("drop con el teclado: S + Espacio", () => {
    key("KeyS");
    key("Space");
    const [j1] = input.poll();
    assert.deepEqual([j1.drop, j1.jump], [true, false]);
    unkey("KeyS");
    unkey("Space");
});

test("W es arriba y no salta; Espacio salta", () => {
    key("KeyW");
    let [j1] = input.poll();
    assert.deepEqual([j1.jump, j1.up], [false, true]);
    key("Space");
    [j1] = input.poll();
    assert.deepEqual([j1.jump, j1.up], [true, true]);
    unkey("KeyW");
    unkey("Space");
});

test("RT dispara y mantiene fire; solo RT, no A", () => {
    pads = [padWith(7)];
    const first = input.poll()[0];
    assert.deepEqual([first.fire, first.action, first.jump], [true, true, false]);
    const held = input.poll()[0];
    assert.deepEqual([held.fire, held.action], [true, false]);
});

test("B golpea en el flanco; F con el teclado", () => {
    pads = [padWith(1)];
    assert.equal(input.poll()[0].punch, true);
    assert.equal(input.poll()[0].punch, false);
    pads = [pad()];
    input.poll();
    key("KeyF");
    assert.equal(input.poll()[0].punch, true);
    unkey("KeyF");
});

test("ninguna tecla Numpad en los controles de juego y no queda el esquema de J2", async () => {
    const mod = await import("../js/Input.js");
    const codes = Object.values(mod.KEYBOARD_LAYOUT).flat();
    assert.deepEqual(codes.filter((code) => code.startsWith("Numpad")), []);
    assert.equal(mod.KEYBOARD_LAYOUTS, undefined);
    for (const code of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "ControlRight"]) {
        assert.ok(!codes.includes(code), code);
    }
});

test("Shift mantiene block; Shift + Espacio rueda; F es golpe y S + F es patada", () => {
    pads = [pad()];
    key("ShiftLeft");
    let [j1] = input.poll();
    assert.deepEqual([j1.block, j1.roll], [true, false]);
    assert.equal(input.poll()[0].block, true);
    key("Space");
    [j1] = input.poll();
    assert.deepEqual([j1.roll, j1.jump, j1.drop, j1.block], [true, false, false, true]);
    unkey("Space");
    unkey("ShiftLeft");
    assert.equal(input.poll()[0].block, false);
    key("ShiftRight");
    assert.equal(input.poll()[0].block, true);
    unkey("ShiftRight");
    input.poll();

    key("KeyF");
    [j1] = input.poll();
    assert.deepEqual([j1.punch, j1.kick], [true, false]);
    unkey("KeyF");
    key("KeyS");
    key("KeyF");
    [j1] = input.poll();
    assert.deepEqual([j1.punch, j1.kick], [false, true]);
    unkey("KeyS");
    unkey("KeyF");
});
test("kick en J1: S + F; con el stick abajo (ly > 0,6) + B", () => {
    pads = [pad()];
    key("KeyS");
    key("KeyF");
    let s = input.poll()[0];
    assert.deepEqual([s.punch, s.kick], [false, true]);
    unkey("KeyS");
    pads = [padAxes([1], [0, 0.61, 0, 0])];
    s = input.poll()[0];
    assert.deepEqual([s.punch, s.kick], [false, true]);
    pads = [padAxes([], [0, 0.59, 0, 0])];
    input.poll();
    pads = [padAxes([1], [0, 0.59, 0, 0])];
    s = input.poll()[0];
    assert.deepEqual([s.punch, s.kick], [true, false]);
});

test("R18: LT mantiene block y no lo cortan las teclas; LT + A rueda (no salta ni baja); LT + Espacio también rueda", () => {
    pads = [padWith(6)];
    key("ShiftLeft");
    assert.equal(input.poll()[0].block, true);
    unkey("ShiftLeft");
    assert.equal(input.poll()[0].block, true, "soltar G no corta el bloqueo si LT sigue apretado");
    pads = [pad()];
    assert.equal(input.poll()[0].block, false);

    pads = [padWith(6, 0)];
    let s = input.poll()[0];
    assert.deepEqual([s.roll, s.jump, s.drop, s.block], [true, false, false, true]);
    assert.equal(input.poll()[0].roll, false, "el flanco no se repite al mantener");

    pads = [padAxes([6, 0], [0, 0.9, 0, 0])];
    s = input.poll()[0];
    assert.deepEqual([s.roll, s.jump, s.drop], [false, false, false]);
    pads = [padAxes([6], [0, 0.9, 0, 0])];
    input.poll();
    pads = [padAxes([6, 0], [0, 0.9, 0, 0])];
    s = input.poll()[0];
    assert.deepEqual([s.roll, s.jump, s.drop], [true, false, false], "roll gana sobre drop");

    pads = [padWith(6)];
    key("Space");
    s = input.poll()[0];
    assert.deepEqual([s.roll, s.jump], [true, false]);
    unkey("Space");
});

test("X, E y clic derecho dan grapple mantenido", () => {
    pads = [padWith(2)];
    assert.equal(input.poll()[0].grapple, true);
    assert.equal(input.poll()[0].grapple, true);
    pads = [pad()];
    assert.equal(input.poll()[0].grapple, false);
    key("KeyE");
    let [j1, j2] = input.poll();
    assert.deepEqual([j1.grapple, j2.grapple], [true, false]);
    unkey("KeyE");
    emit("mousedown", { button: 2 });
    [j1, j2] = input.poll();
    assert.deepEqual([j1.grapple, j1.fire, j2.grapple], [true, false, false]);
    emit("mouseup", { button: 2 });
    assert.equal(input.poll()[0].grapple, false);
});

test("LB: toque de 0,24 s da arma anterior al soltar; de 0,26 s no cambia", () => {
    assert.equal(TAP_MAX, 0.25);
    for (const [hold, expected] of [[0.24, -1], [0.26, 0]]) {
        pads = [padWith(4)];
        let s = input.poll(10)[0];
        assert.equal(s.weaponStep, 0, "al apretar no cambia");
        pads = [pad()];
        s = input.poll(10 + hold)[0];
        assert.equal(s.weaponStep, expected, `${hold} s`);
    }
});

test("RB da arma siguiente en el flanco", () => {
    pads = [padWith(5)];
    assert.equal(input.poll()[0].weaponStep, 1);
    assert.equal(input.poll()[0].weaponStep, 0);
});

test("Q (toque corto) da el arma anterior y R la siguiente", () => {
    key("KeyQ");
    input.poll(1);
    unkey("KeyQ");
    assert.equal(input.poll(1.1)[0].weaponStep, -1);
    key("KeyR");
    assert.equal(input.poll(1.2)[0].weaponStep, 1);
    assert.equal(input.poll(1.3)[0].weaponStep, 0);
});

test("Q apretada sin soltar en el mismo poll da -1 al soltar rápido", () => {
    key("KeyQ");
    input.poll(5);
    unkey("KeyQ");
    assert.equal(input.poll(5.1)[0].weaponStep, -1);
});

test("la cruceta elige el arma por posición: arriba 1, derecha 2, abajo 3, izquierda 4", () => {
    for (const [button, weapon] of [[12, 1], [15, 2], [13, 3], [14, 4]]) {
        pads = [padWith(button)];
        assert.equal(input.poll()[0].weapon, weapon);
        pads = [pad()];
        input.poll();
    }
});

test("las teclas 1-4 eligen el arma directa", () => {
    key("Digit3");
    assert.equal(input.poll()[0].weapon, 3);
    key("Digit4");
    assert.equal(input.poll()[0].weapon, 4);
});

test("el teclado no pisa al gamepad, en ninguna intención, y al revés", () => {
    const cases = [
        ["grapple", [2], "KeyE", "grapple"],
        ["up", [], "KeyW", "up"],
    ];
    for (const [name, buttons, code] of cases) {
        pads = [padWith(...buttons)];
        key(code);
        unkey(code);
        pads = [padWith(...buttons)];
        if (buttons.length) assert.equal(input.poll()[0][name], true, `${name}: gamepad con la tecla suelta`);
        pads = [pad()];
        key(code);
        assert.equal(input.poll()[0][name], true, `${name}: tecla con el gamepad suelto`);
        unkey(code);
        input.poll();
    }
    pads = [padAxes([], [0, -1, 0, 0])];
    key("KeyW");
    unkey("KeyW");
    assert.equal(input.poll()[0].up, true, "stick arriba con la tecla suelta");
    pads = [padWith(0)];
    key("Space");
    assert.equal(input.poll()[0].jump, true);
    unkey("Space");
});

test("el gamepad asignado se combina con el teclado del mismo jugador", () => {
    pads = [padWith(1), padWith(7)];
    key("KeyF");
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.punch, j1.fire, j2.punch, j2.fire], [true, false, false, true]);
    unkey("KeyF");
});
test("wheel: LB mantenido abre la rueda recién a TAP_MAX y la dirección es la del stick derecho con Y arriba", () => {
    pads = [padAxes([4], [0, 0, 0, 0])];
    let s = input.poll(10)[0];
    assert.equal(s.wheel, null);
    s = input.poll(10 + TAP_MAX - 0.01)[0];
    assert.equal(s.wheel, null);
    pads = [padAxes([4], [0, 0, 0.8, -0.6])];
    s = input.poll(10 + TAP_MAX)[0];
    assert.deepEqual(s.wheel, { open: true, x: 0.8, y: 0.6 });
    assert.equal(s.wheelPick, null);
    assert.equal(s.aim, null);
});

test("wheel: dentro de la zona muerta (0,4) la dirección es (0, 0)", () => {
    pads = [padAxes([4], [0, 0, 0, 0])];
    input.poll(10);
    pads = [padAxes([4], [0, 0, 0.39, 0])];
    assert.deepEqual(input.poll(11)[0].wheel, { open: true, x: 0, y: 0 });
});

test("wheelPick: al soltar LB da la dirección del stick, solo en ese poll, y la rueda se cierra", () => {
    pads = [padAxes([4], [0, 0, 0, 0])];
    input.poll(10);
    pads = [padAxes([4], [0, 0, 0, -1])];
    input.poll(11);
    pads = [padAxes([], [0, 0, 0, -1])];
    let s = input.poll(11.1)[0];
    assert.deepEqual(s.wheelPick, { x: 0, y: 1 });
    assert.equal(s.wheel, null);
    assert.equal(s.weaponStep, 0);
    s = input.poll(11.2)[0];
    assert.equal(s.wheelPick, null);
    assert.deepEqual(s.aim, { x: 0, y: 1 });
});

test("wheelPick: soltar con el stick al centro da cancel", () => {
    pads = [padAxes([4], [0, 0, 0, 0])];
    input.poll(10);
    input.poll(11);
    pads = [padAxes([], [0, 0, 0, 0])];
    assert.equal(input.poll(11.1)[0].wheelPick, "cancel");
});

test("un toque corto de LB no abre la rueda ni da wheelPick", () => {
    pads = [padAxes([4], [0, 0, 0, 0])];
    input.poll(10);
    pads = [padAxes([], [0, 0, 0, 0])];
    const s = input.poll(10.1)[0];
    assert.deepEqual([s.wheel, s.wheelPick, s.weaponStep], [null, null, -1]);
});

test("wheel con el teclado: elige lo que apunta (mouse en J1), nunca las teclas de movimiento", () => {
    key("KeyQ");
    input.poll(10);
    key("KeyD");
    key("KeyW");
    mouseMove(300, 40);
    let [j1, j2] = input.poll(11);
    assert.deepEqual(j1.wheel, { open: true, x: 0, y: 0, pointer: { x: 300, y: 40 } });
    assert.equal(j2.wheel, null);
    assert.equal(j1.left, false);
    assert.equal(j1.right, true);
    unkey("KeyQ");
    [j1, j2] = input.poll(11.1);
    assert.deepEqual(j1.wheelPick, { x: 0, y: 0, pointer: { x: 300, y: 40 } });
    unkey("KeyD");
    unkey("KeyW");
});

test("wheel: el stick derecho gana sobre las teclas de dirección en la rueda abierta con la tecla", () => {
    key("KeyQ");
    input.poll(10);
    key("KeyD");
    pads = [padAxes([], [0, 0, 0, 1])];
    assert.deepEqual(input.poll(11)[0].wheel, { open: true, x: 0, y: -1 });
    unkey("KeyQ");
    unkey("KeyD");
});

test("wheel: con LB apretado, Q no cierra la rueda ni cambia su dirección", () => {
    pads = [padAxes([4], [0, 0, 0, 0])];
    input.poll(10);
    key("KeyQ");
    key("KeyD");
    let s = input.poll(11)[0];
    assert.deepEqual(s.wheel, { open: true, x: 0, y: 0 });
    unkey("KeyQ");
    s = input.poll(11.1)[0];
    assert.deepEqual(s.wheel, { open: true, x: 0, y: 0 });
    assert.equal(s.wheelPick, null);
    unkey("KeyD");
});

test("wheel: abierta con Q, LB apretado y soltado no la cierra; soltar Q con LB apretado cierra sin reabrir", () => {
    key("KeyQ");
    input.poll(10);
    let s = input.poll(11)[0];
    assert.equal(s.wheel.open, true);
    pads = [padAxes([4], [0, 0, 0, 0])];
    s = input.poll(11.1)[0];
    assert.equal(s.wheel.open, true);
    pads = [padAxes([], [0, 0, 0, 0])];
    s = input.poll(11.2)[0];
    assert.equal(s.wheel.open, true);
    assert.equal(s.wheelPick, null);
    pads = [padAxes([4], [0, 0, 0, 0])];
    unkey("KeyQ");
    s = input.poll(11.3)[0];
    assert.equal(s.wheelPick, "cancel");
    assert.equal(s.wheel, null);
    s = input.poll(12)[0];
    assert.equal(s.wheel, null);
});

test("la cruceta, 1-4 y RB siguen funcionando con la rueda abierta", () => {
    pads = [padAxes([4], [0, 0, 0, 0])];
    input.poll(10);
    pads = [padAxes([4, 12], [0, 0, 0, 0])];
    let s = input.poll(11)[0];
    assert.equal(s.wheel.open, true);
    assert.equal(s.weapon, 1);
    pads = [padAxes([4, 5], [0, 0, 0, 0])];
    assert.equal(input.poll(11.1)[0].weaponStep, 1);
});


test("start es el flanco del botón 9 del gamepad, de un solo frame", () => {
    const p = pad();
    p.buttons[9].pressed = true;
    pads = [p];
    assert.equal(input.poll()[0].start, true);
    assert.equal(input.poll()[0].start, false);
    p.buttons[9].pressed = false;
    assert.equal(input.poll()[0].start, false);
});

test("Escape es start del jugador con el teclado, solo en el frame en que se aprieta", () => {
    emit("keydown", { code: "Escape", preventDefault() {} });
    const [j1, j2] = input.poll();
    assert.equal(j1.start, true);
    assert.equal(j2.start, false);
    emit("keyup", { code: "Escape" });
    assert.equal(input.poll()[0].start, false);
});

test("el teclado no pisa a start del gamepad", () => {
    const p = pad();
    p.buttons[9].pressed = true;
    pads = [p];
    emit("keydown", { code: "KeyA", preventDefault() {} });
    assert.equal(input.poll()[0].start, true);
});
/** Cada intención del juego con cómo la produce el gamepad y cómo el teclado y mouse de J1; `done` dice cuándo se cumplió. */
const PARITY = [
    { intent: "left", pad: () => [padAxes([], [-1, 0, 0, 0])], keys: ["KeyA"], done: (s) => s.left },
    { intent: "right", pad: () => [padAxes([], [1, 0, 0, 0])], keys: ["KeyD"], done: (s) => s.right },
    { intent: "up", pad: () => [padAxes([], [0, -1, 0, 0])], keys: ["KeyW"], done: (s) => s.up },
    { intent: "down", pad: () => [padAxes([], [0, 1, 0, 0])], keys: ["KeyS"], done: (s) => s.down },
    { intent: "jump", pad: () => [padWith(0)], keys: ["Space"], done: (s) => s.jump && s.jumpHeld && s.action },
    { intent: "drop", pad: () => [padAxes([0], [0, 0.9, 0, 0])], keys: ["KeyS", "Space"], done: (s) => s.drop && s.strongDown },
    { intent: "roll", pad: () => [padWith(6, 0)], keys: ["ShiftLeft", "Space"], done: (s) => s.roll && s.block },
    { intent: "action", pad: () => [padWith(7)], keys: ["Space"], done: (s) => s.action },
    { intent: "start", pad: () => [padWith(9)], keys: ["Escape"], done: (s) => s.start },
    { intent: "fire", pad: () => [padWith(7)], mouse: 0, done: (s) => s.fire },
    { intent: "grapple", pad: () => [padWith(2)], keys: ["KeyE"], done: (s) => s.grapple },
    { intent: "grapple (mouse)", pad: () => [padWith(2)], mouse: 2, done: (s) => s.grapple },
    { intent: "block", pad: () => [padWith(6)], keys: ["ShiftRight"], done: (s) => s.block },
    { intent: "punch", pad: () => [padWith(1)], keys: ["KeyF"], done: (s) => s.punch },
    { intent: "kick", pad: () => [padAxes([1], [0, 0.9, 0, 0])], keys: ["KeyS", "KeyF"], done: (s) => s.kick && !s.punch },
    { intent: "weapon 1", pad: () => [padWith(12)], keys: ["Digit1"], done: (s) => s.weapon === 1 },
    { intent: "weapon 2", pad: () => [padWith(15)], keys: ["Digit2"], done: (s) => s.weapon === 2 },
    { intent: "weapon 3", pad: () => [padWith(13)], keys: ["Digit3"], done: (s) => s.weapon === 3 },
    { intent: "weapon 4", pad: () => [padWith(14)], keys: ["Digit4"], done: (s) => s.weapon === 4 },
    { intent: "weaponStep +1", pad: () => [padWith(5)], keys: ["KeyR"], done: (s) => s.weaponStep === 1 },
    {
        intent: "weaponStep -1",
        pad: () => [padWith(4)],
        keys: ["KeyQ"],
        release: true,
        done: (s) => s.weaponStep === -1,
    },
    {
        intent: "wheel",
        pad: () => [padAxes([4], [0, 0, 0.8, 0])],
        keys: ["KeyQ"],
        hold: TAP_MAX + 0.1,
        done: (s) => s.wheel?.open === true,
    },
    { intent: "aim", pad: () => [padAxes([], [0, 0, 1, 0])], mouseMove: true, done: (s) => s.aim !== null || s.pointer !== null },
];

const INTENTS = [
    "left", "right", "up", "down", "jump", "drop", "roll", "action", "start", "fire", "grapple", "block", "punch", "kick",
    "weapon 1", "weapon 2", "weapon 3", "weapon 4", "weaponStep +1", "weaponStep -1", "wheel", "aim",
];

/** Ejecuta un caso con un Input nuevo y devuelve el estado de J1 en el poll en que se cumple (o el último). */
function runParity(c, device) {
    for (const k of Object.keys(handlers)) delete handlers[k];
    const local = new Input(2);
    local.setAssignment(LEGACY);
    pads = [pad(), pad()];
    local.poll(10);
    let state;
    if (device === "pad") {
        pads = c.pad();
        state = local.poll(10.05)[0];
        if (c.hold) state = local.poll(10.05 + c.hold)[0];
        if (c.release) {
            pads = [pad()];
            state = local.poll(10.1)[0];
        }
    } else {
        for (const code of c.keys ?? []) emit("keydown", { code, preventDefault() {} });
        if (c.mouse !== undefined) emit("mousedown", { button: c.mouse });
        if (c.mouseMove) emit("mousemove", { clientX: 5, clientY: 5 });
        state = local.poll(10.05)[0];
        if (c.hold) state = local.poll(10.05 + c.hold)[0];
        if (c.release) {
            for (const code of c.keys) emit("keyup", { code });
            state = local.poll(10.1)[0];
        }
    }
    return state;
}

test("paridad: cada intención que produce el gamepad también la produce el teclado de J1", () => {
    for (const c of PARITY) {
        assert.ok(c.done(runParity(c, "pad")), `${c.intent}: el gamepad no la produce`);
        assert.ok(c.done(runParity(c, "keyboard")), `${c.intent}: el teclado y mouse de J1 no la producen`);
    }
    const covered = new Set(PARITY.map((c) => c.intent));
    for (const intent of INTENTS) assert.ok(covered.has(intent), `la paridad no cubre ${intent}`);
});

test("paridad: las intenciones del estado de un jugador están todas en INTENTS o son de apoyo", () => {
    const state = input.poll()[0];
    const support = ["jumpHeld", "strongDown", "pointer", "wheelPick", "weapon", "weaponStep"];
    for (const name of Object.keys(state)) {
        assert.ok(INTENTS.includes(name) || support.includes(name), `intención sin cubrir en la paridad: ${name}`);
    }
});

test("dispositivos: el teclado va primero y cada gamepad conectado tiene su flanco de x, Select, A, Start y B", () => {
    pads = [pad(), pad()];
    input.poll();
    assert.deepEqual(input.devices.map((d) => d.id), ["keyboard", "pad:0", "pad:1"]);
    pads = [padAxes([8], [-1, 0, 0, 0]), padWith(0, 9, 1)];
    input.poll();
    const [kb, a, b] = input.devices;
    assert.equal(a.x, -1);
    assert.equal(a.select, true);
    assert.deepEqual([b.a, b.start, b.back, b.x], [true, true, true, 0]);
    assert.equal(kb.x, 0);
    input.poll();
    assert.deepEqual([input.devices[1].x, input.devices[1].select, input.devices[2].a], [0, false, false]);
    key("KeyD");
    input.poll();
    assert.equal(input.devices[0].x, 1);
    unkey("KeyD");
    key("ArrowLeft");
    input.poll();
    assert.equal(input.devices[0].x, -1);
    unkey("ArrowLeft");
    key("Enter");
    key("Escape");
    input.poll();
    assert.deepEqual([input.devices[0].start, input.devices[0].back], [true, true]);
    unkey("Enter");
    unkey("Escape");
});