import { test } from "node:test";
import assert from "node:assert/strict";
import { Hud, HUD, pctColor, gaugeTop, spreadMarkers, formatClock } from "../js/hud.js";
import { fakeDocument } from "./helpers/fake-dom.js";

const player = (over = {}) => ({ hp: 100, pct: 0, alive: true, weapon: null, head: { x: 400, y: 300 }, above: null, ...over });

function frame(over = {}) {
    return {
        dt: 1 / 60,
        mode: "classic",
        state: "playing",
        round: 1,
        winsNeeded: 2,
        wins: [0, 0],
        roundTime: 5,
        timer: 0,
        lock: 0,
        go: false,
        roundWinner: null,
        matchWinner: null,
        floodStart: 60,
        maxPct: 500,
        players: [player(), player()],
        gauge: null,
        ...over,
    };
}

function setup() {
    const doc = fakeDocument();
    const hud = new Hud(doc, doc.body);
    hud.update(frame());
    return hud;
}

const run = (hud, f, seconds) => {
    for (let t = 0; t < seconds; t += f.dt) hud.update(f);
};
const visible = (hud, name) => hud.root.findAll(name).filter((el) => !el.hidden);

test("daño seguido: se suma en un solo número y desaparece pasada la ventana", () => {
    const hud = setup();
    const f = frame();
    for (const hp of [95, 90, 85]) {
        f.players[0].hp = hp;
        hud.update(f);
    }
    const floaters = visible(hud, "dmg");
    assert.equal(floaters.length, 1);
    assert.equal(floaters[0].find("n").textContent, "−15");
    run(hud, f, HUD.floater.release + 0.1);
    f.players[0].hp = 80;
    hud.update(f);
    assert.equal(visible(hud, "dmg").length, 2, "tras la pausa el próximo daño crea otro número");
    run(hud, f, HUD.floater.life + 0.1);
    assert.equal(visible(hud, "dmg").length, 0);
});

test("daño de la víctima J2 no toca el número de J1 y el tramo blanco queda en el ancho nuevo", () => {
    const hud = setup();
    const f = frame();
    f.players[1].hp = 58;
    hud.update(f);
    assert.equal(visible(hud, "dmg")[0].find("n").textContent, "−42");
    assert.equal(hud.panels[1].fill.style.width, "58.0%");
    assert.equal(hud.panels[1].chip.style.width, "58.0%");
    assert.equal(hud.panels[0].fill.style.width, "100.0%");
});

test("la barrita sobre la cabeza dura 1,5 s y solo en Clásico", () => {
    const hud = setup();
    const f = frame();
    f.players[1].hp = 70;
    hud.update(f);
    assert.equal(hud.headbars[1].el.hidden, false);
    assert.equal(hud.headbars[1].el.style.left, "400px");
    run(hud, f, HUD.headbar.show + 0.1);
    assert.equal(hud.headbars[1].el.hidden, true);

    const inf = frame({ mode: "infinite" });
    hud.update(inf);
    inf.players[0].pct = 12;
    hud.update(inf);
    assert.equal(visible(hud, "dmg")[0].find("n").textContent, "+12 %");
    assert.equal(hud.headbars[0].el.hidden, true);
});

test("curar no muestra daño y el cambio de ronda no cuenta como daño", () => {
    const hud = setup();
    const f = frame();
    f.players[0].hp = 50;
    hud.update(f);
    run(hud, f, 2);
    f.state = "countdown";
    f.players[0].hp = 100;
    hud.update(f);
    f.state = "playing";
    hud.update(f);
    assert.equal(visible(hud, "dmg").length, 0);
});

test("con vida menor que 30 el panel recibe la clase de peligro", () => {
    const hud = setup();
    const f = frame();
    f.players[0].hp = 30;
    hud.update(f);
    assert.ok(!hud.panels[0].bar.classes.has("low"));
    f.players[0].hp = 29.5;
    hud.update(f);
    assert.ok(hud.panels[0].bar.classes.has("low"));
    assert.ok(hud.panels[0].num.classes.has("low"));
    assert.equal(hud.panels[0].num.textContent, "30");
    assert.ok(!hud.panels[1].bar.classes.has("low"));
});

