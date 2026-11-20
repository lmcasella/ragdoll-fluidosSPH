// Adherencia de la miel a los cuerpos (#77, docs/design/14-agua.md §14.10): LiquidFun real, determinista. A1 a A3 con
// escenas sin robots (tests/helpers/film-scene.js) y el gameplay con el script de index.html y un gamepad simulado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newScene, addBox, fill, eachParticle, setVelocity, couette, wallFilm, DT, SPACING } from "./helpers/film-scene.js";
import { loadGame } from "./helpers/game.js";

const { FLUID, weaponById } = await import("../js/weapons.js");
const { ORIGIN } = await import("../js/particleStore.js");
const { PARTICLE } = await import("../js/particles.js");
const { MATERIALS, SIGMA_W } = await import("../js/materials.js");
const { mixtureViscosity } = await import("../js/adhesion.js");

const HONEY_MASS = MATERIALS.honey.SG * SIGMA_W * SPACING * SPACING;

test("la viscosidad de la mezcla es la de la miel con X = 1, la del agua con X = 0 y la media geométrica con X = 0,5", () => {
    assert.ok(Math.abs(mixtureViscosity(1) - MATERIALS.honey.mu) < 1e-12);
    assert.ok(Math.abs(mixtureViscosity(0) - MATERIALS.water.mu) < 1e-15);
    assert.ok(Math.abs(mixtureViscosity(0.5) - Math.sqrt(MATERIALS.honey.mu * MATERIALS.water.mu)) < 1e-12);
});

test("A1: la cantidad de movimiento entre partículas y cuerpos se conserva (tercera ley, < 1e-6)", (t) => {
    const scene = newScene({ gravity: 0 });
    const body = addBox(scene, "block", { x: 0, y: 0, w: 0.6, h: 0.4, type: 2, density: SIGMA_W });
    scene.register();
    fill(scene, FLUID.HONEY, -0.5, 0.5, 0.35, 0.35 + 3 * SPACING);
    fill(scene, FLUID.HONEY, -0.5, 0.5, -0.35 - 3 * SPACING, -0.35);
    setVelocity(body, 1.5, -0.4);
    body.SetAngularVelocity(2);
    const mass = body.GetMass();
    const momentum = () => {
        const v = body.GetLinearVelocity();
        const total = { x: mass * v.get_x(), y: mass * v.get_y() };
        eachParticle(scene, (i, slot, x, y, vx, vy) => {
            total.x += HONEY_MASS * vx;
            total.y += HONEY_MASS * vy;
        });
        return total;
    };
    let ledger = 0;
    let real = 0;
    let contacts = 0;
    for (let s = 0; s < 120; s++) {
        const before = momentum();
        scene.adhesion.step(DT);
        const after = momentum();
        const { stats } = scene.adhesion;
        ledger = Math.max(ledger, Math.hypot(stats.particleX + stats.bodyX, stats.particleY + stats.bodyY));
        real = Math.max(real, Math.hypot(after.x - before.x, after.y - before.y));
        contacts += stats.contacts;
        scene.step();
    }
    t.diagnostic(`contactos ${contacts}, |Σ Δp| máximo por paso: libro ${ledger.toExponential(2)}, velocidades reales ${real.toExponential(2)} kg·m/s`);
    assert.ok(contacts > 0, "la escena no ejercita la película");
    assert.ok(ledger < 1e-6, `libro ${ledger}`);
    assert.ok(real < 1e-6, `velocidades reales ${real}`);
    scene.dispose();
});

test("la película no invierte la velocidad relativa con ninguna dt, ni con una partícula sobre la superficie", () => {
    const scene = newScene({ gravity: 0 });
    const body = addBox(scene, "block", { x: 0, y: 0, w: 1, h: 0.2, type: 2, density: SIGMA_W });
    scene.register();
    fill(scene, FLUID.HONEY, 0, 0, 0.1 + 0.001, 0.1 + 0.001);
    setVelocity(body, 5, 0);
    for (const dt of [1 / 60, 1, 100]) {
        scene.adhesion.step(dt);
        let vx = 0;
        eachParticle(scene, (i, slot, x, y, px) => (vx = px));
        assert.ok(vx >= 0, `dt ${dt}: la partícula (${vx}) va contra el cuerpo`);
        assert.ok(vx <= 5 + 1e-6, `dt ${dt}: la partícula (${vx}) no supera la velocidad del cuerpo`);
    }
    scene.dispose();
});

