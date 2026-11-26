import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGame } from "./helpers/game.js";
import { BUTTON, AIM_RIGHT, startDuel, spyRag } from "./helpers/duel.js";

const { AIR } = await import("../src/robot/ActiveRagdoll.js");

const rigJson = JSON.parse(readFileSync(new URL("../assets/robot.rag.json", import.meta.url), "utf8"));

const GROUND_STATES = ["idle", "aim", "walk", "walkBack"];

async function solo() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(60);
    return game;
}

test("R1: el rig v5 carga con 13 cuerpos, 12 articulaciones, 13 kg y todas las claves de clips", async () => {
    const mass = rigJson.bodies.reduce((sum, body) => sum + body.mass, 0);
    assert.equal(rigJson.bodies.length, 13);
    assert.equal(rigJson.joints.length, 12);
    assert.ok(Math.abs(mass - 13) <= 0.01, `masa ${mass} kg`);

    const game = await loadGame();
    const player = game.state.players[0];
    assert.equal(player.rag.bodies.size, 13);
    assert.equal(player.rag.joints.size ?? player.rag.joints.length, 12);
    for (const name of [...player.rig.aimJoints, ...player.rig.aimHold]) {
        assert.doesNotThrow(() => player.rag.joint(name), name);
    }
    for (const [state, key] of Object.entries(player.rig.clips)) {
        assert.doesNotThrow(() => player.rag.play(key), `${state} -> ${key}`);
        player.rag.stop(key);
    }
    assert.ok(player.rig.clips.rollBack === "roll_back");
    assert.ok(player.rig.arms.every((id) => player.rag.bodies.has(id)));
});

test("R2b: caminar 2 s apuntando mantiene el error medio de mira en 5° o menos", async (t) => {
    const game = await solo();
    game.setPad(0, { axes: [1, 0, 1, 0] });
    game.frames(30);
    const player = game.state.players[0];
    const errors = [];
    for (let f = 0; f < 120; f++) {
        game.frame();
        const muzzle = player.muzzle();
        const diff = Math.atan2(muzzle.dy, muzzle.dx) - Math.atan2(player.aimDir.y, player.aimDir.x);
        errors.push(Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) * (180 / Math.PI));
    }
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    t.diagnostic(`R2b: error medio ${mean.toFixed(2)}°, máximo ${Math.max(...errors).toFixed(2)}°`);
    assert.ok(mean <= 5, `error medio ${mean.toFixed(2)}°`);
});

/**
 * Salta con el stick izquierdo en `lx` y la mira a la derecha; devuelve el estado de clips a `after` frames del salto.
 */
async function jumpState(lx, after) {
    const game = await solo();
    game.setPad(0, { axes: [0, 0, 1, 0] });
    game.frames(20);
    game.setPad(0, { buttons: [BUTTON.A], axes: [lx, 0, 1, 0] });
    game.frame();
    game.setPad(0, { axes: [lx, 0, 1, 0] });
    game.frames(after);
    return game.state.players[0].clipState;
}

test("R3: a los 0,6 s + 1 paso del salto el clip de aire sigue la dirección del stick respecto de la mira", async (t) => {
    const results = {
        adelante: await jumpState(1, 37),
        atras: await jumpState(-1, 37),
        centro: await jumpState(0, 37),
    };
    t.diagnostic(`R3: ${JSON.stringify(results)}`);
    assert.deepEqual(results, { adelante: "airForward", atras: "airBackward", centro: "air" });
});

test("R3: durante los primeros 0,6 s del salto el estado es jumpStart", async () => {
    assert.equal(await jumpState(1, 20), "jumpStart");
});

test("R4: caer 7 m activa fallHigh antes de aterrizar; un salto normal nunca", async (t) => {
    const jump = await solo();
    jump.setPad(0, { buttons: [BUTTON.A] });
    const states = new Set();
    for (let f = 0; f < 150; f++) {
        jump.frame();
        if (f === 0) jump.setPad(0);
        states.add(jump.state.players[0].clipState);
    }
    assert.ok(!states.has("fallHigh"), `estados del salto: ${[...states]}`);
    assert.ok(states.has("jumpStart") && states.has("air"));

    const game = await solo();
    const player = game.state.players[0];
    const offset = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const pos = body.GetPosition();
        offset.set_x(pos.get_x());
        offset.set_y(pos.get_y() + 7);
        body.SetTransform(offset, body.GetAngle());
    }
    Box2D.destroy(offset);
    let fallAt = -1;
    let landedAt = -1;
    let fallSpeed = 0;
    for (let f = 0; f < 150 && landedAt < 0; f++) {
        game.frame();
        if (player.clipState === "fallHigh" && fallAt < 0) fallAt = f;
        fallSpeed = Math.max(fallSpeed, -player.torso.GetLinearVelocity().get_y());
        if (player.grounded) landedAt = f;
    }
    t.diagnostic(`R4: fallHigh en el frame ${fallAt}, aterrizó en ${landedAt}, velocidad máxima de caída ${fallSpeed.toFixed(1)} m/s (umbral ${AIR.fallSpeed})`);
    assert.ok(fallAt >= 0 && fallAt < landedAt, "fallHigh antes de aterrizar");
});