test("Clásico muestra la barra y el número; Infinito, el %", () => {
    const hud = setup();
    assert.ok(hud.panels[0].el.classes.has("classic"));
    assert.ok(!hud.panels[0].el.classes.has("infinite"));
    assert.equal(hud.panels[0].num.textContent, "100");
    const f = frame({ mode: "infinite" });
    f.players[0].pct = 87.9;
    hud.update(f);
    assert.ok(hud.panels[0].el.classes.has("infinite"));
    assert.ok(!hud.panels[0].el.classes.has("classic"));
    assert.equal(hud.panels[0].bigValue.textContent, "87");
    assert.equal(hud.panels[0].pctFill.style.width, "17.6%");
    assert.equal(hud.panels[0].big.style.color, pctColor(87.9));
});

test("el color del % interpola entre las paradas del diseño", () => {
    assert.equal(pctColor(0), "rgb(255, 255, 255)");
    assert.equal(pctColor(100), "rgb(255, 233, 160)");
    assert.equal(pctColor(250), "rgb(255, 138, 106)");
    assert.equal(pctColor(900), "rgb(255, 77, 94)");
    assert.equal(pctColor(175), "rgb(255, 186, 133)");
});

test("el arma muestra ícono, nombre y tanque; con el tanque en 0, VACÍO; sin arma, solo golpe", () => {
    const hud = setup();
    const f = frame();
    f.players[0].weapon = { icon: "acido", name: "Ácido", ratio: 0.62 };
    hud.update(f);
    const p = hud.panels[0];
    assert.ok(p.iconHolder.innerHTML.includes("ic-acido"));
    assert.equal(p.name.textContent, "Ácido");
    assert.equal(p.tankFill.style.width, "62.0%");
    assert.ok(p.empty.classes.has("off"));
    f.players[0].weapon.ratio = 0;
    hud.update(f);
    assert.ok(!p.empty.classes.has("off"));
    assert.ok(hud.panels[1].none.classes.has("off") === false);
    assert.ok(p.none.classes.has("off"));
});

test("los rombos reflejan las victorias y el marcador dice al mejor de 3", () => {
    const hud = setup();
    const f = frame({ wins: [1, 0], round: 2, roundTime: 53 });
    hud.update(f);
    const [left, right] = hud.score.pips;
    assert.deepEqual(left.pips.map((p) => p.classes.has("p1")), [true, false]);
    assert.deepEqual(right.pips.map((p) => p.classes.has("p2")), [false, false]);
    assert.equal(hud.score.bo.textContent, "AL MEJOR DE 3");
    assert.equal(hud.score.rd.textContent, "RONDA 2");
    assert.equal(hud.score.clk.textContent, "0:53");
    f.wins = [1, 2];
    hud.update(f);
    assert.deepEqual(right.pips.map((p) => p.classes.has("p2")), [true, true]);
    assert.ok(right.pips[1].classes.has("new"));
    assert.equal(formatClock(125.9), "2:05");
});

test("aviso de inundación: cuenta desde 10 s antes, luego ¡INUNDACIÓN!; en Infinito, EL AGUA SUBE", () => {
    const hud = setup();
    const f = frame({ roundTime: 49 });
    hud.update(f);
    assert.ok(hud.score.warn.classes.has("off"));
    f.roundTime = 53.2;
    hud.update(f);
    assert.ok(hud.score.warn.classes.has("soon"));
    assert.equal(hud.score.warnText.textContent, "INUNDACIÓN EN 7");
    f.roundTime = 60;
    hud.update(f);
    assert.ok(hud.score.warn.classes.has("flood"));
    assert.equal(hud.score.warnText.textContent, "¡INUNDACIÓN!");
    const inf = frame({ mode: "infinite", floodStart: 5, roundTime: 4 });
    hud.update(inf);
    assert.ok(hud.score.warn.classes.has("off"));
    inf.roundTime = 6;
    hud.update(inf);
    assert.equal(hud.score.warnText.textContent, "EL AGUA SUBE");
});

