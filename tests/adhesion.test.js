// Adherencia de la miel a los cuerpos (#77, #214, docs/design/14-agua.md §14.10): LiquidFun real, determinista. Techo, pared,
// chorro y conservación con escenas sin robots (tests/helpers/film-scene.js), y el gameplay con el script de index.html y
// un gamepad simulado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newScene, addBox, fill, eachParticle, setVelocity, DT, RADIUS, SPACING, REST_DISTANCE, G } from "./helpers/film-scene.js";
import { loadGame } from "./helpers/game.js";

const { FLUID, WEAPONS, ShotEmitter, weaponById } = await import("../js/weapons.js");
const { ORIGIN } = await import("../js/particleStore.js");
const { PARTICLE } = await import("../js/particles.js");
const { MATERIALS, SIGMA_W } = await import("../js/materials.js");
const { mixtureViscosity } = await import("../js/adhesion.js");

const HONEY_MASS = MATERIALS.honey.SG * SIGMA_W * SPACING * SPACING;
const WEIGHT = HONEY_MASS * G;
const MU_EF = MATERIALS.honey.mu * MATERIALS.honey.viscosityScale;
const THICKNESS = SIGMA_W / 1000;
const SUBSTEP = DT / 8;
const BRIDGE_CUT = 3.5 * RADIUS;

test("la viscosidad de la mezcla es la efectiva de la miel con X = 1, la del agua con X = 0 y la media geométrica con X = 0,5", () => {
    assert.equal(MATERIALS.honey.viscosityScale, 100);
    assert.ok(Math.abs(mixtureViscosity(1) - MU_EF) < 1e-9);
    assert.ok(Math.abs(mixtureViscosity(0) - MATERIALS.water.mu) < 1e-15);
    assert.ok(Math.abs(mixtureViscosity(0.5) - Math.sqrt(MU_EF * MATERIALS.water.mu)) < 1e-9);
});

/**
 * Componentes conexas (vecinas a menos de `2 r`) de las partículas de la escena: devuelve `{ count, labels, sizes }` con la
 * etiqueta de componente de cada partícula en el orden de `eachParticle`.
 */
function components(scene) {
    const points = [];
    eachParticle(scene, (i, slot, x, y) => points.push({ x, y }));
    const labels = new Int32Array(points.length).fill(-1);
    const sizes = [];
    const limit = 2 * RADIUS;
    for (let s = 0; s < points.length; s++) {
        if (labels[s] >= 0) continue;
        const id = sizes.length;
        sizes.push(0);
        const stack = [s];
        labels[s] = id;
        while (stack.length > 0) {
            const a = stack.pop();
            sizes[id]++;
            for (let b = 0; b < points.length; b++) {
                if (labels[b] >= 0 || Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) >= limit) continue;
                labels[b] = id;
                stack.push(b);
            }
        }
    }
    return { points, labels, sizes };
}

test("(a) techo: 20 partículas de miel en una capa bajo el techo no se sueltan del puente (2 r + d) antes de 0,7 d k_n / W y a los 2,0 s más de la mitad sigue enganchada", (t) => {
    const scene = newScene({ gravity: G });
    const ceiling = 10;
    addBox(scene, "ceiling", { x: 0, y: ceiling + 0.5, w: 20, h: 1 });
    fill(scene, FLUID.HONEY, 0, 19 * SPACING, ceiling - REST_DISTANCE, ceiling - REST_DISTANCE);
    const kn = 3 * MU_EF * THICKNESS;
    const minimum = (0.7 * SPACING * kn) / WEIGHT;
    let firstDetach = Infinity;
    let stuck = 0;
    let total = 0;
    for (let s = 1; s <= Math.round(2 / DT); s++) {
        scene.step();
        const { points, labels, sizes } = components(scene);
        const attached = new Set();
        points.forEach((p, k) => {
            if (ceiling - p.y <= BRIDGE_CUT) attached.add(labels[k]);
        });
        stuck = 0;
        total = points.length;
        points.forEach((p, k) => {
            if (attached.has(labels[k])) stuck++;
        });
        if (stuck < total && firstDetach === Infinity) firstDetach = s * DT;
    }
    t.diagnostic(`mínimo ${minimum.toFixed(2)} s, primer desprendimiento ${firstDetach} s, enganchadas a los 2,0 s: ${stuck} de ${total}`);
    console.log(`(a) techo: mínimo ${minimum.toFixed(2)} s, primer desprendimiento ${firstDetach} s, enganchadas a los 2,0 s: ${stuck} de ${total}`);
    assert.equal(total, 20);
    assert.ok(firstDetach >= minimum, `se desprendió a los ${firstDetach} s`);
    assert.ok(stuck >= 0.5 * total, `pegadas ${stuck} de ${total}`);
    scene.dispose();
});