test("R5: aterrizar de cualquier estado de aire sale a idle, aim o walk en 3 pasos como máximo", async (t) => {
    const cases = [
        ["salto neutro", { lx: 0 }],
        ["salto hacia adelante", { lx: 1 }],
        ["salto hacia atrás", { lx: -1, release: 15 }],
    ];
    for (const [name, { lx, release }] of cases) {
        const game = await solo();
        game.setPad(0, { axes: [0, 0, 1, 0] });
        game.frames(10);
        game.setPad(0, { buttons: [BUTTON.A], axes: [lx, 0, 1, 0] });
        game.frame();
        game.setPad(0, { axes: [lx, 0, 1, 0] });
        const player = game.state.players[0];
        let airborne = false;
        let contactAt = -1;
        let result = null;
        for (let f = 0; f < 200 && result === null; f++) {
            if (f === release) game.setPad(0, { axes: [0, 0, 1, 0] });
            game.frame();
            if (!player.isGrounded()) airborne = true;
            else if (airborne && contactAt < 0) contactAt = f;
            if (contactAt >= 0 && f === contactAt + 3) result = player.clipState;
        }
        t.diagnostic(`R5 ${name}: tres pasos después del contacto, ${result}`);
        assert.ok(GROUND_STATES.includes(result), `${name}: ${result}`);
    }

    const game = await solo();
    const player = game.state.players[0];
    const offset = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const pos = body.GetPosition();
        offset.set_x(pos.get_x());
        offset.set_y(pos.get_y() + 7);
        body.SetTransform(offset, body.GetAngle());
    }
    Box2D.destroy(offset);
    let airborne = false;
    let contactAt = -1;
    let result = null;
    for (let f = 0; f < 200 && result === null; f++) {
        game.frame();
        if (!player.isGrounded()) airborne = true;
        else if (airborne && contactAt < 0) contactAt = f;
        if (contactAt >= 0 && f === contactAt + 3) result = player.clipState;
    }
    t.diagnostic(`R5 fallHigh: tres pasos después del contacto, ${result}`);
    assert.ok([...GROUND_STATES, "landHurt"].includes(result), `fallHigh: ${result}`);
});

test("R16: quieto sin mira es idle; con RT o con el stick derecho es aim", async () => {
    const game = await solo();
    const player = game.state.players[0];
    assert.equal(player.clipState, "idle");
    game.setPad(0, { buttons: [BUTTON.RT] });
    game.frames(5);
    assert.equal(player.clipState, "aim");
    game.setPad(0);
    game.frames(5);
    assert.equal(player.clipState, "idle");
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(5);
    assert.equal(player.clipState, "aim");
});

test("R17: hp en 0 pasa a dead y suelta los overrides", async () => {
    const game = await solo();
    const player = game.state.players[0];
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(10);
    const counts = spyRag(player, ["clearAllOverrides", "setJointAngle"]);
    player.hp = 0;
    game.frames(12);
    assert.equal(player.clipState, "dead");
    assert.equal(counts.clearAllOverrides, 1);
    assert.equal(counts.setJointAngle, 0, "dead no escribe overrides de mira");
});

test("armsBusy: bloquear, atacar y rodar sueltan los overrides de mira y aim() no los vuelve a escribir", async () => {
    const game = await startDuel(7);
    const player = game.state.players[0];
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(10);
    assert.equal(player.armsBusy, false);
    const counts = spyRag(player, ["clearJointOverride", "setJointAngle"]);
    game.setPad(0, { buttons: [BUTTON.LT], axes: AIM_RIGHT });
    game.frames(10);
    assert.equal(player.clipState, "block");
    assert.equal(player.armsBusy, true);
    assert.equal(counts.clearJointOverride, 4, "se sueltan los dos hombros y los dos codos");
    assert.equal(counts.setJointAngle, 0, "bloqueando no se escriben overrides");
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(5);
    assert.equal(player.armsBusy, false);
    assert.ok(counts.setJointAngle > 0, "al salir, la mira retoma los overrides");
});
