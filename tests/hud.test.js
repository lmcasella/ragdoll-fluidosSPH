import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Hud, HUD, HUD_STATES, heatColor, heatOfHp, gaugeTop, spreadMarkers, formatClock } from "../js/hud.js";
import { fakeDocument } from "./helpers/fake-dom.js";

const player = (over = {}) => ({
    hp: 100,
    knockout: 0,
    alive: true,
    weapon: null,
    head: { x: 400, y: 300 },
    torso: { x: 400, y: 340 },
    above: null,
    ...over,
});

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
        device: "pad",
        prize: null,
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

test("el número flotante sale del torso y su color sigue la rampa de calor de la vida, en Clásico y en Infinito", () => {
    const hud = setup();
    const f = frame();
    f.players[1].hp = 58;
    hud.update(f);
    const floater = visible(hud, "dmg")[0];
    assert.equal(floater.find("n").textContent, "−42");
    assert.equal(floater.find("n").style.color, heatColor(heatOfHp(58)));
    assert.equal(floater.style.left, "400px");
    assert.equal(floater.style.top, "340px");
    assert.equal(hud.panels[1].fill.style.width, "58.0%");
    assert.equal(hud.panels[1].chip.style.width, "58.0%");
    assert.equal(hud.panels[0].fill.style.width, "100.0%");

    const inf = frame({ mode: "infinite" });
    hud.update(inf);
    inf.players[0].hp = 80;
    hud.update(inf);
    const [number] = visible(hud, "dmg").filter((el) => el.find("n").textContent === "−20");
    assert.ok(number, "en Infinito el número flotante es −N");
    assert.equal(number.find("n").style.color, heatColor(heatOfHp(80)));
    inf.players[0].hp = 20;
    hud.update(inf);
    assert.equal(number.find("n").textContent, "−80", "el daño agrupado se suma en el mismo número");
    assert.equal(number.find("n").style.color, heatColor(heatOfHp(20)), "y se recolorea con el valor nuevo");});

test("la rampa de calor interpola de blanco a rojo y nunca usa amarillo", () => {
    assert.equal(heatColor(0), "rgb(255, 255, 255)");
    assert.equal(heatColor(100), "rgb(255, 201, 160)");
    assert.equal(heatColor(250), "rgb(255, 122, 61)");
    assert.equal(heatColor(500), "rgb(255, 46, 62)");
    assert.equal(heatColor(900), "rgb(255, 46, 62)");
    assert.equal(heatColor(175), "rgb(255, 162, 111)");
    assert.equal(heatOfHp(100), 0);
    assert.equal(heatOfHp(0), 500, "vida 0 es el mismo rojo que 500 %");
    assert.equal(heatOfHp(80), 100);
    for (let t = 0; t <= 500; t += 25) {
        const [r, g, b] = heatColor(t).match(/\d+/g).map(Number);
        assert.ok(!(r > 240 && g > 200 && b < 120), `amarillo en t=${t}: ${heatColor(t)}`);
    }
    const css = readFileSync(new URL("../js/ui.css", import.meta.url), "utf8");
    for (const [i, [, rgb]] of HUD.heatStops.entries()) {
        const hex = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        assert.ok(css.includes(`--heat-${i}: ${hex};`), `--heat-${i} en ui.css`);
    }
});