test("el medidor ubica las fichas por metros sobre el agua, marca la zona roja y separa las fichas", () => {
    assert.equal(gaugeTop(-5), 100);
    assert.equal(gaugeTop(55), 0);
    const hud = setup();
    const f = frame({ mode: "infinite", gauge: { level: 10, stageHeight: 15, offset: 0 } });
    f.players[0].above = 20;
    f.players[1].above = 3;
    hud.update(f);
    const [m1, m2] = hud.gauge.markers;
    assert.equal(m1.mk.style.top, `${gaugeTop(20).toFixed(2)}%`);
    assert.equal(m1.value.textContent, "20 m");
    assert.ok(!m1.mk.classes.has("danger"));
    assert.ok(m2.mk.classes.has("danger"));
    assert.equal(m2.value.textContent, "3 m");
    assert.ok(m2.mk.style.top > m1.mk.style.top || Number.parseFloat(m2.mk.style.top) > Number.parseFloat(m1.mk.style.top));
    assert.equal(hud.gauge.ticks[0].label.textContent, "E1");
    const labels = hud.gauge.ticks.filter((t) => !t.label.classes.has("off")).map((t) => t.label.textContent);
    assert.deepEqual(labels, ["E1", "E2", "E3", "E4"]);
    f.players[0].above = 70;
    hud.update(f);
    assert.equal(m1.mk.style.top, "0.00%");
    assert.equal(m1.value.textContent, "▲ 70 m");
    assert.deepEqual(spreadMarkers([50, 51], 4.5), [50, 54.5]);
    assert.deepEqual(spreadMarkers([60, 20], 4.5), [60, 20]);
});

test("el medidor solo aparece en Infinito y los robots caídos no tienen ficha", () => {
    const hud = setup();
    assert.ok(hud.gauge.el.classes.has("off"));
    const f = frame({ mode: "infinite", gauge: { level: 10, stageHeight: 15, offset: 0 } });
    f.players[0].above = 20;
    f.players[1].above = 8;
    f.players[1].alive = false;
    hud.update(f);
    assert.ok(!hud.gauge.el.classes.has("off"));
    assert.ok(hud.gauge.markers[1].mk.classes.has("off"));
});

test("cuenta regresiva, ¡YA!, fin de ronda y fin de partida", () => {
    const hud = setup();
    const f = frame({ state: "countdown", timer: 2.4, round: 2 });
    hud.update(f);
    assert.ok(!hud.countdown.wrap.classes.has("off"));
    assert.equal(hud.countdown.n.textContent, "3");
    assert.ok(hud.countdown.n.classes.has("run"));
    f.timer = 1.9;
    hud.update(f);
    assert.equal(hud.countdown.n.textContent, "2");
    f.state = "playing";
    f.go = true;
    f.roundTime = 0.1;
    hud.update(f);
    assert.ok(hud.countdown.wrap.classes.has("off"));
    assert.ok(!hud.countdown.ya.classes.has("off"));

    const over = frame({ state: "roundOver", wins: [0, 1], roundWinner: 1, timer: 2.2, round: 1 });
    hud.update(over);
    assert.ok(!hud.band.el.classes.has("off"));
    assert.equal(hud.band.winner.textContent, "J2");
    assert.equal(hud.band.verdict.textContent, " GANA LA RONDA");
    assert.equal(hud.band.sc2.textContent, "1");
    assert.equal(hud.band.next.textContent, "Ronda 2 en 3");
    assert.ok(!/ahog/i.test(hud.root.allText));
    over.roundWinner = null;
    over.wins = [0, 0];
    hud.update(over);
    assert.equal(hud.band.verdict.textContent, "EMPATE");
    assert.ok(hud.band.next.textContent.startsWith("nadie suma"));

    const end = frame({ state: "matchOver", wins: [0, 2], matchWinner: 1, lock: 0.8 });
    hud.update(end);
    assert.ok(hud.band.el.classes.has("off"));
    assert.ok(!hud.final.el.classes.has("off"));
    assert.equal(hud.final.badge.textContent, "J2");
    assert.ok(hud.final.rematch.classes.has("lock"));
    assert.ok(hud.final.menu.classes.has("lock"));
    assert.ok(hud.final.n1.classes.has("lose"));
    end.lock = 0;
    hud.update(end);
    assert.ok(!hud.final.rematch.classes.has("lock"));
    assert.ok(hud.root.allText.includes("REVANCHA") && hud.root.allText.includes("MENÚ"));
});

test("en el título el HUD queda oculto y sin números flotantes", () => {
    const hud = setup();
    const f = frame();
    f.players[0].hp = 50;
    hud.update(f);
    hud.update(frame({ state: "title" }));
    assert.ok(hud.root.classes.has("off"));
    assert.equal(visible(hud, "dmg").length, 0);
});
