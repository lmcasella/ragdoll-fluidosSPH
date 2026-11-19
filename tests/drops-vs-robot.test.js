import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { ORIGIN } from "../js/particleStore.js";
import { FLUID } from "../js/weapons.js";

/**
 * Gotas contra el robot (#100, docs/design/14-agua.md §14.16, criterios C4, C4b, C5, C8 y C13): el script de
 * `index.html` con LiquidFun real y un gamepad simulado. Cada test imprime lo medido, con el escape encendido y, en
 * C4, también apagado (el comportamiento anterior: solo el recorte inelástico).
 */

const RADIUS = 0.12;
const REST_HEIGHT = 0.23;
const STICK_RIGHT = [1, 0, 0, 0];
const MIN_JUMP = 0.9;
const AHEAD = 2.0;
const GRACE = 0.3;

const fmt = (value, digits = 3) => Number(value).toFixed(digits);

function footBoxes(player) {
    return player.rig.feet.map((id) => {
        let lx = Infinity;
        let ux = -Infinity;
        let ly = Infinity;
        for (let f = player.rag.bodies.get(id).GetFixtureList(); Box2D.getPointer(f) !== 0; f = f.GetNext()) {
            const box = f.GetAABB(0);
            lx = Math.min(lx, box.get_lowerBound().get_x());
            ux = Math.max(ux, box.get_upperBound().get_x());
            ly = Math.min(ly, box.get_lowerBound().get_y());
        }
        return { lx, ux, ly };
    });
}

function dropsAt(game, points) {
    const { store } = game.state;
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    for (const [x, y] of points) {
        at.set_x(x);
        at.set_y(y);
        def.set_position(at);
        store.create(def, { kind: FLUID.WATER, origin: ORIGIN.MAP, shot: 0 });
    }
    Box2D.destroy(def);
    Box2D.destroy(at);
}

async function standing({ escape = true } = {}) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    if (!escape) game.state.wallContact.escape = () => {};
    game.frames(40);
    const player = () => game.state.players[0];
    const boxes = footBoxes(player());
    const surface = Math.min(...boxes.map((b) => b.ly));
    return { game, player, surface, x0: player().torso.GetPosition().get_x() };
}

function jumpRise(game, player, { hold = 3, frames = 150 } = {}) {
    const y0 = player().torso.GetPosition().get_y();
    let top = y0;
    for (let f = 0; f < frames; f++) {
        game.setPad(0, { buttons: f < hold ? [0] : [] });
        game.frame();
        top = Math.max(top, player().torso.GetPosition().get_y());
    }
    game.setPad(0);
    return top - y0;
}

/**
 * C4 y C4b: el robot camina con el stick a fondo hacia `count` gotas juntas en reposo sobre su plataforma; cuando un
 * pie las pisa suelta el stick, mide cuánto tarda `isGrounded` y pide un salto parado. Devuelve la velocidad media
 * del tramo hasta la gota, el tiempo hasta `isGrounded` y la subida del torso.
 */
async function walkOnto({ count, escape }) {
    const { game, player, surface, x0 } = await standing({ escape });
    const target = x0 + AHEAD;
    const points = [];
    for (let k = 0; k < count; k++) points.push([target + (k - (count - 1) / 2) * 1.5 * RADIUS, surface + REST_HEIGHT]);
    dropsAt(game, points);
    game.frames(30);
    const lowest = (() => {
        let min = Infinity;
        for (const b of footBoxes(player())) min = Math.min(min, b.ly);
        return min;
    })();
    const left = target - ((count - 1) / 2) * 1.5 * RADIUS - RADIUS;
    const right = target + ((count - 1) / 2) * 1.5 * RADIUS + RADIUS;
    game.setPad(0, { axes: STICK_RIGHT });
    const start = player().torso.GetPosition().get_x();
    let frame = 0;
    let stepped = null;
    while (frame < 240 && stepped === null) {
        game.frame();
        frame++;
        const onIt = footBoxes(player()).some((b) => b.ux >= left && b.lx <= right && b.ly < lowest + 0.1);
        if (onIt) stepped = frame;
    }
    assert.ok(stepped !== null, "el pie nunca pisó la gota");
    const meanSpeed = (player().torso.GetPosition().get_x() - start) / (stepped / 60);
    game.setPad(0);
    let grounded = null;
    for (let f = 0; f < Math.round(GRACE * 60); f++) {
        if (grounded === null && player().isGrounded()) grounded = f / 60;
        game.frame();
    }
    if (grounded === null && player().isGrounded()) grounded = GRACE;
    const rise = jumpRise(game, player);
    return { meanSpeed, grounded, rise, drops: game.state.particleSystem.GetParticleCount(), stats: { ...game.state.wallContact.stats } };
}