/**
 * Tira vertical de una capa de `kind` pegada a una pared estática (x = 0, a la izquierda de las partículas), desde el
 * reposo, `seconds` s. Devuelve la velocidad media de bajada (m/s) entre 1 s y el final, las partículas a más de `2 r` de la
 * pared y la suma de los módulos de los impulsos de adherencia.
 */
function wallStrip(kind, seconds) {
    const scene = newScene({ gravity: G });
    addBox(scene, "wall", { x: -0.5, y: 5, w: 1, h: 10 });
    const made = fill(scene, kind, REST_DISTANCE, REST_DISTANCE, 7, 7 + 13 * SPACING);
    let sum = 0;
    let n = 0;
    for (let s = 1; s <= Math.round(seconds / DT); s++) {
        scene.step();
        if (s * DT <= 1) continue;
        eachParticle(scene, (i, slot, x, y, vx, vy) => {
            sum += -vy;
            n++;
        });
    }
    let detached = 0;
    eachParticle(scene, (i, slot, x) => {
        if (x > 2 * RADIUS) detached++;
    });
    const result = { velocity: sum / n, detached, particles: made, impulse: scene.adhesion.stats.magnitude };
    scene.dispose();
    return result;
}

test("(b) pared: una capa de miel escurre a W / k_t ± 20 % y no se despega en 5 s", (t) => {
    const strip = wallStrip(FLUID.HONEY, 5);
    const expected = WEIGHT / (2 * MU_EF * THICKNESS);
    t.diagnostic(`bajada ${(strip.velocity * 100).toFixed(2)} cm/s contra W / k_t ${(expected * 100).toFixed(2)} cm/s, despegadas ${strip.detached} de ${strip.particles}`);
    console.log(`(b) pared: ${(strip.velocity * 100).toFixed(2)} cm/s contra W / k_t ${(expected * 100).toFixed(2)} cm/s, despegadas ${strip.detached} de ${strip.particles}`);
    assert.ok(Math.abs(strip.velocity / expected - 1) < 0.2, `razón ${strip.velocity / expected}`);
    assert.equal(strip.detached, 0);
});

test("A3: con agua (X = 0) en la misma escena el impulso de adherencia es menos del 1 % del de la miel", (t) => {
    const honey = wallStrip(FLUID.HONEY, 3);
    const water = wallStrip(FLUID.WATER, 3);
    const share = water.impulse / honey.impulse;
    t.diagnostic(`impulso miel ${honey.impulse.toFixed(3)} kg·m/s, agua ${water.impulse.toExponential(2)} kg·m/s, cociente ${share.toExponential(2)}`);
    console.log(`A3: impulso de la miel ${honey.impulse.toFixed(3)} kg·m/s, del agua ${water.impulse.toExponential(2)} kg·m/s, cociente ${share.toExponential(2)}`);
    assert.ok(honey.impulse > 0);
    assert.ok(share < 0.01, `cociente ${share}`);
});

