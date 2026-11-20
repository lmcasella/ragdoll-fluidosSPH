/**
 * Ascenso infinito, densidad y alcance (#180, docs/design/16-ascenso.md §16.3): de 8 a 14 plataformas en cualquier ventana
 * de 10 m, dos vecinas alcanzables por plataforma, sin rachas hacia un costado y varias plataformas a la vista en una
 * partida bot contra bot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClimbGenerator, CLIMB } from "../js/climb.js";
import { Camera } from "../js/camera.js";
import { LEVEL } from "../js/level.js";
import { loadGame } from "./helpers/game.js";

const TOP = 200;
const WINDOW = 10;
const COUNT = [8, 14];
const NEIGHBOR = { gap: 3, dy: 3.3 };
const DRIFT = 6;
const BASE_TOP = CLIMB.branches.base.top[1];

function run(seed) {
    const generator = new ClimbGenerator(seed);
    const base = generator.base.map((p) => ({ ...p, index: -1 }));
    const list = [];
    do list.push(generator.next());
    while (list[list.length - 1].y < TOP);
    return { base, list, all: [...base, ...list] };
}

const gapBetween = (p, q) => Math.max(0, q.x - q.w / 2 - (p.x + p.w / 2), p.x - p.w / 2 - (q.x + q.w / 2));

test("densidad: en 50 semillas hasta 200 m, toda ventana de 10 m (de a 1 m, desde el tope de la base) tiene de 8 a 14 plataformas", () => {
    let min = Infinity;
    let max = 0;
    const bad = [];
    for (let seed = 1; seed <= 50; seed++) {
        const { all } = run(seed);
        const last = Math.max(...all.map((p) => p.y));
        for (let y = BASE_TOP; y + WINDOW <= last; y += 1) {
            const n = all.filter((p) => p.y >= y && p.y < y + WINDOW).length;
            min = Math.min(min, n);
            max = Math.max(max, n);
            if (n < COUNT[0] || n > COUNT[1]) bad.push(`semilla ${seed} y ${y}: ${n}`);
        }
    }
    console.log(`densidad: de ${min} a ${max} plataformas por ventana de ${WINDOW} m`);
    assert.deepEqual(bad.slice(0, 5), []);
});

test("alcance: en 50 semillas toda plataforma generada tiene una vecina alcanzable arriba (salvo en la última fila) y otra a su altura o abajo (hueco <= 3 m, |dy| <= 3,3 m)", () => {
    const bad = [];
    let count = 0;
    for (let seed = 1; seed <= 50; seed++) {
        const { all, list } = run(seed);
        const last = list[list.length - 1];
        for (const p of list) {
            count++;
            const near = (q) => q !== p && Math.abs(q.y - p.y) <= NEIGHBOR.dy && gapBetween(p, q) <= NEIGHBOR.gap;
            if (!all.some((q) => near(q) && q.y > p.y) && p.y <= last.y - NEIGHBOR.dy) bad.push(`semilla ${seed} plataforma ${p.index}: nada arriba`);
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

test("en pantalla: partida bot contra bot en Infinito a 1366x768, siempre se ven 5 plataformas o más (cada 0,5 s)", { timeout: 300000 }, async () => {
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
        assert.ok(min >= 5, `semilla ${seed}: ${min}`);
    }
    globalThis.location = { search: "" };
});