for (const count of [1, 3]) {
    test(`C4${count === 1 ? "" : "b"}: una${count === 1 ? "" : "s"} ${count} gota${count === 1 ? "" : "s"} no frena ni levanta al robot`, async () => {
        const dry = await walkOnto({ count: 0, escape: true });
        const before = await walkOnto({ count, escape: false });
        const after = await walkOnto({ count, escape: true });
        const line = (name, r) =>
            `${name}: velocidad ${fmt(r.meanSpeed)} m/s (${fmt((r.meanSpeed / dry.meanSpeed - 1) * 100, 1)} %), isGrounded ` +
            `${r.grounded === null ? "nunca en 0,3 s" : `${fmt(r.grounded, 2)} s`}, salto ${fmt(r.rise)} m (${fmt((r.rise / dry.rise) * 100, 1)} %)`;
        console.log(`C4 count=${count}\n  ${line("seco", dry)}\n  ${line("sin escape", before)}\n  ${line("con escape", after)}\n  unpaid ${after.stats.unpaid}, eventos ${after.stats.events}`);
        assert.ok(Math.abs(after.meanSpeed / dry.meanSpeed - 1) < 0.1, `velocidad ${after.meanSpeed} contra ${dry.meanSpeed}`);
        assert.ok(after.grounded !== null && after.grounded <= GRACE, `isGrounded: ${after.grounded}`);
        assert.ok(after.rise >= MIN_JUMP * dry.rise, `salto ${after.rise} contra ${dry.rise}`);
    });
}

/** Velocidad media (m/s) del torso con el stick a fondo, entre los 0,5 s y los 1,5 s de marcha. */
async function walkSpeed({ points }) {
    const { game, player, surface, x0 } = await standing();
    dropsAt(game, points({ x0, surface }));
    game.frames(30);
    game.setPad(0, { axes: STICK_RIGHT });
    game.frames(30);
    const from = player().torso.GetPosition().get_x();
    game.frames(60);
    return (player().torso.GetPosition().get_x() - from) / 1;
}

test("C5: caminar entre gotas sueltas (profundidad equivalente <= 0,05 m) pierde menos de 10 % de velocidad", async () => {
    const spacing = (1.5 * RADIUS) ** 2 / 0.05 + 0.01;
    const dry = await walkSpeed({ points: () => [] });
    const wet = await walkSpeed({
        points: ({ x0, surface }) => {
            const list = [];
            for (let x = x0 + 1; x < x0 + 9; x += spacing) list.push([x, surface + REST_HEIGHT]);
            return list;
        },
    });
    console.log(`C5: separación ${fmt(spacing, 2)} m: seco ${fmt(dry)} m/s, con gotas ${fmt(wet)} m/s (${fmt((wet / dry - 1) * 100, 1)} %)`);
    assert.ok(wet >= 0.9 * dry, `${wet} contra ${dry}`);
});

/** Subida del torso en un salto parado después de caminar hasta `x0 + 2,5` m, con un charco de una fila de gotas o sin él. */
async function puddleJump({ puddle }) {
    const { game, player, surface, x0 } = await standing();
    if (puddle) {
        const points = [];
        for (let x = x0 + 1; x <= x0 + 4; x += 1.5 * RADIUS) points.push([x, surface + REST_HEIGHT]);
        dropsAt(game, points);
        game.frames(30);
    }
    game.setPad(0, { axes: STICK_RIGHT });
    for (let f = 0; f < 240 && player().torso.GetPosition().get_x() < x0 + 2.5; f++) game.frame();
    game.setPad(0);
    game.frames(30);
    return jumpRise(game, player);
}

test("C8: el salto parado dentro de un charco alcanza al menos 90 % del salto en seco", async () => {
    const dry = await puddleJump({ puddle: false });
    const wet = await puddleJump({ puddle: true });
    console.log(`C8: seco ${fmt(dry)} m, en el charco ${fmt(wet)} m (${fmt((wet / dry) * 100, 1)} %)`);
    assert.ok(wet >= MIN_JUMP * dry, `${wet} contra ${dry}`);
});

/**
 * C13: el robot quieto (gamepad en reposo) con gotas creadas superpuestas a los pies apoyados: una por pie, o una
 * fila bajo cada pie (`row`, más severo que el criterio: solo se informa, sin assert). Devuelve la subida máxima del torso en 3 s y los contadores del escape.
 */
async function overlapped({ mode, escape = true }) {
    const { game, player, surface } = await standing({ escape });
    const boxes = footBoxes(player());
    const points = [];
    if (mode === "one") for (const b of boxes) points.push([(b.lx + b.ux) / 2, surface + REST_HEIGHT]);
    if (mode === "row") for (const b of boxes) for (let x = b.lx; x <= b.ux + 1e-6; x += 1.5 * RADIUS) points.push([x, surface + RADIUS]);
    const y0 = player().torso.GetPosition().get_y();
    dropsAt(game, points);
    game.state.wallContact.resetStats();
    let top = y0;
    for (let f = 0; f < 180; f++) {
        game.frame();
        top = Math.max(top, player().torso.GetPosition().get_y());
    }
    return { rise: top - y0, stats: { ...game.state.wallContact.stats } };
}

test("C13: gotas creadas superpuestas a los pies apoyados no lanzan al robot más que un salto en seco", async () => {
    const dry = await puddleJump({ puddle: false });
    for (const mode of ["one", "row"]) {
        const before = await overlapped({ mode, escape: false });
        const after = await overlapped({ mode });
        console.log(
            `C13 (${mode}): salto en seco ${fmt(dry)} m; sin escape ${fmt(before.rise)} m; con escape ${fmt(after.rise)} m ` +
                `(tope ${fmt(1.1 * dry)} m), eventos ${after.stats.events}, impagable ${after.stats.unpaid} J`,
        );
        if (mode !== "one") continue;
        assert.ok(after.rise <= 1.1 * dry, `${mode}: ${after.rise} sobre ${1.1 * dry}`);
        assert.equal(after.stats.unpaid, 0, `${mode}: impagable ${after.stats.unpaid} J`);
    }
});