test("(c) chorro: a los 0,5 s de disparar horizontal, ≥ 80 % de la miel en vuelo tiene una vecina a menos de 2 r y la mayor componente tiene ≥ 60 %", (t) => {
    const scene = newScene({ gravity: G });
    const emitter = new ShotEmitter(scene.store, { shotId: () => 1 }, WEAPONS, null);
    const player = { weapon: FLUID.HONEY, tanks: new Map([[FLUID.HONEY, weaponById(FLUID.HONEY).tank]]), dead: false, muzzle: () => ({ x: 0, y: 5, dx: 1, dy: 0 }) };
    let now = 0;
    let result = null;
    for (let s = 1; s <= Math.round(2 / DT); s++) {
        emitter.fire(0, player, true, DT, now);
        scene.step();
        now += DT;
        if (s === Math.round(0.5 / DT)) {
            const { points, sizes } = components(scene);
            let withNeighbor = 0;
            for (let a = 0; a < points.length; a++) {
                for (let b = 0; b < points.length; b++) {
                    if (a !== b && Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) < 2 * RADIUS) {
                        withNeighbor++;
                        break;
                    }
                }
            }
            result = { flying: points.length, withNeighbor: withNeighbor / points.length, largest: Math.max(...sizes) / points.length };
        }
    }
    t.diagnostic(`en vuelo ${result.flying}, con vecina ${(100 * result.withNeighbor).toFixed(1)} %, mayor componente ${(100 * result.largest).toFixed(1)} %`);
    console.log(`(c) chorro: en vuelo ${result.flying}, con vecina ${(100 * result.withNeighbor).toFixed(1)} %, mayor componente ${(100 * result.largest).toFixed(1)} %`);
    assert.ok(result.flying >= 90, `en vuelo ${result.flying}`);
    assert.ok(result.withNeighbor >= 0.8, `con vecina ${result.withNeighbor}`);
    assert.ok(result.largest >= 0.6, `mayor componente ${result.largest}`);
    emitter.dispose();
    scene.dispose();
});

test("conservación: la cantidad de movimiento de partículas y cuerpo dinámico no cambia por la película (< 1e-6) y el libro de la tienda cierra", (t) => {
    const scene = newScene({ gravity: 0 });
    const body = addBox(scene, "block", { x: 0, y: 0, w: 0.6, h: 0.4, type: 2, density: SIGMA_W });
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
        scene.step();
        scene.adhesion.resetStats();
        const before = momentum();
        scene.adhesion.update(SUBSTEP);
        const after = momentum();
        const { stats } = scene.adhesion;
        ledger = Math.max(ledger, Math.hypot(stats.particleX + stats.bodyX + stats.staticX, stats.particleY + stats.bodyY + stats.staticY));
        real = Math.max(real, Math.hypot(after.x - before.x, after.y - before.y));
        contacts += stats.contacts;
    }
    const { created, destroyed } = scene.store;
    t.diagnostic(`contactos ${contacts}, |Σ Δp| máximo por subpaso: libro ${ledger.toExponential(2)}, velocidades reales ${real.toExponential(2)} kg·m/s`);
    console.log(`conservación: contactos ${contacts}, |Σ Δp| máximo: libro ${ledger.toExponential(2)}, reales ${real.toExponential(2)} kg·m/s`);
    assert.ok(contacts > 0, "la escena no ejercita la película");
    assert.ok(ledger < 1e-6, `libro ${ledger}`);
    assert.ok(real < 1e-6, `velocidades reales ${real}`);
    const made = created[FLUID.HONEY];
    const gone = destroyed.reduce((sum, row) => sum + (row[FLUID.HONEY] ?? 0), 0);
    let alive = 0;
    eachParticle(scene, () => alive++);
    assert.equal(made - gone, alive, `creadas ${made}, destruidas ${gone}, vivas ${alive}`);
    scene.dispose();
});

