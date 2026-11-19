import { test } from "node:test";
import assert from "node:assert/strict";
import { fillField, DT, G } from "./helpers/water-scene.js";
import { loadGame } from "./helpers/game.js";

const { stepWorld } = await import("../lib/ragimporter.js");
const { ShallowWater } = await import("../js/water.js");
const { Buoyancy } = await import("../js/buoyancy.js");
const { bodyShapes } = await import("../js/bodyShapes.js");
const { MATERIALS, SIGMA_W } = await import("../js/materials.js");

const B = SIGMA_W / 1000;
const RHO = 1000;
const CENTER_X = 28;

/** Crea un mundo vacío con gravedad y un campo de alturas con la pileta llena hasta `depth` (m). */
function makePool(depth, config = {}) {
    const gravity = new Box2D.b2Vec2(0, -G);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const water = new ShallowWater();
    fillField(water, depth);
    const buoyancy = new Buoyancy(water, MATERIALS, config);
    const scene = {
        world,
        water,
        buoyancy,
        bodies: new Map(),
        /** Un paso fijo en el orden de `index.html`: empuje y arrastre, mundo y campo. */
        step(stepWater = true) {
            buoyancy.apply(DT);
            stepWorld(world, []);
            if (stepWater) water.step(DT);
        },
        register() {
            buoyancy.register([{ rag: { bodies: scene.bodies } }]);
        },
        dispose() {
            buoyancy.dispose();
            Box2D.destroy(world);
        },
    };
    return scene;
}

/** Cuerpo dinámico con una fixture de gravedad específica `sg` (densidad `sg · σ_w`). `shape` es `{ w, h }` o `{ r }`. */
function addBody(scene, id, { x = CENTER_X, y, angle = 0, sg, w, h, r, gravityScale = 1 }) {
    const def = new Box2D.b2BodyDef();
    def.set_type(Box2D.b2_dynamicBody);
    const pos = new Box2D.b2Vec2(x, y);
    def.set_position(pos);
    def.set_angle(angle);
    def.set_gravityScale(gravityScale);
    const body = scene.world.CreateBody(def);
    let shape;
    if (r !== undefined) {
        shape = new Box2D.b2CircleShape();
        shape.set_m_radius(r);
    } else {
        shape = new Box2D.b2PolygonShape();
        shape.SetAsBox(w / 2, h / 2);
    }
    body.CreateFixture(shape, sg * SIGMA_W);
    Box2D.destroy(shape);
    Box2D.destroy(pos);
    Box2D.destroy(def);
    scene.bodies.set(id, body);
    return body;
}

function setVelocity(body, vx, vy, omega = 0) {
    const v = new Box2D.b2Vec2(vx, vy);
    body.SetLinearVelocity(v);
    Box2D.destroy(v);
    body.SetAngularVelocity(omega);
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/** Fracción sumergida de la primera pieza registrada. */
const fractionOf = (scene) => {
    const piece = scene.buoyancy.pieces[0];
    return piece.submerged / piece.area;
};

/** Recorta un polígono `[x, y, …]` contra `y ≤ level` y devuelve su área y el `y` de su centroide. */
function submergedBelow(verts, level) {
    const out = [];
    const n = verts.length / 2;
    for (let i = 0; i < n; i++) {
        const [x1, y1] = [verts[2 * i], verts[2 * i + 1]];
        const j = (i + 1) % n;
        const [x2, y2] = [verts[2 * j], verts[2 * j + 1]];
        const in1 = y1 <= level;
        const in2 = y2 <= level;
        if (in1) out.push(x1, y1);
        if (in1 !== in2) {
            const t = (level - y1) / (y2 - y1);
            out.push(x1 + t * (x2 - x1), level);
        }
    }
    const m = out.length / 2;
    let a2 = 0;
    let sy = 0;
    for (let i = 0, j = m - 1; i < m; j = i++) {
        const cross = out[2 * j] * out[2 * i + 1] - out[2 * i] * out[2 * j + 1];
        a2 += cross;
        sy += (out[2 * j + 1] + out[2 * i + 1]) * cross;
    }
    const area = a2 / 2;
    return area > 1e-12 ? { area, y: sy / (6 * area) } : { area: 0, y: level };
}

/** Vértices en el mundo de una caja `w × h` centrada en `(x, y)` girada `angle`. */
function boxVerts(x, y, angle, w, h) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const out = [];
    for (const [lx, ly] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
        out.push(x + c * lx - s * ly, y + s * lx + c * ly);
    }
    return out;
}

