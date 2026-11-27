/**
 * Mapa que baja (#169, docs/design/16-ascenso.md §16.6): el cuerpo cinemático único del ascenso, la aparición cercana de los
 * jugadores sobre plataformas y las plataformas atravesables que se mueven, sobre LiquidFun real.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { CLIMB, ClimbGenerator, pickSpawns } from "../src/level/climb.js";
import { createSeededRandom } from "../src/core/math/random.js";

const noop = () => {};

async function infinite(seed = 1) {
    globalThis.location = { search: `?seed=${seed}` };
    const game = await loadGame({ map: "infinite" });
    for (const p of game.state.players) Object.assign(p, { drown: noop, hurt: noop, burn: noop, takeDamage: noop });
    return game;
}

test("el cuerpo del mapa baja a la velocidad de la tabla y sube con la etapa alcanzada", async () => {
    const game = await infinite();
    const { climb } = game.state;
    assert.equal(climb.offsetY, 0);
    const start = climb.offsetY;
    game.frames(120);
    const speed = (start - climb.offsetY) / 2;
    console.log(`descenso medido: ${speed.toFixed(4)} m/s, tabla ${CLIMB.scroll.base} m/s`);
    assert.ok(Math.abs(speed - CLIMB.scroll.base) < 0.01, `velocidad ${speed}`);
    climb.update({ top: 0, level: -Infinity, reached: 3 * CLIMB.stageHeight + 1 });
    assert.ok(Math.abs(climb.scrollSpeed - (CLIMB.scroll.base + 3 * CLIMB.scroll.perStage)) < 1e-12);
    const before = climb.offsetY;
    game.frames(120);
    const faster = (before - climb.offsetY) / 2;
    console.log(`en la etapa 3: ${faster.toFixed(4)} m/s, tabla ${climb.scrollSpeed.toFixed(2)} m/s`);
    assert.ok(Math.abs(faster - climb.scrollSpeed) < 0.01, `velocidad ${faster}`);
    for (const p of climb.platforms.platforms.values()) {
        const aabb = p.fixture.GetAABB(0);
        assert.ok(Math.abs(aabb.get_upperBound().get_y() - p.top) < 1e-5, "los límites de la plataforma siguen al cuerpo");
    }
});

test("un robot apoyado baja con la plataforma sin atravesarla", async () => {
    const game = await infinite();
    const { climb, players } = game.state;
    const player = players[0];
    game.frames(90);
    assert.ok(player.grounded);
    const platform = climb.level.solids.filter((s) => s.oneWay && Math.abs(player.torso.GetPosition().get_x() - s.x) <= s.w / 2).sort((a, b) => Math.abs(a.y - player.lowestPoint() + climb.offsetY) - Math.abs(b.y - player.lowestPoint() + climb.offsetY))[0];
    const top = platform.y + platform.h / 2;
    const gaps = [];
    const y0 = player.torso.GetPosition().get_y();
    const offset0 = climb.offsetY;
    for (let i = 0; i < 360; i++) {
        game.frame();
        gaps.push(player.lowestPoint() - climb.offsetY - top);
    }
    const dropped = y0 - player.torso.GetPosition().get_y();
    console.log(`el robot bajó ${dropped.toFixed(2)} m con el mapa (${(offset0 - climb.offsetY).toFixed(2)} m); pies sobre el tope entre ${Math.min(...gaps).toFixed(3)} y ${Math.max(...gaps).toFixed(3)} m`);
    assert.ok(player.grounded, "sigue apoyado");
    assert.ok(Math.abs(dropped - (offset0 - climb.offsetY)) < 0.05, "baja lo mismo que el mapa");
    assert.ok(Math.min(...gaps) > -0.05, `atravesó: ${Math.min(...gaps)}`);
    assert.ok(Math.max(...gaps) < 0.4, `se despegó: ${Math.max(...gaps)}`);
});

test("aparición: en 50 semillas los jugadores quedan sobre plataformas de la etapa 0, a 4-10 m en x y |dy| <= 3 m", () => {
    for (let seed = 1; seed <= 50; seed++) {
        const generator = new ClimbGenerator(seed);
        const platforms = [...generator.base];
        let p;
        while ((p = generator.next()).y < CLIMB.stageHeight) platforms.push(p);
        const spawns = pickSpawns(platforms, createSeededRandom(seed), CLIMB);
        const [a, b] = spawns;
        const on = (s) => platforms.some((q) => Math.abs(s.x - q.x) <= q.w / 2 && Math.abs(s.y - q.y) < 1e-9);
        assert.ok(on(a) && on(b), `semilla ${seed}: sobre un tope`);
        const d = Math.abs(a.x - b.x);
        assert.ok(d >= CLIMB.spawn.distance[0] && d <= CLIMB.spawn.distance[1], `semilla ${seed}: distancia ${d}`);
        assert.ok(Math.abs(a.y - b.y) <= CLIMB.spawn.dy, `semilla ${seed}: dy ${a.y - b.y}`);
        assert.equal(a.flipX, b.x < a.x);
        assert.equal(b.flipX, a.x < b.x);
    }
});

test("aparición con una sola plataforma válida: los dos jugadores quedan sobre ella, separados y mirándose (#201)", () => {
    const platform = { x: 28, w: 12, y: 5 };
    const [a, b] = pickSpawns([platform], createSeededRandom(7), CLIMB);
    for (const s of [a, b]) {
        assert.equal(s.y, platform.y);
        assert.ok(Math.abs(s.x - platform.x) <= platform.w / 2);
    }
    assert.ok(Math.abs(a.x - b.x) >= CLIMB.spawn.distance[0]);
    assert.equal(a.flipX, b.x < a.x);
});

test("la semilla 342562443 arranca la partida de Infinito sin error (#201)", async () => {
    globalThis.location = { search: "?seed=342562443" };
    const game = await loadGame({ map: "infinite" });
    delete globalThis.location;
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    assert.equal(game.state.players.length, 2);
    assert.ok(game.state.players.every((p) => !p.dead));
});

test("aparición en la partida: cada robot queda parado sobre su plataforma, mirando al otro, sin arma", async () => {
    for (const seed of [1, 2, 3]) {
        const game = await infinite(seed);
        const { climb, players } = game.state;
        const [a, b] = climb.spawns;
        const ax = players[0].torso.GetPosition().get_x();
        const bx = players[1].torso.GetPosition().get_x();
        assert.ok(Math.abs(ax - a.x) < 0.3 && Math.abs(bx - b.x) < 0.3, "en el punto sorteado");
        game.frames(45);
        assert.ok(players[0].grounded && players[1].grounded, `semilla ${seed}: apoyados`);
        const d = Math.abs(players[0].torso.GetPosition().get_x() - players[1].torso.GetPosition().get_x());
        console.log(`semilla ${seed}: aparecen a ${d.toFixed(1)} m, J1 en ${a.y.toFixed(1)} m y J2 en ${b.y.toFixed(1)} m`);
        assert.ok(d >= 3.5 && d <= 10.5, `distancia ${d}`);
        assert.equal(players[0].flipX, a.flipX);
        assert.equal(players[1].flipX, b.flipX);
    }
});
