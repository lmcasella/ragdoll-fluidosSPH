/**
 * Ascenso infinito, alcance (#180, docs/design/16-ascenso.md §16.3): dos vecinas alcanzables por plataforma, sin rachas
 * hacia un costado y varias plataformas a la vista en una partida bot contra bot. La densidad de 8 a 14 por ventana de
 * 10 m se retiró con #227: las filas de 1 a 4 plataformas separadas de 2,2 a 3,2 m no la garantizan.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClimbGenerator, CLIMB } from "../js/climb.js";
import { canReach } from "../js/bot.js";
import { Camera } from "../js/camera.js";
import { LEVEL } from "../js/level.js";
import { loadGame } from "./helpers/game.js";

const TOP = 200;
const WINDOW = 10;
const DRIFT = 6;

function run(seed) {
    const generator = new ClimbGenerator(seed);
    const base = generator.base.map((p) => ({ ...p, index: -1 }));
    const list = [];
    do list.push(generator.next());
    while (list[list.length - 1].y < TOP || generator.pending > 0);
    return { base, list, all: [...base, ...list] };
}

const gapBetween = (p, q) => Math.max(0, q.x - q.w / 2 - (p.x + p.w / 2), p.x - p.w / 2 - (q.x + q.w / 2));

test("alcance: en 50 semillas toda plataforma generada tiene una vecina alcanzable arriba (salvo en la última fila) y otra a su altura o abajo (hueco <= 3 m, |dy| <= 3,3 m)", () => {
    const bad = [];
    let count = 0;
    for (let seed = 1; seed <= 50; seed++) {
        const { all, list } = run(seed);
        const last = list[list.length - 1];
        for (const p of list) {
            count++;
            const near = (q) => q !== p && (q.y > p.y ? canReach(q.y - p.y, gapBetween(p, q), CLIMB.reach) : canReach(q.y - p.y, gapBetween(p, q), CLIMB.reach) && p.y - q.y <= CLIMB.reach.up.dy);
            if (!all.some((q) => near(q) && q.y > p.y) && p.y <= last.y - CLIMB.reach.up.dy) bad.push(`semilla ${seed} plataforma ${p.index}: nada arriba`);
            if (!all.some((q) => near(q) && q.y <= p.y)) bad.push(`semilla ${seed} plataforma ${p.index}: nada abajo`);
        }
    }
    console.log(`alcance: ${count} plataformas en 50 semillas, ${bad.length} sin dos vecinas`);
    assert.deepEqual(bad.slice(0, 5), []);
});

test("sin rachas: ninguna plataforma nueva queda a más de 6 m en x de la más cercana de los 10 m de abajo", () => {
    let worst = 0;
    for (let seed = 1; seed <= 50; seed++) {
        const { all, list } = run(seed);
        for (const p of list) {
            const below = all.filter((q) => q.y < p.y && q.y >= p.y - WINDOW);
            worst = Math.max(worst, Math.min(...below.map((q) => gapBetween(p, q))));
        }
    }
    console.log(`rachas: el mayor hueco en x a la plataforma más cercana de abajo es ${worst.toFixed(2)} m`);
    assert.ok(worst <= DRIFT, `hueco ${worst}`);
});

test("en pantalla: partida bot contra bot en Infinito a 1366x768, siempre se ven 4 plataformas o más (cada 0,5 s)", { timeout: 300000 }, async () => {
    const VIEW = { w: 1366, h: 768 };
    const PPM = 40;
    for (const seed of [1, 2]) {
        globalThis.location = { search: `?bot=1,2&seed=${seed}` };
        const game = await loadGame({ map: "infinite" });
        const { players, climb } = game.state;
        const camera = new Camera(LEVEL.bounds, PPM);
        camera.resize(VIEW.w, VIEW.h);
        let min = Infinity;
        let first = true;
        for (let frame = 0; frame < 60 * 60; frame++) {
            game.frame();
            const points = players.map((p) => {
                const pos = p.torso.GetPosition();
                return { x: pos.get_x(), y: pos.get_y() };
            });
            camera.setBounds(climb.cameraBounds(Math.min(...points.map((p) => p.y))));
            camera.update(points, 1 / 60, first);
            first = false;
            if (frame % 30 !== 0) continue;
            const halfW = VIEW.w / (2 * camera.scale);
            const halfH = VIEW.h / (2 * camera.scale);
            const seen = climb.level.solids.filter((s) => {
                if (s.kind !== "platform") return false;
                const y = s.y + climb.offsetY;
                return s.x + s.w / 2 > camera.x - halfW && s.x - s.w / 2 < camera.x + halfW && y + s.h / 2 > camera.y - halfH && y - s.h / 2 < camera.y + halfH;
            }).length;
            min = Math.min(min, seen);
        }
        console.log(`pantalla semilla ${seed}: mínimo de plataformas a la vista ${min}`);
        assert.ok(min >= 4, `semilla ${seed}: ${min}`);
    }
    globalThis.location = { search: "" };
});