test("A2a: el filmFactor guardado es el que mide el corte de Couette (placa sobre capa de miel, τ = μ V / δ)", (t) => {
    const { force, reference, gap } = couette({ layers: 3 });
    const measured = MATERIALS.honey.filmFactor * (reference / force);
    t.diagnostic(`δ ${gap.toFixed(3)} m, fuerza ${force.toFixed(4)} N, referencia ${reference.toFixed(4)} N, filmFactor medido ${measured.toFixed(3)} (guardado ${MATERIALS.honey.filmFactor})`);
    console.log(`A2a Couette: δ ${gap.toFixed(3)} m, F ${force.toFixed(4)} N, referencia ${reference.toFixed(4)} N, filmFactor medido ${measured.toFixed(3)}`);
    assert.ok(Math.abs(force / reference - 1) < 0.02, `F / referencia = ${force / reference}`);
    assert.ok(Math.abs(measured / MATERIALS.honey.filmFactor - 1) < 0.02);
});

test("A2: la película de miel que escurre por una pared va a la velocidad media de Nusselt ± 30 %", (t) => {
    const film = wallFilm({ layers: 3 });
    const ratio = film.velocity / film.reference;
    t.diagnostic(`δ ${film.delta.toFixed(3)} m, velocidad ${film.velocity.toFixed(2)} m/s, Nusselt ${film.reference.toFixed(2)} m/s, razón ${ratio.toFixed(3)}`);
    console.log(`A2 Nusselt (3 capas): δ ${film.delta.toFixed(3)} m, ${film.velocity.toFixed(2)} m/s contra ${film.reference.toFixed(2)} m/s, razón ${ratio.toFixed(3)}`);
    assert.ok(Math.abs(ratio - 1) < 0.3, `razón ${ratio}`);
});

test("A2 (informe): razón con 1 y 2 capas de espesor, fuera de la calibración", (t) => {
    for (const layers of [1, 2]) {
        const film = wallFilm({ layers });
        const ratio = film.velocity / film.reference;
        t.diagnostic(`${layers} capas: δ ${film.delta.toFixed(3)} m, ${film.velocity.toFixed(2)} m/s contra ${film.reference.toFixed(2)} m/s, razón ${ratio.toFixed(3)}`);
        console.log(`A2 informe, ${layers} capas: ${film.velocity.toFixed(2)} m/s contra Nusselt ${film.reference.toFixed(2)} m/s, razón ${ratio.toFixed(3)}`);
        assert.ok(film.velocity > 0 && Number.isFinite(ratio));
    }
});

test("A3: con agua (X = 0) en la misma escena el impulso de adherencia es menos del 1 % del de la miel", (t) => {
    const honey = wallFilm({ layers: 3, kind: FLUID.HONEY });
    const water = wallFilm({ layers: 3, kind: FLUID.WATER });
    const share = water.impulse / honey.impulse;
    t.diagnostic(`impulso miel ${honey.impulse.toFixed(3)} kg·m/s, agua ${water.impulse.toExponential(2)} kg·m/s, cociente ${share.toExponential(2)}`);
    console.log(`A3: impulso de la miel ${honey.impulse.toFixed(3)} kg·m/s, del agua ${water.impulse.toExponential(2)} kg·m/s, cociente ${share.toExponential(2)}`);
    assert.ok(honey.impulse > 0);
    assert.ok(share < 0.01, `cociente ${share}`);
});

const FLOOR_Y = 4;

/** Partículas de `kind` en `layers` capas de paso `SPACING` entre `x0` y `x1` sobre la plataforma de aparición (userData de mapa). */
function puddle(game, kind, x0, x1, layers) {
    const { store } = game.state;
    const def = new Box2D.b2ParticleDef();
    const [r, g, b] = weaponById(kind).color;
    const color = new Box2D.b2ParticleColor(r, g, b, 255);
    const position = new Box2D.b2Vec2(0, 0);
    def.set_flags(kind === FLUID.HONEY ? PARTICLE.VISCOUS : PARTICLE.WATER);
    def.set_color(color);
    let made = 0;
    for (let x = x0; x <= x1; x += SPACING) {
        for (let layer = 0; layer < layers; layer++) {
            position.set_x(x);
            position.set_y(FLOOR_Y + 0.1 + layer * SPACING);
            def.set_position(position);
            if (store.create(def, { kind, origin: ORIGIN.MAP }) >= 0) made++;
        }
    }
    Box2D.destroy(def);
    Box2D.destroy(color);
    Box2D.destroy(position);
    return made;
}