test("la barrita sobre la cabeza dura 1,5 s y solo en Clásico", () => {
    const hud = setup();
    const f = frame();
    f.players[1].hp = 70;
    hud.update(f);
    assert.equal(hud.headbars[1].el.hidden, false);
    assert.equal(hud.headbars[1].el.style.left, "400px");
    assert.equal(hud.headbars[1].el.style.top, "300px");
    run(hud, f, HUD.headbar.show + 0.1);
    assert.equal(hud.headbars[1].el.hidden, true);

    const inf = frame({ mode: "infinite" });
    hud.update(inf);
    inf.players[0].hp = 88;
    hud.update(inf);
    assert.equal(visible(hud, "dmg")[0].find("n").textContent, "−12");
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

test("Clásico e Infinito muestran la barra y el número de vida; el contador del nocaut sale solo con segundos", () => {
    const hud = setup();
    assert.equal(hud.panels[0].num.textContent, "100");
    const f = frame({ mode: "infinite" });
    f.players[0].hp = 87.2;
    f.players[1].hp = 0;
    hud.update(f);
    assert.equal(hud.panels[0].num.textContent, "88");
    assert.equal(hud.panels[0].fill.style.width, "87.2%");
    assert.equal(hud.panels[1].fill.style.width, "0.0%");
    assert.ok(hud.knockouts.every((ko) => ko.el.hidden), "sin nocaut no hay contador");
    f.players[1].knockout = 14.2;
    hud.update(f);
    const counter = hud.knockouts[1];
    assert.equal(counter.el.hidden, false);
    assert.equal(counter.n.textContent, "15");
    assert.equal(counter.el.style.left, "400px");
    assert.equal(counter.el.style.top, "300px");
    assert.ok(counter.el.classes.has("dmg"), "mismo estilo del número flotante");
    assert.equal(counter.n.style.color, undefined, "blanco, sin rampa");
    f.players[1].knockout = 0.4;
    hud.update(f);
    assert.equal(counter.n.textContent, "1");
    f.players[1].knockout = 0;
    hud.update(f);
    assert.equal(counter.el.hidden, true);
    assert.equal(hud.knockouts[0].el.hidden, true);
});

test("el panel no tiene texto de arma: sin arma es el puño, con el tanque vacío el ícono se apaga", () => {
    const hud = setup();
    const f = frame();
    f.players[0].weapon = { icon: "acido", ratio: 0.62 };
    hud.update(f);
    const p = hud.panels[0];
    assert.ok(p.iconHolder.innerHTML.includes("ic-acido"));
    assert.equal(p.tankFill.style.width, "62.0%");
    assert.ok(p.tankFill.classes.has("w-acido"));
    assert.ok(!p.row2.classes.has("dry") && !p.row2.classes.has("none"));
    f.players[0].weapon.ratio = 0;
    hud.update(f);
    assert.ok(p.row2.classes.has("dry"), "tanque vacío: ícono al 35 %, sin color");
    assert.equal(p.tankFill.style.width, "0.0%");
    assert.ok(hud.panels[1].row2.classes.has("none"), "sin arma: sin tanque");
    assert.ok(hud.panels[1].iconHolder.innerHTML.includes("ic-puno"));
    const words = hud.panels.map((panel) => panel.el.allText).join("|");
    assert.ok(!/VAC[ÍI]O|Sin arma|solo golpe/i.test(words), `texto retirado: ${words}`);
});

test("los rombos reflejan las victorias y el marcador no dice mejor de ni ronda", () => {
    const hud = setup();
    const f = frame({ wins: [1, 0], round: 2, roundTime: 53 });
    hud.update(f);
    const [left, right] = hud.score.pips;
    assert.deepEqual(left.pips.map((p) => p.classes.has("p1")), [true, false]);
    assert.deepEqual(right.pips.map((p) => p.classes.has("p2")), [false, false]);
    assert.equal(hud.score.clk.textContent, "0:53");
    assert.ok(!/MEJOR|RONDA/i.test(hud.score.el.allText));
    f.wins = [1, 2];
    hud.update(f);
    assert.deepEqual(right.pips.map((p) => p.classes.has("p2")), [true, true]);
    assert.ok(right.pips[1].classes.has("new"));
    assert.equal(formatClock(125.9), "2:05");
});

test("aviso de inundación: cuenta los segundos desde 10 antes, luego el ícono latiendo; en Infinito, ola y flecha", () => {
    const hud = setup();
    const f = frame({ roundTime: 49 });
    hud.update(f);
    assert.ok(hud.score.warn.classes.has("off"));
    assert.deepEqual(hud.events, []);
    f.roundTime = 53.2;
    hud.update(f);
    assert.ok(hud.score.warn.classes.has("soon"));
    assert.equal(hud.score.warnText.textContent, "7");
    assert.deepEqual(hud.events, ["flood"], "el sonido suena al aparecer el número");
    f.roundTime = 54;
    hud.update(f);
    assert.deepEqual(hud.events, ["flood"], "y una sola vez");
    f.roundTime = 60;
    hud.update(f);
    assert.ok(hud.score.warn.classes.has("flood"));
    assert.ok(hud.score.warnText.classes.has("off"), "en curso no lleva número");
    const inf = frame({ mode: "infinite", floodStart: 5, roundTime: 4 });
    hud.update(inf);
    assert.ok(hud.score.warn.classes.has("off"));
    inf.roundTime = 6;
    hud.update(inf);
    assert.ok(hud.score.warn.classes.has("inf"));
    assert.ok(hud.score.warn.classes.has("flood"));
});

test("el medidor ubica las fichas por metros sobre el agua, marca la zona roja y separa las fichas", () => {
    assert.equal(gaugeTop(-5), 100);
    assert.equal(gaugeTop(55), 0);
    assert.equal(HUD.gauge.height, 840);
    const hud = setup();
    const f = frame({ mode: "infinite", gauge: { level: 10, stageHeight: 15, offset: 0 } });
    f.players[0].above = 20;
    f.players[1].above = 3;
    hud.update(f);
    const [m1, m2] = hud.gauge.markers;
    assert.equal(m1.mk.style.top, `${gaugeTop(20).toFixed(2)}%`);
    assert.equal(m1.value.textContent, "20");
    assert.ok(m1.up.classes.has("off"));
    assert.ok(!m1.mk.classes.has("danger"));
    assert.ok(m2.mk.classes.has("danger"));
    assert.equal(m2.value.textContent, "3");
    assert.ok(Number.parseFloat(m2.mk.style.top) > Number.parseFloat(m1.mk.style.top));
    const stages = hud.gauge.ticks.filter((t) => !t.classes.has("off"));
    assert.equal(stages.length, 4, "una raya por etapa dentro de la ventana");
    assert.ok(hud.gauge.el.allText.replace(/J1|J2|m/g, "").trim() === "20" + "3", `sin texto de más: ${hud.gauge.el.allText}`);
    f.players[0].above = 70;
    hud.update(f);
    assert.equal(m1.mk.style.top, "0.00%");
    assert.ok(!m1.up.classes.has("off"), "más arriba que la ventana: pegada arriba con la flecha");
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

test("premio de etapa: ficha con el ganador que entra, se queda y sale; suena una vez", () => {
    const hud = setup();
    const f = frame({ mode: "infinite", gauge: { level: 10, stageHeight: 15, offset: 0 } });
    hud.update(f);
    assert.ok(hud.prize.el.classes.has("off"));
    f.prize = { k: 1, left: 1.4 };
    hud.update(f);
    assert.ok(!hud.prize.el.classes.has("off"));
    assert.equal(hud.prize.badge.textContent, "J2");
    assert.ok(hud.prize.el.classes.has("p2"));
    assert.deepEqual(hud.events, ["prize"]);
    f.prize = { k: 1, left: 1 };
    hud.update(f);
    assert.deepEqual(hud.events, ["prize"], "una sola vez");
    f.prize = { k: 1, left: -0.1 };
    hud.update(f);
    assert.ok(hud.prize.el.classes.has("out"));
    f.prize = { k: 1, left: -HUD.prize.leave - 0.01 };
    hud.update(f);
    assert.ok(hud.prize.el.classes.has("off"));
    assert.ok(!/ETAPA/.test(hud.root.allText), "sin texto de etapa");
});

test("cuenta regresiva, ¡YA!, fin de ronda y fin de partida, con sus avisos de sonido", () => {
    const hud = setup();
    const f = frame({ state: "countdown", timer: 2.4, round: 2 });
    hud.update(f);
    assert.ok(!hud.countdown.wrap.classes.has("off"));
    assert.equal(hud.countdown.n.textContent, "3");
    assert.ok(hud.countdown.n.classes.has("run"));
    assert.ok(!/RONDA/i.test(hud.root.allText), "sin 'RONDA N'");
    f.timer = 1.9;
    hud.update(f);
    assert.equal(hud.countdown.n.textContent, "2");
    assert.deepEqual(hud.events, ["count", "count"]);
    hud.events.length = 0;
    f.state = "playing";
    f.go = true;
    f.roundTime = 0.1;
    hud.update(f);
    assert.ok(hud.countdown.wrap.classes.has("off"));
    assert.ok(!hud.countdown.ya.classes.has("off"));
    assert.equal(hud.countdown.ya.textContent, "¡YA!");
    assert.deepEqual(hud.events, ["go"]);
    hud.events.length = 0;

    const over = frame({ state: "roundOver", wins: [0, 1], roundWinner: 1, timer: 2.2, round: 1 });
    hud.update(over);
    assert.ok(!hud.band.el.classes.has("off"));
    assert.deepEqual(hud.events, ["band"]);
    assert.equal(hud.band.badge.textContent, "J2");
    assert.ok(hud.band.badge.classes.has("p2"));
    assert.equal(hud.band.sc2.textContent, "1");
    assert.ok(hud.band.badge2.classes.has("off"));
    assert.ok(!/ahog|GANA|Ronda|nadie/i.test(hud.band.el.allText), `texto de más: ${hud.band.el.allText}`);
    over.roundWinner = null;
    over.wins = [0, 0];
    hud.update(over);
    assert.ok(hud.band.el.classes.has("tie"));
    assert.ok(!hud.band.badge2.classes.has("off") && !hud.band.eq.classes.has("off"));
    assert.ok(hud.band.badge.classes.has("half"));
    assert.deepEqual(hud.band.pips[0].pips.map((p) => p.classes.has("p1")), [false, false]);

    const end = frame({ state: "matchOver", wins: [0, 2], matchWinner: 1, lock: 0.8 });
    hud.update(end);
    assert.ok(hud.band.el.classes.has("off"));
    assert.ok(!hud.final.el.classes.has("off"));
    assert.equal(hud.final.badge.textContent, "J2");
    assert.ok(hud.final.rematch.classes.has("lock"));
    assert.ok(hud.final.menu.classes.has("lock"));
    assert.ok(hud.final.n1.classes.has("lose"));
    assert.ok(hud.final.rematchGlyph.innerHTML.includes("g-a"));
    assert.ok(hud.final.menuGlyph.innerHTML.includes("≡"));
    end.device = "keyboard";
    end.lock = 0;
    hud.update(end);
    assert.ok(!hud.final.rematch.classes.has("lock"));
    assert.ok(hud.final.rematchGlyph.innerHTML.includes("Enter"));
    assert.ok(hud.final.menuGlyph.innerHTML.includes("Esc"));
    assert.ok(!/REVANCHA|MEN[ÚU]|PARTIDA|Teclado/.test(hud.final.el.allText), `texto de más: ${hud.final.el.allText}`);
});

test("el HUD solo se muestra en cuenta regresiva, partida, fin de ronda y fin de partida", () => {
    assert.deepEqual(HUD_STATES, ["countdown", "playing", "roundOver", "matchOver"]);
    const hud = setup();
    const f = frame();
    f.players[0].hp = 50;
    hud.update(f);
    for (const state of ["title", "menu", "controls", "assign"]) {
        hud.update(frame({ state }));
        assert.ok(hud.root.classes.has("off"), state);
        assert.equal(visible(hud, "dmg").length, 0);
    }
    for (const state of HUD_STATES) {
        hud.update(frame({ state }));
        assert.ok(!hud.root.classes.has("off"), state);
    }
});

test("el CSS oculta con display none tanto la raíz de la capa como sus partes", () => {
    const css = readFileSync(new URL("../js/ui.css", import.meta.url), "utf8");
    assert.match(css, /\.ui\.off,\s*\.ui \.off\s*\{\s*display:\s*none\s*!important/);
});

test("ninguna palabra de muerte biológica ni texto retirado en el HUD", () => {
    const hud = setup();
    const f = frame({ mode: "infinite", gauge: { level: 10, stageHeight: 15, offset: 0 }, prize: { k: 0, left: 1 } });
    f.players[0].above = 2;
    hud.update(f);
    hud.update({ ...f, state: "roundOver", roundWinner: 0, wins: [1, 0] });
    hud.update({ ...f, state: "matchOver", matchWinner: 0, wins: [2, 0] });
    assert.ok(!/ahog|muert|AGUA|EMPUJE|E1/i.test(hud.root.allText), hud.root.allText);
});
