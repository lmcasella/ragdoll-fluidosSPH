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

const { Input } = await import("../js/Input.js");

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
    emit("mousedown");
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
    pads = [padWith(0)];
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
    emit("mousedown");
    let [j1, j2] = input.poll();
    assert.equal(j1.fire, true);
    assert.equal(j2.fire, false);
    [j1, j2] = input.poll();
    assert.equal(j1.fire, true, "sigue apretado");
    assert.equal(j1.action, false);
    assert.equal(j2.fire, false);
    emit("mouseup");
    assert.equal(input.poll()[0].fire, false);
});

test("blur apaga el fire del mouse", () => {
    emit("mousedown");
    input.poll();
    emit("blur");
    assert.equal(input.poll()[0].fire, false);
});

test("soltar el teclado no apaga el fire del gamepad", () => {
    pads = [padWith(0)];
    emit("keydown", { code: "Space", preventDefault() {} });
    input.poll();
    emit("keyup", { code: "Space" });
    assert.equal(input.poll()[0].fire, true);
});

test("soltar el mouse no apaga el fire del gamepad", () => {
    pads = [padWith(0)];
    emit("mousedown");
    input.poll();
    emit("mouseup");
    assert.equal(input.poll()[0].fire, true);
});