test("la película no invierte la velocidad relativa con ninguna dt, ni con una partícula sobre la superficie", () => {
    const scene = newScene({ gravity: 0 });
    const body = addBox(scene, "block", { x: 0, y: 0, w: 1, h: 0.2, type: 2, density: SIGMA_W });
    fill(scene, FLUID.HONEY, 0, 0, 0.1 + 0.001, 0.1 + 0.001);
    setVelocity(body, 5, 0);
    scene.step();
    for (const dt of [1 / 60, 1, 100]) {
        scene.adhesion.update(dt);
        let vx = 0;
        eachParticle(scene, (i, slot, x, y, px) => (vx = px));
        const vb = body.GetLinearVelocity().get_x();
        assert.ok(vx >= 0, `dt ${dt}: la partícula (${vx}) va contra el cuerpo`);
        assert.ok(vx <= vb + 1e-6, `dt ${dt}: la partícula (${vx}) no supera la velocidad del cuerpo (${vb})`);
    }
    scene.dispose();
});
const FLOOR_Y = 4;

/** Partículas de `kind` en `layers` capas de paso `SPACING` entre `x0` y `x1` sobre la plataforma de aparición (userData de mapa). */
function puddle(game, kind, x0, x1, layers) {
    const { store } = game.state;
    const def = new Box2D.b2ParticleDef();
    const [r, g, b] = weaponById(kind).color;
    const color = new Box2D.b2ParticleColor(r, g, b, 255);
    const position = new Box2D.b2Vec2(0, 0);
    def.set_flags(PARTICLE.WATER);
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

test("un robot que camina por un charco de miel avanza claramente más lento que en seco (< 0,85 ×), no más rápido que en agua (≤ 1,05 ×), y sale del charco", async (t) => {
    const dry = await walkThrough(0);
    const water = await walkThrough(FLUID.WATER);
    const honey = await walkThrough(FLUID.HONEY);
    const speed = (r) => 4 / r.crossing;
    t.diagnostic(`seco ${speed(dry).toFixed(2)} m/s, agua ${speed(water).toFixed(2)} m/s, miel ${speed(honey).toFixed(2)} m/s (${honey.particles} partículas)`);
    console.log(`velocidad media por 4 m: seco ${speed(dry).toFixed(2)} m/s, agua ${speed(water).toFixed(2)} m/s, miel ${speed(honey).toFixed(2)} m/s (${honey.particles} partículas de miel); a los 6 s x = ${honey.final.toFixed(2)} m (seco ${dry.final.toFixed(2)})`);
    assert.ok(speed(honey) < 0.85 * speed(dry), `miel ${speed(honey)} contra seco ${speed(dry)}`);
    assert.ok(speed(honey) <= 1.05 * speed(water), `miel ${speed(honey)} contra agua ${speed(water)}`);
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

test("costo: con los dos robots en un charco de unas 400 partículas de miel, adhesion.update (8 subpasos) cuesta menos de 0,5 ms por paso", async (t) => {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    shift(game, 1, 9 - game.state.players[1].torso.GetPosition().get_x());
    game.frames(10);
    const particles = puddle(game, FLUID.HONEY, 7.5, 10.5, 12);
    const { adhesion } = game.state;
    const update = adhesion.update.bind(adhesion);
    let nanoseconds = 0;
    let calls = 0;
    let contacts = 0;
    adhesion.update = (dt) => {
        const start = process.hrtime.bigint();
        update(dt);
        nanoseconds += Number(process.hrtime.bigint() - start);
        calls++;
        contacts += adhesion.stats.contacts;
    };
    game.frames(60);
    nanoseconds = 0;
    calls = 0;
    contacts = 0;
    game.frames(180);
    const ms = nanoseconds / (calls / 8) / 1e6;
    t.diagnostic(`${particles} partículas, ${(contacts / calls).toFixed(1)} con película por paso, ${ms.toFixed(4)} ms por paso`);
    console.log(`costo de adhesion.update por paso: ${ms.toFixed(4)} ms por paso (${particles} partículas, ${(contacts / calls).toFixed(1)} con película, ${calls} pasos)`);
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
