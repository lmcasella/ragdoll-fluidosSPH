import { test } from "node:test";
import assert from "node:assert/strict";

const { ActiveRagdoll } = await import("../js/ActiveRagdoll.js");

// Estado mínimo para probar el cortocircuito sin física
function robot() {
    const r = Object.create(ActiveRagdoll.prototype);
    r.hp = 100;
    r.burns = new Map();
    r.flashes = new Map();
    r.wetTimer = 0;
    r.rig = {};
    return r;
}

const DT = 1 / 60;
function run(r, seconds) {
    for (let i = 0; i < Math.round(seconds / DT); i++) r.updateStatus(DT);
}

test("sin soak no hay daño por cortocircuito", () => {
    const r = robot();
    run(r, 2);
    assert.equal(r.hp, 100);
    assert.equal(r.wet, false);
});

test("mojado: -3 de vida por segundo durante 3 s y después se apaga", () => {
    const r = robot();
    r.soak();
    assert.equal(r.wet, true);
    run(r, 1);
    assert.ok(Math.abs(r.hp - 97) < 0.05, `hp ${r.hp}`);
    run(r, 2.5);
    assert.ok(Math.abs(r.hp - 91) < 0.1, `hp ${r.hp}`);
    assert.equal(r.wet, false);
});

test("soak renueva el tiempo y no usa el multiplicador por parte", () => {
    const r = robot();
    r.rig = { defaultDamage: 0.1 };
    r.soak();
    run(r, 2);
    r.soak();
    run(r, 2);
    assert.ok(Math.abs(r.hp - 88) < 0.2, `hp ${r.hp}`);
    assert.equal(r.wet, true);
});

test("copyStateFrom conserva el estado mojado", () => {
    const old = robot();
    old.soak();
    run(old, 1);
    const nuevo = robot();
    nuevo.copyStateFrom(old);
    assert.equal(nuevo.wetTimer, old.wetTimer);
    assert.ok(nuevo.wet);
});
test("dry apaga el cortocircuito: no hay más daño", () => {
    const r = robot();
    r.soak();
    run(r, 0.5);
    r.dry();
    const hp = r.hp;
    run(r, 2);
    assert.equal(r.hp, hp);
    assert.equal(r.wet, false);
});
