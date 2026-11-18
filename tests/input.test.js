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