test("F1: cuadrados con SG 0,25, 0,5 y 0,75 flotan con esa fracción del área sumergida (8 a 10 s)", (t) => {
    for (const sg of [0.25, 0.5, 0.75]) {
        const scene = makePool(3);
        const body = addBody(scene, "box", { y: 3 + 0.5 - sg, angle: 0.1, sg, w: 1, h: 1 });
        scene.register();
        const fractions = [];
        for (let s = 0; s < 600; s++) {
            scene.step();
            if (s >= 480) fractions.push(fractionOf(scene));
        }
        const avg = mean(fractions);
        const amplitude = (Math.max(...fractions) - Math.min(...fractions)) / 2;
        t.diagnostic(`F1 SG ${sg}: fracción ${avg.toFixed(4)} (esperada ${sg}), amplitud ${amplitude.toFixed(4)}, ángulo ${body.GetAngle().toFixed(3)} rad`);
        assert.ok(Math.abs(avg - sg) / sg <= 0.1, `SG ${sg}: fracción ${avg}`);
        scene.dispose();
    }
});

test("F1b: el cuadrado de SG 0,5 queda estable a 45° y el tablón de 4 × 1 m derecho (±5°)", (t) => {
    const deg = 180 / Math.PI;
    const scene = makePool(3);
    const square = addBody(scene, "square", { x: 24, y: 3, angle: 0.2, sg: 0.5, w: 1, h: 1 });
    const plank = addBody(scene, "plank", { x: 32, y: 3, angle: 0.3, sg: 0.5, w: 4, h: 1 });
    scene.register();
    const squareAngles = [];
    const plankAngles = [];
    for (let s = 0; s < 1800; s++) {
        scene.step();
        if (s >= 1680) {
            const a = (((square.GetAngle() % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) * deg;
            squareAngles.push(a);
            const p = (((plank.GetAngle() + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI;
            plankAngles.push((p - Math.PI / 2) * deg);
        }
    }
    const squareMean = mean(squareAngles);
    const plankMean = mean(plankAngles);
    t.diagnostic(`F1b: cuadrado ${squareMean.toFixed(2)}° (esperado 45°), tablón ${plankMean.toFixed(2)}° (esperado 0°)`);
    assert.ok(Math.abs(squareMean - 45) <= 5, `cuadrado ${squareMean}`);
    assert.ok(Math.abs(plankMean) <= 5, `tablón ${plankMean}`);
    scene.dispose();
});

test("F2: el círculo de SG 0,5 flota con el 50 % del área sumergida (8 a 10 s)", (t) => {
    const scene = makePool(3);
    addBody(scene, "disc", { y: 3, sg: 0.5, r: 0.5 });
    scene.register();
    const fractions = [];
    for (let s = 0; s < 600; s++) {
        scene.step();
        if (s >= 480) fractions.push(fractionOf(scene));
    }
    const avg = mean(fractions);
    const amplitude = (Math.max(...fractions) - Math.min(...fractions)) / 2;
    t.diagnostic(`F2: fracción ${avg.toFixed(4)} (esperada 0,5), amplitud ${amplitude.toFixed(4)}`);
    assert.ok(Math.abs(avg - 0.5) / 0.5 <= 0.1, `fracción ${avg}`);
    scene.dispose();
});

test("F3: la caja de SG 2 se hunde con la velocidad terminal √(2 (SG − 1) g A / (C_d ℓ))", (t) => {
    const scene = makePool(12);
    const body = addBody(scene, "box", { y: 11.5, sg: 2, w: 1, h: 1 });
    scene.register();
    const speeds = [];
    for (let s = 0; s < 600; s++) {
        scene.step();
        const y = body.GetPosition().get_y();
        if (y < 6.5 && y > 2.5) speeds.push(-body.GetLinearVelocity().get_y());
        if (y <= 2.5) break;
    }
    const expected = Math.sqrt((2 * (2 - 1) * G * 1) / (MATERIALS.drag.box * 1));
    const measured = mean(speeds);
    t.diagnostic(`F3: v_t medida ${measured.toFixed(3)} m/s, esperada ${expected.toFixed(3)} m/s (${speeds.length} pasos)`);
    assert.ok(speeds.length > 30, `pasos en la ventana ${speeds.length}`);
    assert.ok(Math.abs(measured - expected) / expected <= 0.15, `v_t ${measured}`);
    scene.dispose();
});

test("F5: la suma de impulsos de arrastre sobre el cuerpo y la cantidad de movimiento del agua es cero", (t) => {
    const scene = makePool(12);
    const box = addBody(scene, "box", { y: 6, sg: 1, w: 1, h: 1, gravityScale: 0 });
    const disc = addBody(scene, "disc", { x: 24, y: 6, sg: 1, r: 0.5, gravityScale: 0 });
    scene.register();
    const original = Box2D.b2Body.prototype.ApplyLinearImpulse;
    let bodies = 0;
    Box2D.b2Body.prototype.ApplyLinearImpulse = function (impulse, point, wake) {
        bodies += impulse.get_x();
        return original.call(this, impulse, point, wake);
    };
    let worst = 0;
    try {
        for (let s = 0; s < 60; s++) {
            setVelocity(box, 2, 1, 0.5);
            setVelocity(disc, -1.5, 0.5);
            bodies = 0;
            const before = scene.water.momentum() * SIGMA_W;
            scene.buoyancy.apply(DT);
            const water = scene.water.momentum() * SIGMA_W - before;
            worst = Math.max(worst, Math.abs(bodies + water));
            assert.ok(Math.abs(bodies) > 1e-3, "hay arrastre");
        }
    } finally {
        Box2D.b2Body.prototype.ApplyLinearImpulse = original;
    }
    t.diagnostic(`F5: |Σ impulsos + cantidad de movimiento del agua| máximo ${worst.toExponential(2)} kg·m/s`);
    assert.ok(worst < 1e-6, `residuo ${worst}`);
    scene.dispose();
});

test("F6: caja soltada en la superficie, sin arrastre la energía se conserva y con arrastre no crece", (t) => {
    const mass = 0.5 * SIGMA_W;
    const level = 3;
    const energy = (body) => {
        const pos = body.GetPosition();
        const v = body.GetLinearVelocity();
        const sub = submergedBelow(boxVerts(pos.get_x(), pos.get_y(), body.GetAngle(), 1, 1), level);
        const ub = SIGMA_W * G * sub.area * (level - sub.y);
        const w = body.GetAngularVelocity();
        return 0.5 * mass * (v.get_x() ** 2 + v.get_y() ** 2) + 0.5 * body.GetInertia() * w * w + mass * G * pos.get_y() + ub;
    };
    const drop = mass * G * 0.6;
    const run = (config) => {
        const scene = makePool(level, config);
        const body = addBody(scene, "box", { y: level + 0.6, angle: 0.3, sg: 0.5, w: 1, h: 1 });
        scene.register();
        const series = [energy(body)];
        for (let s = 0; s < 600; s++) {
            scene.step(false);
            series.push(energy(body));
        }
        scene.dispose();
        return series;
    };
    const free = run({ dragScale: 0, viscousK: 0 });
    const maxDelta = Math.max(...free.map((e) => Math.abs(e - free[0])));
    const drift = maxDelta / Math.abs(free[0]);
    t.diagnostic(`F6 sin arrastre: |ΔE| máxima ${maxDelta.toFixed(3)} J en 10 s = ${(drift * 100).toFixed(3)} % de E (E0 ${free[0].toFixed(3)} J, y del mundo desde el piso de la pileta) y ${((maxDelta / drop) * 100).toFixed(3)} % de la energía de caída m g H (${drop.toFixed(1)} J)`);
    assert.ok(drift <= 0.02, `deriva ${drift}`);

    const damped = run({});
    let runningMin = Infinity;
    let peak = 0;
    for (let k = 120; k < damped.length; k++) {
        runningMin = Math.min(runningMin, damped[k]);
        peak = Math.max(peak, damped[k] - runningMin);
    }
    t.diagnostic(`F6 con arrastre: pico máximo sobre la envolvente ${peak.toFixed(4)} J = ${((peak / Math.abs(damped[0])) * 100).toFixed(4)} % de E y ${((peak / drop) * 100).toFixed(4)} % de m g H; E(2 s) ${damped[120].toFixed(3)} J, E(10 s) ${damped[600].toFixed(3)} J`);
    peak /= Math.abs(damped[0]);
    assert.ok(peak <= 0.01, `pico ${peak}`);
});

test("F7: world.GetAutoClearForces() devuelve true", () => {
    const scene = makePool(3);
    assert.equal(Boolean(scene.world.GetAutoClearForces()), true);
    scene.dispose();
});

test("F8: la fuerza horizontal sobre una caja fija en una onda larga coincide con Froude–Krylov (±10 %)", (t) => {
    const amplitude = 0.3;
    const length = 20;
    const k = (2 * Math.PI) / length;
    const eta = (x) => 3 + amplitude * Math.sin(k * (x - 18));
    const measure = (y, h) => {
        const scene = makePool(3);
        for (let i = 0; i < scene.water.N; i++) {
            scene.water.h[i] = Math.max(0, eta(scene.water.center(i)) - scene.water.b[i]);
            if (scene.water.b[i] > 0) scene.water.h[i] = 0;
        }
        const body = addBody(scene, "box", { x: 28, y, sg: 1, w: 1, h, gravityScale: 0 });
        scene.register();
        scene.buoyancy.apply(DT);
        const fx = (body.GetMass() * body.GetLinearVelocity().get_x()) / DT;
        scene.dispose();
        let analytic = 0;
        const n = 2000;
        for (let i = 0; i < n; i++) {
            const x = 27.5 + (i + 0.5) / n;
            const depth = Math.max(0, Math.min(eta(x), y + h / 2) - (y - h / 2));
            analytic += -RHO * G * B * depth * amplitude * k * Math.cos(k * (x - 18)) / n;
        }
        return { fx, analytic };
    };
    for (const [label, y, h] of [["sumergida", 1.5, 1], ["en la superficie", 3, 1]]) {
        const { fx, analytic } = measure(y, h);
        t.diagnostic(`F8 ${label}: F_x medida ${fx.toFixed(5)} N, analítica ${analytic.toFixed(5)} N`);
        assert.ok(Math.abs(fx - analytic) / Math.abs(analytic) <= 0.1, `${label}: ${fx} vs ${analytic}`);
    }
});

test("F9: caja y círculo arrastrados a velocidad fija reciben F = ½ ρ C_d D v² b (±10 %)", (t) => {
    const cases = [
        { id: "box", body: { w: 1, h: 1 }, cd: 2.0, d: 1 },
        { id: "disc", body: { r: 0.5 }, cd: 1.2, d: 1 },
    ];
    for (const { id, body: shape, cd, d } of cases) {
        for (const v of [0.5, 1, 2]) {
            const scene = makePool(12);
            const body = addBody(scene, id, { y: 6, sg: 1, gravityScale: 0, ...shape });
            scene.register();
            setVelocity(body, v, 0);
            scene.buoyancy.apply(DT);
            const force = (body.GetMass() * (body.GetLinearVelocity().get_x() - v)) / DT;
            const expected = -0.5 * RHO * cd * d * v * v * B;
            t.diagnostic(`F9 ${id} v=${v}: F medida ${force.toFixed(4)} N, esperada ${expected.toFixed(4)} N`);
            assert.ok(Math.abs(force - expected) / Math.abs(expected) <= 0.1, `${id} v=${v}: ${force} vs ${expected}`);
            scene.dispose();
        }
    }
});

test("bodyShapes: el círculo se guarda como 16-gono de la misma área y la caja con su área", () => {
    const scene = makePool(3);
    const disc = addBody(scene, "disc", { y: 3, sg: 1, r: 0.5 });
    const box = addBody(scene, "box", { y: 3, sg: 1, w: 2, h: 0.5 });
    const [circle] = bodyShapes(disc);
    const [rect] = bodyShapes(box);
    assert.equal(circle.n, 16);
    assert.equal(circle.kind, "circle");
    assert.ok(Math.abs(circle.area - Math.PI * 0.25) < 1e-9);
    assert.equal(rect.kind, "box");
    assert.ok(Math.abs(rect.area - 1) < 1e-6);
    scene.dispose();
});

/** Mueve todos los cuerpos de `player` `(dx, dy)` y los deja en reposo. */
function teleport(player, dx, dy) {
    const v = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const p = body.GetPosition();
        v.set_x(p.get_x() + dx);
        v.set_y(p.get_y() + dy);
        body.SetTransform(v, body.GetAngle());
        v.set_x(0);
        v.set_y(0);
        body.SetLinearVelocity(v);
        body.SetAngularVelocity(0);
    }
    Box2D.destroy(v);
}

/** Velocidad vertical (m/s) y altura (m) del centro de masa del robot. */
function centerOfMass(player) {
    let mass = 0;
    let y = 0;
    let vy = 0;
    for (const body of player.rag.bodies.values()) {
        const m = body.GetMass();
        mass += m;
        y += m * body.GetPosition().get_y();
        vy += m * body.GetLinearVelocity().get_y();
    }
    return { y: y / mass, vy: vy / mass };
}

/** Escala la masa y la inercia de todos los cuerpos del robot por `factor`. */
function scaleMass(player, factor) {
    const data = new Box2D.b2MassData();
    for (const body of player.rag.bodies.values()) {
        body.GetMassData(data);
        data.set_mass(data.get_mass() * factor);
        data.set_I(data.get_I() * factor);
        body.SetMassData(data);
    }
    Box2D.destroy(data);
}

/** Robot suelto en reposo a 5,5 m de altura en la pileta llena hasta 12 m, sin clip ni control, en una columna libre de plataformas. */
async function deepRobot(x = 37) {
    const game = await loadGame();
    const { world, water, players } = game.state;
    fillField(water, 12);
    const player = players[0];
    const torso = player.torso.GetPosition();
    teleport(player, x - torso.get_x(), 5.5 - torso.get_y());
    const buoyancy = new Buoyancy(water, MATERIALS);
    buoyancy.register([player]);
    const step = () => {
        buoyancy.apply(DT);
        stepWorld(world, [player.rag]);
        water.step(DT);
    };
    return { game, player, buoyancy, step };
}

test("F4: el robot sumergido con el ragdoll fijo queda casi quieto con el torso arriba (5 s)", async (t) => {
    const { player, buoyancy, step } = await deepRobot();
    const total = buoyancy.pieces.reduce((sum, p) => sum + p.area, 0);
    for (let s = 0; s < 300; s++) step();
    const { vy, y } = centerOfMass(player);
    const torsoY = player.torso.GetPosition().get_y();
    const feet = player.rig.feet.map((id) => player.rag.bodies.get(id).GetPosition().get_y());
    t.diagnostic(`F4: área ${total.toFixed(3)} m², v_y del centro de masa ${vy.toFixed(4)} m/s, y ${y.toFixed(3)} m, torso ${torsoY.toFixed(3)} m, pies ${feet.map((f) => f.toFixed(3)).join(" / ")} m`);
    assert.ok(Math.abs(vy) < 0.1, `v_y ${vy}`);
    assert.ok(feet.every((f) => torsoY > f), "torso por encima de los pies");
    buoyancy.dispose();
});

test("F4b: con SG 0,9 el robot sube y flota con el 90 % sumergido; con 1,1 se hunde", async (t) => {
    {
        const { player, buoyancy, step } = await deepRobot();
        const total = buoyancy.pieces.reduce((sum, p) => sum + p.area, 0);
        scaleMass(player, (0.9 * SIGMA_W * total) / 13);
        buoyancy.register([player]);
        const fractions = [];
        for (let s = 0; s < 2400; s++) {
            step();
            if (s >= 2100) fractions.push(buoyancy.pieces.reduce((sum, p) => sum + p.submerged, 0) / total);
        }
        const avg = mean(fractions);
        t.diagnostic(`F4b SG 0,9: fracción sumergida ${avg.toFixed(4)} (esperada 0,9), amplitud ${((Math.max(...fractions) - Math.min(...fractions)) / 2).toFixed(4)}, y ${centerOfMass(player).y.toFixed(3)} m`);
        assert.ok(Math.abs(avg - 0.9) / 0.9 <= 0.1, `fracción ${avg}`);
        buoyancy.dispose();
    }
    {
        const { player, buoyancy, step } = await deepRobot();
        const total = buoyancy.pieces.reduce((sum, p) => sum + p.area, 0);
        scaleMass(player, (1.1 * SIGMA_W * total) / 13);
        buoyancy.register([player]);
        const y0 = centerOfMass(player).y;
        for (let s = 0; s < 180; s++) step();
        const { y, vy } = centerOfMass(player);
        t.diagnostic(`F4b SG 1,1: v_y ${vy.toFixed(3)} m/s, descenso ${(y0 - y).toFixed(3)} m en 3 s`);
        assert.ok(vy < -0.3 && y0 - y > 1, `no se hunde: v_y ${vy}, descenso ${y0 - y}`);
        buoyancy.dispose();
    }
});

test("costo: buoyancy.apply con los dos robots en el agua cuesta menos de 0,15 ms por paso", async (t) => {
    const game = await loadGame();
    const { water, players } = game.state;
    fillField(water, 12);
    teleport(players[0], 25 - players[0].torso.GetPosition().get_x(), 5.5 - players[0].torso.GetPosition().get_y());
    teleport(players[1], 31 - players[1].torso.GetPosition().get_x(), 5.5 - players[1].torso.GetPosition().get_y());
    const buoyancy = new Buoyancy(water, MATERIALS);
    buoyancy.register(players);
    for (let s = 0; s < 200; s++) buoyancy.apply(DT);
    const steps = 2000;
    const t0 = process.hrtime.bigint();
    for (let s = 0; s < steps; s++) buoyancy.apply(DT);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / steps;
    t.diagnostic(`costo: ${ms.toFixed(4)} ms por paso, ${buoyancy.pieces.length} piezas`);
    assert.ok(ms < 0.15, `${ms} ms`);
    buoyancy.dispose();
});

test("juego: un robot que cae a la zona inundada no explota, no da NaN y flota de forma neutra", async (t) => {
    const game = await loadGame();
    const { water, players } = game.state;
    fillField(water, 7);
    game.setPad(0);
    game.setPad(1);
    const player = players[0];
    const torso = player.torso.GetPosition();
    teleport(player, 0, 10.5 - torso.get_y());
    let maxSpeed = 0;
    let finite = true;
    const samples = [];
    for (let f = 0; f < 360; f++) {
        game.frame();
        for (const body of player.rag.bodies.values()) {
            const p = body.GetPosition();
            const v = body.GetLinearVelocity();
            if (!Number.isFinite(p.get_x() + p.get_y() + v.get_x() + v.get_y())) finite = false;
            maxSpeed = Math.max(maxSpeed, Math.hypot(v.get_x(), v.get_y()));
        }
        if (f >= 240) samples.push(centerOfMass(player));
    }
    const vy = mean(samples.map((s) => Math.abs(s.vy)));
    const y = mean(samples.map((s) => s.y));
    t.diagnostic(`juego: velocidad máxima ${maxSpeed.toFixed(2)} m/s, |v_y| medio al final ${vy.toFixed(4)} m/s, y del centro de masa ${y.toFixed(3)} m (isla en 4 m, superficie en 7 m)`);
    assert.ok(finite, "sin NaN");
    assert.ok(maxSpeed < 25, `velocidad máxima ${maxSpeed}`);
    assert.ok(vy < 0.3, `|v_y| ${vy}`);
    assert.ok(y > 4 && y < 7, `y ${y}`);
});
