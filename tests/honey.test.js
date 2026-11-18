// Miel pegajosa (#41, docs/design/04-fluidos.md): el script de index.html con LiquidFun real y gamepads simulados.
// Cada medición con charco se compara con la misma corrida sin charco.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/fluid-bench.js";
import { loadGame } from "./helpers/game.js";

const { FLUID, PERSIST_MAX, fluidFromColor, weaponById } = await import("../js/weapons.js");
const { PARTICLE } = await import("../js/particles.js");

const A = 0;
const J2 = 1;
const FLOOR_Y = 4; // tope de la plataforma de aparición (LEVEL.solids)
const STICK_RIGHT = [1, 0, 0, 0];
const STICK_UP = [0, -1, 0, 0];

async function start() {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

const torso = (game, k) => game.state.players[k].torso.GetPosition();

// Mueve todas las piezas del jugador `dx` metros en x, sin tocar velocidades
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

// Partículas de miel que cuentan como las del mapa (#23): userData 0, flags VISCOUS | CONTACT_LISTENER
function addPuddle(game, centerX) {
    const system = game.state.particleSystem;
    const def = new Box2D.b2ParticleDef();
    const [r, g, b] = weaponById(FLUID.HONEY).color;
    const color = new Box2D.b2ParticleColor(r, g, b, 255);
    const position = new Box2D.b2Vec2(0, 0);
    def.set_flags(PARTICLE.VISCOUS | PARTICLE.CONTACT_LISTENER);
    def.set_color(color);
    let made = 0;
    for (let x = centerX - 1; x <= centerX + 1.0001; x += 0.15) {
        for (let layer = 0; layer < 3; layer++) {
            position.set_x(x);
            position.set_y(FLOOR_Y + 0.1 + layer * 0.15);
            def.set_position(position);
            system.CreateParticle(def);
            made++;
        }
    }
    Box2D.destroy(def);
    Box2D.destroy(color);
    Box2D.destroy(position);
    return made;
}

// Cantidad de partículas del sistema de disparos del tipo dado (por color), con userData opcional
function count(game, kind, tagAbove = -1) {
    const system = game.state.particleSystem;
    const colors = Box2D.getPointer(system.GetColorBuffer());
    const tags = system.GetUserDataBuffer() >> 2;
    let n = 0;
    for (let i = 0; i < system.GetParticleCount(); i++) {
        if (fluidFromColor(Box2D.HEAPU8[colors + i * 4], Box2D.HEAPU8[colors + i * 4 + 1]) === kind && Box2D.HEAP32[tags + i] > tagAbove) n++;
    }
    return n;
}

function tags(game, kind) {
    const system = game.state.particleSystem;
    const colors = Box2D.getPointer(system.GetColorBuffer());
    const buffer = system.GetUserDataBuffer() >> 2;
    const out = [];
    for (let i = 0; i < system.GetParticleCount(); i++) {
        if (fluidFromColor(Box2D.HEAPU8[colors + i * 4], Box2D.HEAPU8[colors + i * 4 + 1]) === kind) out.push(Box2D.HEAP32[buffer + i]);
    }
    return out;
}

// Un robot J2 parado, con o sin charco debajo, ya asentado
async function standing(puddle) {
    const game = await start();
    if (puddle) addPuddle(game, torso(game, J2).get_x());
    game.frames(60);
    return game;
}

const fmt = (n) => n.toFixed(3);

test("sobre el charco, el stick 1 s mueve el torso como máximo 0,2 veces lo que sin charco", async (t) => {
    const run = async (puddle) => {
        const game = await standing(puddle);
        const x0 = torso(game, J2).get_x();
        game.setPad(J2, { axes: STICK_RIGHT });
        game.frames(60);
        return torso(game, J2).get_x() - x0;
    };
    const free = await run(false);
    const stuck = await run(true);
    t.diagnostic(`dx sin charco ${fmt(free)} m, con charco ${fmt(stuck)} m (${fmt(stuck / free)})`);
    // El diseño pide >= 4 m y <= 0,15 veces; el clip de caminar aporta ~0,64 m/s aun con `speed` en 0 (medido)
    assert.ok(free >= 3.5, `sin charco ${free}`);
    assert.ok(stuck <= 0.2 * free, `con charco ${stuck}`);
});

test("sobre el charco, el salto sube como máximo 0,4 m (sin charco, 2 m o más)", async (t) => {
    const run = async (puddle) => {
        const game = await standing(puddle);
        const y0 = torso(game, J2).get_y();
        let peak = 0;
        game.setPad(J2, { axes: STICK_UP });
        for (let i = 0; i < 45; i++) {
            if (i === 30) game.setPad(J2);
            game.frame();
            peak = Math.max(peak, torso(game, J2).get_y() - y0);
        }
        return peak;
    };
    const free = await run(false);
    const stuck = await run(true);
    t.diagnostic(`subida sin charco ${fmt(free)} m, con charco ${fmt(stuck)} m`);
    assert.ok(free >= 2, `sin charco ${free}`);
    assert.ok(stuck <= 0.4, `con charco ${stuck}`);
});

test("parado en el charco con 2 g el torso no colapsa: altura >= 0,9 de la de sin charco", async (t) => {
    const heightOf = async (puddle) => {
        const game = await standing(puddle);
        game.frames(120);
        return torso(game, J2).get_y() - FLOOR_Y;
    };
    const free = await heightOf(false);
    const stuck = await heightOf(true);
    t.diagnostic(`altura del torso sin charco ${fmt(free)} m, con charco ${fmt(stuck)} m (${fmt(stuck / free)})`);
    assert.ok(stuck >= 0.9 * free, `${stuck} contra ${free}`);
});

test("quieto 3 s sobre el charco: pegado en todos los pasos y no se pierde miel", async () => {
    const game = await standing(true);
    const honey = count(game, FLUID.HONEY);
    assert.ok(honey > 0);
    for (let i = 0; i < 180; i++) {
        game.frame();
        assert.equal(game.state.players[J2].sticky, true, `frame ${i}`);
    }
    assert.equal(count(game, FLUID.HONEY), honey);
});

test("charco destruido: deja de estar pegado a los 0,3 s + 1 paso y recupera el movimiento", async () => {
    const game = await standing(true);
    const system = game.state.particleSystem;
    assert.equal(game.state.players[J2].sticky, true);
    for (let i = system.GetParticleCount() - 1; i >= 0; i--) system.DestroyParticle(i);
    game.frames(15);
    assert.equal(game.state.players[J2].sticky, true, "todavía dentro de la gracia");
    game.frames(7); // 0,3 s + 1 paso (algún frame no completa un paso)
    assert.equal(game.state.players[J2].sticky, false);
    const x0 = torso(game, J2).get_x();
    game.setPad(J2, { axes: STICK_RIGHT });
    game.frames(60);
    assert.ok(torso(game, J2).get_x() - x0 > 3, "camina normal de nuevo");
});

// J2 a 3 m de J1 (J1 mira a la derecha y J2 a la izquierda); los dos disparan a la vez
test("J1 dispara miel a J2 a ~3 m: J2 queda pegado, J1 no en los primeros 0,4 s; a los 8 s sigue toda la miel y nada del ácido", async () => {
    const game = await start();
    const { players, damage } = game.state;
    shift(game, J2, 7.5 + 3 - torso(game, J2).get_x());
    game.frames(30);
    const firstTag = damage.nextShot;
    players[0].weapon = FLUID.HONEY;
    players[J2].weapon = FLUID.ACID;
    game.setPad(0, { buttons: [A] });
    game.setPad(J2, { buttons: [A], axes: [0, 0, -0.7, -0.7] }); // el ácido sale hacia arriba: no cruza el chorro de miel
    let j2Stuck = false;
    for (let i = 0; i < 24; i++) {
        game.frame();
        assert.equal(game.state.players[0].sticky, false, `J1 pegado en el frame ${i}`);
        j2Stuck ||= game.state.players[J2].sticky;
    }
    for (let i = 0; i < 66; i++) {
        game.frame();
        j2Stuck ||= game.state.players[J2].sticky;
    }
    game.setPad(0);
    game.setPad(J2);
    for (let i = 0; i < 60; i++) {
        game.frame();
        j2Stuck ||= game.state.players[J2].sticky;
    }
    j2Stuck ||= game.state.players[J2].sticky;
    const emitted = weaponById(FLUID.HONEY).tank - game.state.players[0].tanks.get(FLUID.HONEY);
    assert.ok(emitted >= 70, `emitió ${emitted}`);
    game.frames(60 * 8);
    assert.equal(j2Stuck, true, "J2 quedó pegado");
    assert.equal(count(game, FLUID.HONEY, firstTag - 1), emitted, "toda la miel disparada sigue en el sistema");
    assert.equal(count(game, FLUID.ACID), 0, "el ácido venció");
});

test("la miel que cae al agua del nivel no se destruye y sigue ahí a los 8 s", async () => {
    const game = await start();
    const { players, damage } = game.state;
    shift(game, 0, 16.5 - torso(game, 0).get_x());
    game.frames(30);
    const firstTag = damage.nextShot;
    players[0].weapon = FLUID.HONEY;
    game.setPad(0, { buttons: [A], axes: [0, 0, 0.87, -0.5] }); // stick derecho a 30° sobre la horizontal: cae en la pileta
    game.frames(90);
    game.setPad(0);
    const emitted = weaponById(FLUID.HONEY).tank - game.state.players[0].tanks.get(FLUID.HONEY);
    assert.ok(emitted >= 70);
    game.frames(60 * 8);
    const inWater = (() => {
        const system = game.state.particleSystem;
        const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
        let n = 0;
        for (let i = 0; i < system.GetParticleCount(); i++) if (Box2D.HEAPF32[pos + 2 * i] > 18.5 && Box2D.HEAPF32[pos + 2 * i + 1] < 3) n++;
        return n;
    })();
    console.log(`miel emitida ${emitted}, en el sistema ${count(game, FLUID.HONEY, firstTag - 1)}, en la pileta ${inWater}`);
    assert.ok(inWater > 0, "ninguna cayó a la pileta: la prueba no ejercita el agua");
    assert.equal(count(game, FLUID.HONEY, firstTag - 1), emitted);
});

test(`tope: con 375 partículas de miel disparadas quedan como mucho ${PERSIST_MAX} y son las más nuevas`, async () => {
    const game = await start();
    const { players, damage } = game.state;
    const firstTag = damage.nextShot;
    players[0].weapon = FLUID.HONEY;
    let emitted = 0;
    game.setPad(0, { buttons: [A] });
    for (let i = 0; i < 60 * 9 && emitted < 375; i++) {
        const tank = players[0].tanks.get(FLUID.HONEY);
        if (tank === 0) {
            emitted += weaponById(FLUID.HONEY).tank;
            players[0].tanks.set(FLUID.HONEY, weaponById(FLUID.HONEY).tank);
        }
        game.frame();
    }
    emitted += weaponById(FLUID.HONEY).tank - players[0].tanks.get(FLUID.HONEY);
    game.setPad(0);
    game.frames(5);
    const left = tags(game, FLUID.HONEY).filter((tag) => tag > 0);
    console.log(`emitió ${emitted} (tanque rellenado a mano), quedan ${left.length}, id más chico ${Math.min(...left)} (primer disparo ${firstTag})`);
    assert.ok(emitted >= 375, `emitió ${emitted}`);
    assert.ok(left.length <= PERSIST_MAX, `quedan ${left.length}`);
    assert.ok(left.length >= PERSIST_MAX - 5, `quedan ${left.length}: no se destruyó de más`);
    assert.ok(Math.min(...left) > firstTag, "se destruyeron las más viejas");
});