/**
 * J1 camina 6 s a la derecha con el stick izquierdo por la plataforma de aparición. `kind` pone un charco de 9 capas entre
 * x = 11 y 15 m (o ninguno). Devuelve el tiempo (s) que tarda el torso en cruzar el charco, la posición a los 6 s y las
 * partículas del charco.
 */
async function walkThrough(kind) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    const player = game.state.players[0];
    const particles = kind ? puddle(game, kind, 11, 15, 9) : 0;
    game.frames(60);
    game.setPad(0, { axes: [1, 0, 0, 0] });
    const xs = [];
    for (let f = 0; f < 360; f++) {
        game.frame();
        xs.push(player.torso.GetPosition().get_x());
    }
    const at = (x) => xs.findIndex((v) => v >= x) / 60;
    return { crossing: at(15) - at(11), final: xs[xs.length - 1], particles };
}

test("un robot que camina por un charco de miel avanza claramente más lento que en seco y que en agua, y sale del charco", async (t) => {
    const dry = await walkThrough(0);
    const water = await walkThrough(FLUID.WATER);
    const honey = await walkThrough(FLUID.HONEY);
    const speed = (r) => 4 / r.crossing;
    t.diagnostic(`seco ${speed(dry).toFixed(2)} m/s, agua ${speed(water).toFixed(2)} m/s, miel ${speed(honey).toFixed(2)} m/s (${honey.particles} partículas)`);
    console.log(`velocidad media por 4 m: seco ${speed(dry).toFixed(2)} m/s, agua ${speed(water).toFixed(2)} m/s, miel ${speed(honey).toFixed(2)} m/s (${honey.particles} partículas de miel); a los 6 s x = ${honey.final.toFixed(2)} m (seco ${dry.final.toFixed(2)})`);
    assert.ok(speed(honey) < 0.7 * speed(dry), `miel ${speed(honey)} contra seco ${speed(dry)}`);
    assert.ok(speed(honey) < 0.7 * speed(water), `miel ${speed(honey)} contra agua ${speed(water)}`);
    assert.ok(honey.final > 19, `no salió del charco: x = ${honey.final}`);
});

function shift(game, k, dx) {
    const v = new Box2D.b2Vec2(0, 0);
    for (const body of game.state.players[k].rag.bodies.values()) {
        const p = body.GetPosition();
        v.set_x(p.get_x() + dx);
        v.set_y(p.get_y());
        body.SetTransform(v, body.GetAngle());
    }
    Box2D.destroy(v);
}

test("costo: con los dos robots en un charco de unas 400 partículas de miel, adhesion.step cuesta menos de 0,5 ms por paso", async (t) => {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    shift(game, 1, 9 - game.state.players[1].torso.GetPosition().get_x());
    game.frames(10);
    const particles = puddle(game, FLUID.HONEY, 7.5, 10.5, 12);
    const { adhesion } = game.state;
    const step = adhesion.step.bind(adhesion);
    let nanoseconds = 0;
    let calls = 0;
    let contacts = 0;
    adhesion.step = (dt) => {
        const start = process.hrtime.bigint();
        step(dt);
        nanoseconds += Number(process.hrtime.bigint() - start);
        calls++;
        contacts += adhesion.stats.contacts;
    };
    game.frames(60);
    nanoseconds = 0;
    calls = 0;
    contacts = 0;
    game.frames(180);
    const ms = nanoseconds / calls / 1e6;
    t.diagnostic(`${particles} partículas, ${(contacts / calls).toFixed(1)} con película por paso, ${ms.toFixed(4)} ms por paso`);
    console.log(`costo de adhesion.step: ${ms.toFixed(4)} ms por paso (${particles} partículas, ${(contacts / calls).toFixed(1)} con película, ${calls} pasos)`);
    assert.ok(calls > 0);
    assert.ok(ms < 0.5, `${ms} ms por paso`);
});

test("el pegado viejo se retiró: no queda estado `pegado` en el robot ni consulta de miel en DamageSystem", async () => {
    const game = await loadGame();
    const player = game.state.players[0];
    assert.equal(player.sticky, undefined);
    assert.equal(player.stick, undefined);
    assert.equal(game.state.damage.stickHoney, undefined);
});
