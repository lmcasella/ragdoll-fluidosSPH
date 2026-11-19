/**
 * Salto completo (A mantenido) desde abajo y en diagonal hacia una plataforma atravesable, en Clásico y en Infinito,
 * sobre el juego real con LiquidFun: el robot tiene que pasar de la cara inferior al tope sin quedar clavado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";

const noop = () => {};

function teleport(player, x, y) {
    const base = player.torso.GetPosition();
    const dx = x - base.get_x();
    const dy = y - base.get_y();
    const vec = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const p = body.GetPosition();
        vec.set_x(p.get_x() + dx);
        vec.set_y(p.get_y() + dy);
        body.SetTransform(vec, body.GetAngle());
        vec.set_x(0);
        vec.set_y(0);
        body.SetLinearVelocity(vec);
    }
    Box2D.destroy(vec);
}

/** Junta lo que pasa en `frames` frames con A mantenido (y `axis` en el stick) y devuelve la altura máxima de los pies; pasar la plataforma es que superen su tope. */
function jump(game, platform, axis, frames = 150) {
    const top = platform.y + platform.h / 2;
    let high = -Infinity;
    for (let i = 0; i < frames; i++) {
        game.setPad(0, { buttons: [0], axes: [axis, 0, 0, 0] });
        game.frame();
        const player = game.state.players[0];
        const low = player.lowestPoint();
        if (!Number.isFinite(low)) continue;
        high = Math.max(high, low);
    }
    return { high, top };
}

/** Pone a J1 de pie sobre `floorTop` en x y espera a que se asiente. */
function settle(game, x, floorTop) {
    const player = game.state.players[0];
    teleport(player, x, floorTop + 1.2);
    game.setPad(0);
    game.frames(60);
}

const CASES = [
    { name: "Clásico, desde abajo", map: "classic", platform: { x: 4.5, y: 6.8, w: 3, h: 0.4 }, from: 4.5, floorTop: 4, axis: 0 },
    { name: "Clásico, en diagonal de costado", map: "classic", platform: { x: 4.5, y: 6.8, w: 3, h: 0.4 }, from: 8.5, floorTop: 4, axis: -1 },
    { name: "Clásico, en diagonal desde abajo", map: "classic", platform: { x: 21, y: 5.6, w: 2, h: 0.4 }, from: 17.5, floorTop: 4, axis: 1 },
];

for (const c of CASES) {
    test(`salto completo: ${c.name}`, { timeout: 120000 }, async () => {
        globalThis.location = { search: "" };
        const game = await loadGame({ map: c.map });
        for (const p of game.state.players) Object.assign(p, { drown: noop, hurt: noop, burn: noop, takeDamage: noop });
        settle(game, c.from, c.floorTop);
        const r = jump(game, c.platform, c.axis);
        console.log(`${c.name}: pies máx ${r.high.toFixed(2)} m, tope ${r.top.toFixed(2)} m`);
        assert.ok(r.high > r.top + 0.3, `no pasó: pies máx ${r.high}`);
    });
}

test("salto completo: Infinito, bajo plataformas generadas con solapamiento y a <= 3,3 m", { timeout: 300000 }, async () => {
    globalThis.location = { search: "?seed=1" };
    const game = await loadGame({ map: "infinite" });
    for (const p of game.state.players) Object.assign(p, { drown: noop, hurt: noop, burn: noop, takeDamage: noop });
    game.state.climb.update({ top: 70, level: 0 });
    const solids = game.state.climb.level.solids;
    const rows = solids.filter((s) => s.oneWay && s.x < 30 && s.y < 60).sort((a, b) => a.y - b.y).slice(0, 40);
    let tried = 0;
    for (const p of rows) {
        const shared = (s) => Math.min(s.x + s.w / 2, p.x + p.w / 2) - Math.max(s.x - s.w / 2, p.x - p.w / 2);
        const below = solids
            .filter((s) => shared(s) >= 1.5 && s.y + s.h / 2 < p.y - 1 && s.y + s.h / 2 >= p.y - 3.3)
            .sort((a, b) => b.y + b.h / 2 - (a.y + a.h / 2))[0];
        if (!below) continue;
        tried++;
        const x = (Math.max(below.x - below.w / 2, p.x - p.w / 2) + Math.min(below.x + below.w / 2, p.x + p.w / 2)) / 2;
        settle(game, x, below.y + below.h / 2);
        const r = jump(game, p, 0);
        console.log(`Infinito plataforma x ${p.x.toFixed(1)} y ${p.y.toFixed(2)}: pies máx ${r.high.toFixed(2)} m, tope ${r.top.toFixed(2)} m`);
        assert.ok(r.high > r.top + 0.3, `no pasó en x ${p.x} y ${p.y}`);
    }
    assert.ok(tried > 0, "no había plataformas con un apoyo a <= 3,3 m");
});
