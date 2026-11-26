/**
 * Ácido contra robots (#188, #119): daño directo del disparo y cortocircuito según la conductividad del líquido,
 * con LiquidFun real y gamepad simulado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { fillField } from "./helpers/water-scene.js";
import { LEVEL } from "../src/level/level.js";
import { FLUID } from "../src/combat/weapons.js";
import { MATERIALS } from "../src/fluids/materials.js";

const RT = 7;
const SIGMA_W = MATERIALS.water.sigmaE;
const SIGMA_A = MATERIALS.acid.sigmaE;

const GROUND_TORSO_Y = 4.7;

/** Mueve todas las piezas del robot `k` para que su torso quede en (`x`, `y`). */
function place(game, k, x, y) {
    const torso = game.state.players[k].torso.GetPosition();
    const dx = x - torso.get_x();
    const dy = y - torso.get_y();
    const v = new Box2D.b2Vec2(0, 0);
    for (const body of game.state.players[k].rag.bodies.values()) {
        const p = body.GetPosition();
        v.set_x(p.get_x() + dx);
        v.set_y(p.get_y() + dy);
        body.SetTransform(v, body.GetAngle());
    }
    Box2D.destroy(v);
}

async function start(distance, x = 7) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(10);
    place(game, 0, x, GROUND_TORSO_Y);
    place(game, 1, x + distance, GROUND_TORSO_Y);
    game.frames(30);
    return game;
}

test("disparo directo de ácido 2 s a 4 m: el blanco pierde vida y queda con la conductividad del ácido", async (t) => {
    const game = await start(4);
    const [p1, p2] = game.state.players;
    p1.weapon = FLUID.ACID;
    p1.tanks.set(FLUID.ACID, 272);
    assert.equal(p2.hp, 100);
    game.setPad(0, { buttons: [RT], axes: [0, 0, 1, 0] });
    game.frames(120);
    game.setPad(0);
    const lost = 100 - p2.hp;
    t.diagnostic(`vida perdida por el disparo directo en 2 s: ${lost.toFixed(2)}; wet ${p2.wet}; sigma ${p2.wetSigma}; tanque ${p1.tanks.get(FLUID.ACID)}`);
    assert.ok(lost > 10, `perdió ${lost}`);
    assert.equal(p2.wetSigma, SIGMA_A);
    assert.equal(SIGMA_A, 32);
});

test("agua limpia: cortocircuito de 3 por segundo, sin regresión", async (t) => {
    const game = await start(4);
    const [p1, p2] = game.state.players;
    game.setPad(0, { buttons: [RT], axes: [0, 0, 1, 0] });
    game.frames(30);
    game.setPad(0);
    assert.ok(p2.wet);
    assert.equal(p2.wetSigma, SIGMA_W);
    const hp = p2.hp;
    game.frames(60);
    const rate = (hp - p2.hp) / 1;
    t.diagnostic(`dps agua limpia ${rate.toFixed(3)}`);
    assert.ok(Math.abs(rate - 3) <= 0.06, `dps ${rate}`);
    assert.equal(p1.wet, false);
});

test("robot en la pileta con ácido volcado pierde al menos 3 veces más vida por segundo que en agua limpia", async (t) => {
    const measure = async (acid) => {
        const game = await start(40);
        const [p1, p2] = game.state.players;
        fillField(game.state.water, 7.5);
        game.state.match.roundTime = 100;
        game.frames(20);
        if (acid) {
            const x = p2.torso.GetPosition().get_x();
            const tank = 272;
            const area = tank * 0.0081;
            const kg = MATERIALS.acid.SG * 998.2 * area * MATERIALS.acid.species.H2SO4;
            game.state.water.deposit(x, area, 0, 0, 0, kg);
        }
        game.frames(6);
        p2.hp = 100;
        p1.hp = 100;
        game.frames(60);
        return { lost: 100 - p2.hp, sigma: p2.wetSigma, wet: p2.wet };
    };
    const clean = await measure(false);
    const acid = await measure(true);
    t.diagnostic(`pileta agua limpia: ${clean.lost.toFixed(2)}/s sigma ${clean.sigma}; con ácido: ${acid.lost.toFixed(2)}/s sigma ${acid.sigma}`);
    assert.ok(clean.wet && acid.wet);
    assert.ok(Math.abs(clean.lost - 3) <= 0.1, `agua limpia ${clean.lost}`);
    assert.ok(acid.lost >= 3 * clean.lost, `ácido ${acid.lost} contra agua ${clean.lost}`);
});


