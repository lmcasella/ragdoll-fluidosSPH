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

let input;
beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    pads = [pad()];
    input = new Input(2);
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

test("el pointer es solo del J1", () => {
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

test("fire del teclado se mantiene mientras la tecla está apretada", () => {
    emit("keydown", { code: "Space", preventDefault() {} });
    const first = input.poll()[0];
    assert.equal(first.fire, true);
    assert.equal(first.action, true);
    const held = input.poll()[0];
    assert.equal(held.fire, true);
    assert.equal(held.action, false);
    emit("keyup", { code: "Space" });
    assert.equal(input.poll()[0].fire, false);
});

test("el teclado del J2 dispara solo al J2", () => {
    emit("keydown", { code: "Enter", preventDefault() {} });
    const [j1, j2] = input.poll();
    assert.equal(j1.fire, false);
    assert.equal(j2.fire, true);
    emit("keyup", { code: "Enter" });
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

test("soltar el teclado no apaga el fire del gamepad", () => {
    pads = [padWith(7)];
    emit("keydown", { code: "Space", preventDefault() {} });
    input.poll();
    emit("keyup", { code: "Space" });
    assert.equal(input.poll()[0].fire, true);
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

test("drop con el teclado: W + S en J1 y flecha arriba + abajo en J2", () => {
    key("KeyS");
    key("KeyW");
    key("ArrowDown");
    key("ArrowUp");
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.drop, j1.jump, j2.drop, j2.jump], [true, false, true, false]);
    unkey("KeyS");
    unkey("KeyW");
    unkey("ArrowDown");
    unkey("ArrowUp");
});

test("W salta en J1 y arriba salta en J2, y también mueven hacia arriba", () => {
    key("KeyW");
    key("ArrowUp");
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.jump, j1.up, j2.jump, j2.up], [true, true, true, true]);
    unkey("KeyW");
    unkey("ArrowUp");
});

test("RT dispara y mantiene fire; solo RT, no A", () => {
    pads = [padWith(7)];
    const first = input.poll()[0];
    assert.deepEqual([first.fire, first.action, first.jump], [true, true, false]);
    const held = input.poll()[0];
    assert.deepEqual([held.fire, held.action], [true, false]);
});

test("B golpea en el flanco; F en J1 y Numpad 5 en J2", () => {
    pads = [padWith(1)];
    assert.equal(input.poll()[0].punch, true);
    assert.equal(input.poll()[0].punch, false);
    pads = [pad()];
    input.poll();
    key("KeyF");
    key("Numpad5");
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.punch, j2.punch], [true, true]);
});

test("R18b: ningún respaldo usa Shift", async () => {
    const { KEYBOARD_LAYOUTS } = await import("../js/Input.js");
    const codes = KEYBOARD_LAYOUTS.flatMap((layout) => Object.values(layout).flat());
    assert.deepEqual(codes.filter((code) => code.startsWith("Shift")), []);
});

test("R18b: G (J1) y Numpad - (J2) mantienen block; Numpad 5 es punch y abajo + Numpad 5 es kick en J2", () => {
    pads = [pad()];
    key("KeyG");
    key("NumpadSubtract");
    let [j1, j2] = input.poll();
    assert.deepEqual([j1.block, j2.block], [true, true]);
    [j1, j2] = input.poll();
    assert.deepEqual([j1.block, j2.block], [true, true]);
    unkey("KeyG");
    unkey("NumpadSubtract");
    [j1, j2] = input.poll();
    assert.deepEqual([j1.block, j2.block], [false, false]);

    key("Numpad5");
    [j1, j2] = input.poll();
    assert.deepEqual([j2.punch, j2.kick], [true, false]);
    key("ArrowDown");
    key("Numpad5");
    [j1, j2] = input.poll();
    assert.deepEqual([j2.punch, j2.kick], [false, true]);
    unkey("ArrowDown");
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

test("R18: LT mantiene block y no lo cortan las teclas; LT + A rueda (no salta ni baja); LT + W también rueda", () => {
    pads = [padWith(6)];
    key("KeyG");
    assert.equal(input.poll()[0].block, true);
    unkey("KeyG");
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
    key("KeyW");
    s = input.poll()[0];
    assert.deepEqual([s.roll, s.jump], [true, false]);
    unkey("KeyW");
});

test("G + W en J1 y Numpad - + flecha arriba en J2 ruedan", () => {
    pads = [pad()];
    key("KeyG");
    key("KeyW");
    key("NumpadSubtract");
    key("ArrowUp");
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.roll, j1.jump, j2.roll, j2.jump], [true, false, true, false]);
    unkey("KeyG");
    unkey("KeyW");
    unkey("NumpadSubtract");
    unkey("ArrowUp");
});

test("X, E, clic derecho y Numpad 0 dan grapple mantenido", () => {
    pads = [padWith(2)];
    assert.equal(input.poll()[0].grapple, true);
    assert.equal(input.poll()[0].grapple, true);
    pads = [pad()];
    assert.equal(input.poll()[0].grapple, false);
    key("KeyE");
    key("Numpad0");
    let [j1, j2] = input.poll();
    assert.deepEqual([j1.grapple, j2.grapple], [true, true]);
    unkey("KeyE");
    unkey("Numpad0");
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

test("Q (toque corto) y R en J1; Ctrl derecho y Numpad + en J2", () => {
    key("KeyQ");
    key("ControlRight");
    input.poll(1);
    unkey("KeyQ");
    unkey("ControlRight");
    let [j1, j2] = input.poll(1.1);
    assert.deepEqual([j1.weaponStep, j2.weaponStep], [-1, -1]);
    key("KeyR");
    key("NumpadAdd");
    [j1, j2] = input.poll(1.2);
    assert.deepEqual([j1.weaponStep, j2.weaponStep], [1, 1]);
    [j1, j2] = input.poll(1.3);
    assert.deepEqual([j1.weaponStep, j2.weaponStep], [0, 0]);
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

test("las teclas numéricas eligen el arma: 1-4 en J1 y Num 1-4 en J2", () => {
    key("Digit3");
    key("Numpad4");
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.weapon, j2.weapon], [3, 4]);
});

test("el teclado no pisa al gamepad, en ninguna intención, y al revés", () => {
    const cases = [
        ["fire", [7], "Space", "fire"],
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
    key("KeyW");
    assert.equal(input.poll()[0].jump, true);
    unkey("KeyW");
});

test("los gamepads se asignan por orden de conexión y se combinan con el teclado del jugador", () => {
    pads = [padWith(1), padWith(7)];
    key("KeyF");
    const [j1, j2] = input.poll();
    assert.deepEqual([j1.punch, j1.fire, j2.punch, j2.fire], [true, false, false, true]);
    unkey("KeyF");
});