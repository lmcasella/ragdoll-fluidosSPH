import { ICONS, WEAPON_ICONS, icon, padGlyph, keyGlyph, make, text, html, style, custom, klass, flag, restart, pct } from "./uikit.js";

/**
 * HUD de partida en HTML y CSS sobre el canvas (#216, docs/design/18-interfaz.md §3.4 a §3.10, estilos en
 * `js/hud.css`). Módulo hoja: no importa ningún sistema del juego; `index.html` le pasa datos planos una vez por frame
 * (ver `Hud.update`). Los elementos se crean una sola vez y por frame solo se escriben los textos, anchos y clases que
 * cambiaron. Medidas en px de referencia sobre 1920 × 1080 (en el CSS, `--u`); solo las posiciones sobre los robots
 * llegan en píxeles de pantalla.
 *
 * - `lowHp`: vida (Clásico) por debajo de la cual el panel se pone rojo y late;
 * - `floater`: número flotante de daño, `life` y `release` en s (vida total y silencio que lo suelta) y `shakeOver`
 *   (daño agrupado a partir del cual tiembla el panel);
 * - `headbar`: barrita sobre la cabeza, `show` y `fade` en s; `chipHold` y `chipTime` el tramo blanco de la barrita;
 * - `heatStops`: rampa de calor del daño, `[t, [r, g, b]]` con interpolación lineal en RGB (§3.7);
 * - `heatSlope`: cuántos puntos de la rampa vale cada punto de vida perdido en Clásico (`t = (100 - hp) * heatSlope`);
 * - `gauge`: medidor de altura, ventana de `window` m con `below` m bajo el agua, `danger` m de zona roja y `stages`
 *   rayas a lo sumo; `height` y `marker` (px de referencia) dan la separación mínima entre fichas;
 * - `prize`: ficha del premio de etapa, `enter` y `leave` en s;
 * - `warnBefore`: segundos antes de la inundación en que empieza el aviso.
 */
export const HUD = {
    lowHp: 30,
    floater: { life: 1, release: 0.6, shakeOver: 5 },
    headbar: { show: 1.5, fade: 0.3, chipHold: 0.4, chipTime: 0.5 },
    heatStops: [
        [0, [255, 255, 255]],
        [100, [255, 201, 160]],
        [250, [255, 122, 61]],
        [500, [255, 46, 62]],
    ],
    heatSlope: 5,
    gauge: { window: 60, below: 5, danger: 4, stages: 6, height: 840, marker: 28 },
    prize: { enter: 0.24, leave: 0.3 },
    warnBefore: 10,
};

/** Estados de `Match` en los que se muestra el HUD de partida; en los demás (título, menús) queda con `display: none`. */
export const HUD_STATES = ["countdown", "playing", "roundOver", "matchOver"];

const FLOATERS = 6;

/** `m:ss` de un tiempo en segundos (se trunca a segundos enteros). */
export function formatClock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Color CSS de la rampa de calor del daño para `t` (§3.7): interpolación lineal en RGB entre los `HUD.heatStops`. */
export function heatColor(t) {
    const stops = HUD.heatStops;
    if (t <= stops[0][0]) return `rgb(${stops[0][1].join(", ")})`;
    for (let i = 1; i < stops.length; i++) {
        const [x1, c1] = stops[i];
        if (t > x1) continue;
        const [x0, c0] = stops[i - 1];
        const k = (t - x0) / (x1 - x0);
        return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(", ")})`;
    }
    return `rgb(${stops[stops.length - 1][1].join(", ")})`;
}

/** Punto de la rampa de calor para una vida `hp` en Clásico: de blanco con la vida llena a rojo con la vida en 0. */
export const heatOfHp = (hp) => Math.max(0, 100 - hp) * HUD.heatSlope;

/**
 * Posición vertical de algo a `above` m sobre el agua en el medidor, en % del alto desde arriba (0 = tope de la ventana de
 * `HUD.gauge.window` m, 100 = fondo, `HUD.gauge.below` m bajo el agua), sin recortar.
 */
export function gaugeTop(above) {
    const { window: span, below } = HUD.gauge;
    return (1 - (above + below) / span) * 100;
}

/**
 * Separa las fichas del medidor para que no se tapen: `tops` son sus posiciones reales (% desde arriba); devuelve las
 * mostradas, con la de más abajo corrida hacia abajo lo justo para dejar `gap` (%) a la de arriba. El orden es el de `tops`.
 */
export function spreadMarkers(tops, gap) {
    const order = tops.map((top, i) => i).sort((a, b) => tops[a] - tops[b]);
    const shown = tops.slice();
    for (let n = 1; n < order.length; n++) {
        shown[order[n]] = Math.max(tops[order[n]], shown[order[n - 1]] + gap);
    }
    return shown;
}

/** Rombos de victorias de un jugador: llenos los ganados, y el último ganado rebota al sumarse. */
class Pips {
    constructor(doc, parent, k) {
        this.doc = doc;
        this.k = k;
        this.el = make(doc, "span", "pips2", parent);
        this.pips = [];
        this.shown = 0;
    }

    update(wins, needed) {
        while (this.pips.length < needed) this.pips.push(make(this.doc, "span", "pip", this.el));
        const gained = wins > this.shown;
        this.pips.forEach((pip, i) => {
            flag(pip, `p${this.k + 1}`, i < wins);
            flag(pip, "off", i >= needed);
            flag(pip, "new", gained ? i === wins - 1 : i < wins && pip.$flags.new === true);
        });
        this.shown = wins;
    }
}

/** HUD de partida: paneles de jugador, marcador, aviso, medidor, daño, cuenta regresiva y carteles de fin de ronda y de partida. */
export class Hud {
    /**
     * @param document documento donde crear los elementos (inyectado para poder probarlo sin navegador).
     * @param container elemento sobre el que se monta la capa (`position: relative`, del tamaño de la ventana).
     */
    constructor(document, container) {
        const doc = document;
        this.doc = doc;
        this.root = make(doc, "div", "ui hud off", container);
        this.stage = make(doc, "div", "stage", this.root);
        const sprite = make(doc, "div", "", this.stage);
        sprite.innerHTML = ICONS;

        this.events = [];
        this.panels = [0, 1].map((k) => this.buildPanel(k));
        this.score = this.buildScore();
        this.prize = this.buildPrize();
        this.gauge = this.buildGauge();
        this.countdown = this.buildCountdown();
        this.band = this.buildBand();
        this.final = this.buildFinal();
        this.headbars = [0, 1].map((k) => this.buildHeadbar(k));
        this.floaters = Array.from({ length: FLOATERS }, () => this.buildFloater());
        this.attached = [null, null];
        this.last = [null, null];
        this.lastMode = null;
        this.lastNumber = null;
        this.soonShown = false;
        this.goShown = false;
        this.bandShown = false;
        this.prizeLeft = null;
    }

    buildPanel(k) {
        const doc = this.doc;
        const el = make(doc, "div", `pnl ${k === 0 ? "l" : "r"} classic`, this.stage);
        make(doc, "span", `badge p${k + 1}`, el, `J${k + 1}`);
        const main = make(doc, "div", "main", el);
        const row1 = make(doc, "div", `row1 p${k + 1}c`, main);
        const bar = make(doc, "div", "bar m-cls", row1);
        const chip = make(doc, "div", "chip", bar);
        const fill = make(doc, "div", "fillb", bar);
        make(doc, "div", "ticks", bar);
        const num = make(doc, "span", "num m-cls", row1, "100");
        const pctCol = make(doc, "div", "pctcol m-inf", row1);
        const big = make(doc, "span", "pctnum", pctCol);
        const bigValue = make(doc, "span", "", big, "0");
        make(doc, "small", "", big, "%");
        const pctBar = make(doc, "div", "pctbar", pctCol);
        const pctFill = make(doc, "i", "", pctBar);
        make(doc, "div", "tk5", pctBar);
        const row2 = make(doc, "div", "row2", main);
        const iconHolder = make(doc, "span", "wslot", row2);
        const tank = make(doc, "span", "tank", row2);
        const tankFill = make(doc, "i", "", tank);
        return { el, bar, chip, fill, num, big, bigValue, pctFill, row2, iconHolder, tank, tankFill };
    }

    buildScore() {
        const doc = this.doc;
        const el = make(doc, "div", "score", this.stage);
        const left = new Pips(doc, el, 0);
        const clk = make(doc, "div", "clk", el, "0:00");
        const right = new Pips(doc, el, 1);
        const warn = make(doc, "span", "warn off", this.stage);
        const warnIcon = make(doc, "span", "wi", warn);
        warnIcon.innerHTML = icon("wave");
        const warnUp = make(doc, "span", "wu", warn);
        warnUp.innerHTML = icon("up");
        const warnText = make(doc, "span", "wt", warn);
        return { el, pips: [left, right], clk, warn, warnText };
    }

    buildPrize() {
        const doc = this.doc;
        const el = make(doc, "div", "prize off", this.stage);
        const badge = make(doc, "span", "badge p1", el, "J1");
        const bolt = make(doc, "span", "pi", el);
        bolt.innerHTML = icon("bolt");
        const tank = make(doc, "span", "pi", el);
        tank.innerHTML = icon("tank");
        return { el, badge };
    }

    buildGauge() {
        const doc = this.doc;
        const { window: span, below, danger, stages } = HUD.gauge;
        const el = make(doc, "div", "gauge off", this.stage);
        const track = make(doc, "div", "track", el);
        const dz = make(doc, "div", "dz", track);
        style(dz, "bottom", pct(below / span));
        style(dz, "height", pct(danger / span));
        const wfill = make(doc, "div", "wfill", track);
        style(wfill, "height", pct(below / span));
        const ticks = Array.from({ length: stages }, () => make(doc, "span", "tick off", el));
        const markers = [0, 1].map((k) => {
            const mk = make(doc, "span", `mk p${k + 1} off`, el);
            const who = make(doc, "b", "", mk, `J${k + 1}`);
            const up = make(doc, "span", "mu off", mk);
            up.innerHTML = icon("up");
            const value = make(doc, "span", "mv", mk);
            make(doc, "small", "", mk, "m");
            return { mk, who, up, value };
        });
        const wl = make(doc, "span", "wl", el);
        wl.innerHTML = icon("wave");
        style(wl, "top", pct(1 - below / span));
        return { el, ticks, markers };
    }

    buildCountdown() {
        const doc = this.doc;
        const wrap = make(doc, "div", "off", this.stage);
        make(doc, "div", "scrim", wrap);
        const cd = make(doc, "div", "cd", wrap);
        const ring = make(doc, "div", "ring", cd);
        make(doc, "div", "core", cd);
        const n = make(doc, "span", "n", cd, "3");
        const ya = make(doc, "div", "ya off", this.stage, "¡YA!");
        return { wrap, ring, n, ya };
    }

    buildBand() {
        const doc = this.doc;
        const el = make(doc, "div", "band off", this.stage);
        const row = make(doc, "div", "row", el);
        const badge = make(doc, "span", "badge p1", row, "J1");
        const eq = make(doc, "span", "eq off", row, "=");
        const badge2 = make(doc, "span", "badge p2 half off", row, "J2");
        const left = new Pips(doc, row, 0);
        const sc = make(doc, "span", "sc", row);
        const sc1 = make(doc, "span", "c1", sc, "0");
        make(doc, "span", "", sc, " – ");
        const sc2 = make(doc, "span", "c2", sc, "0");
        const right = new Pips(doc, row, 1);
        return { el, badge, badge2, eq, pips: [left, right], sc1, sc2 };
    }

    buildFinal() {
        const doc = this.doc;
        const el = make(doc, "div", "final off", this.stage);
        const who = make(doc, "div", "who", el);
        const crown = make(doc, "span", "crown", who);
        crown.innerHTML = icon("crown");
        const badge = make(doc, "span", "badge p1", who, "J1");
        const sc = make(doc, "div", "sc", el);
        const left = new Pips(doc, sc, 0);
        const n1 = make(doc, "span", "", sc, "0");
        make(doc, "span", "dash", sc, "–");
        const n2 = make(doc, "span", "", sc, "0");
        const right = new Pips(doc, sc, 1);
        const btns = make(doc, "div", "btns", el);
        const rematch = make(doc, "div", "primary focus", btns);
        const rematchIcon = make(doc, "span", "bi", rematch);
        rematchIcon.innerHTML = icon("retry");
        const rematchGlyph = make(doc, "span", "bg", rematch);
        const menu = make(doc, "div", "primary secondary", btns);
        const menuIcon = make(doc, "span", "bi", menu);
        menuIcon.innerHTML = icon("home");
        const menuGlyph = make(doc, "span", "bg", menu);
        return { el, badge, pips: [left, right], n1, n2, rematch, menu, rematchGlyph, menuGlyph };
    }

    buildHeadbar(k) {
        const doc = this.doc;
        const el = make(doc, "div", "headbar off", this.stage);
        const chip = make(doc, "i", "chip", el);
        const fill = make(doc, "i", `p${k + 1}c`, el);
        return { el, chip, fill, timer: 0, chipRatio: 1, hold: 0 };
    }

    buildFloater() {
        const doc = this.doc;
        const el = make(doc, "div", "dmg off", this.stage);
        const n = make(doc, "span", "n", el);
        return { el, n, active: false, victim: 0, sum: 0, age: 0, since: 0, shook: false, infinite: false };
    }

    /**
     * Actualiza el HUD con los datos de este frame (todo plano) y deja en `events` los avisos para el sonido
     * (`count`, `go`, `flood`, `prize`, `band`); quien los consume vacía el arreglo:
     * - `dt` s reales del frame, `mode` ("classic" | "infinite"), `state` de `Match`, `round`, `winsNeeded`, `wins`
     *   `[J1, J2]`, `roundTime` s, `timer` s del estado de `Match`, `lock` s que faltan del bloqueo de fin de partida,
     *   `go` (recién empezó la ronda), `roundWinner` y `matchWinner` (índice o `null`), `floodStart` s, `maxPct`,
     *   `device` ("pad" o "keyboard": qué glifos de botones mostrar);
     * - `players[k]`: `hp`, `pct` (daño acumulado de Infinito), `alive`, `weapon` (`null` sin arma, o `{ icon, ratio }` con el
     *   tanque en 0 a 1), `head` y `torso` (`{ x, y }` en píxeles de pantalla sobre la cabeza y en el torso) y `above` (m del
     *   torso sobre el agua, o `null`);
     * - `gauge`: `null` fuera de Infinito, o `{ level, stageHeight, offset }` (m del agua, de una etapa y del primer piso);
     * - `prize`: `null`, o `{ k, left }` con el jugador que ganó el premio de etapa y los s que le quedan a la ficha
     *   (negativos mientras sale).
     */
    update(f) {
        const infinite = f.mode === "infinite";
        const shown = HUD_STATES.includes(f.state);
        flag(this.root, "off", !shown);
        const live = f.state === "playing" || f.state === "roundOver";
        if (f.mode !== this.lastMode || !live) {
            this.last = [null, null];
            this.lastMode = f.mode;
        }
        if (!shown) {
            this.releaseAll();
            this.lastNumber = null;
            this.soonShown = false;
            this.goShown = false;
            this.bandShown = false;
            this.prizeLeft = null;
            return;
        }

        f.players.forEach((p, k) => {
            this.updatePanel(k, p, f, infinite);
            if (live) this.detect(k, p, infinite);
        });
        this.updateScore(f);
        this.updatePrize(f);
        this.updateGauge(f, infinite);
        this.updateCountdown(f);
        this.updateBand(f);
        this.updateFinal(f);
        this.updateFeedback(f, live);
    }

    updatePanel(k, p, f, infinite) {
        const panel = this.panels[k];
        flag(panel.el, "classic", !infinite);
        flag(panel.el, "infinite", infinite);
        if (infinite) {
            const color = heatColor(p.pct);
            text(panel.bigValue, String(Math.floor(p.pct)));
            style(panel.big, "color", color);
            style(panel.pctFill, "width", pct(p.pct / f.maxPct));
            style(panel.pctFill, "backgroundColor", color);
        } else {
            const ratio = p.hp / 100;
            const low = p.hp < HUD.lowHp;
            style(panel.fill, "width", pct(ratio));
            style(panel.chip, "width", pct(ratio));
            text(panel.num, String(Math.ceil(p.hp)));
            flag(panel.bar, "low", low);
            flag(panel.num, "low", low);
        }
        const weapon = p.weapon;
        html(panel.iconHolder, icon(weapon ? weapon.icon : "puno"));
        flag(panel.row2, "none", !weapon);
        flag(panel.row2, "dry", weapon !== null && weapon.ratio <= 0);
        if (weapon) {
            style(panel.tankFill, "width", pct(weapon.ratio));
            klass(panel.tankFill, `w-${WEAPON_ICONS.includes(weapon.icon) ? weapon.icon : "agua"}`);
        }
    }

    updateScore(f) {
        const score = this.score;
        text(score.clk, formatClock(f.roundTime));
        score.pips.forEach((pips, k) => pips.update(f.wins[k], f.winsNeeded));
        const infinite = f.mode === "infinite";
        const flooding = f.state === "playing" && f.roundTime >= f.floodStart;
        const soon = !infinite && f.state === "playing" && !flooding && f.roundTime >= f.floodStart - HUD.warnBefore;
        flag(score.warn, "off", !flooding && !soon);
        flag(score.warn, "soon", soon);
        flag(score.warn, "flood", flooding);
        flag(score.warn, "inf", flooding && infinite);
        flag(score.warnText, "off", !soon);
        if (soon) text(score.warnText, String(Math.ceil(f.floodStart - f.roundTime)));
        if (soon && !this.soonShown) this.events.push("flood");
        this.soonShown = soon;
    }

    updatePrize(f) {
        const prize = this.prize;
        const p = f.prize;
        const live = f.state === "playing" && p !== null && p.left > -HUD.prize.leave;
        flag(prize.el, "off", !live);
        if (!live) {
            this.prizeLeft = null;
            return;
        }
        if (this.prizeLeft === null || p.left > this.prizeLeft) {
            restart(prize.el, "in");
            this.events.push("prize");
        }
        this.prizeLeft = p.left;
        klass(prize.badge, `badge p${p.k + 1}`);
        text(prize.badge, `J${p.k + 1}`);
        flag(prize.el, "p1", p.k === 0);
        flag(prize.el, "p2", p.k === 1);
        flag(prize.el, "out", p.left <= 0);
    }

    updateGauge(f, infinite) {
        const gauge = this.gauge;
        const g = f.gauge;
        flag(gauge.el, "off", !infinite || !g);
        if (!infinite || !g) return;
        const { window: span, below, danger, marker, height } = HUD.gauge;
        const base = g.level - below;
        const first = Math.max(1, Math.ceil((base - g.offset) / g.stageHeight));
        gauge.ticks.forEach((tick, i) => {
            const y = g.offset + (first + i) * g.stageHeight;
            const inside = y <= base + span;
            flag(tick, "off", !inside);
            if (inside) style(tick, "top", pct(1 - (y - base) / span));
        });
        const reals = [];
        const slots = [];
        f.players.forEach((p, k) => {
            const visible = p.alive && p.above !== null;
            flag(gauge.markers[k].mk, "off", !visible);
            if (!visible) return;
            slots.push(k);
            reals.push(Math.min(100, Math.max(0, gaugeTop(p.above))));
        });
        const shown = spreadMarkers(reals, (marker / height) * 100);
        slots.forEach((k, i) => {
            const m = gauge.markers[k];
            const above = f.players[k].above;
            style(m.mk, "top", `${shown[i].toFixed(2)}%`);
            custom(m.mk, "--shift", (shown[i] - reals[i]).toFixed(2));
            text(m.value, String(Math.max(0, Math.round(above))));
            flag(m.up, "off", gaugeTop(above) >= 0);
            flag(m.mk, "danger", above < danger);
        });
    }

    updateCountdown(f) {
        const cd = this.countdown;
        const counting = f.state === "countdown";
        const go = f.state === "playing" && f.go;
        flag(cd.wrap, "off", !counting);
        flag(cd.ya, "off", !go);
        if (go && !this.goShown) this.events.push("go");
        this.goShown = go;
        if (!counting) {
            this.lastNumber = null;
            return;
        }
        const n = Math.max(1, Math.ceil(f.timer));
        if (n !== this.lastNumber) {
            this.lastNumber = n;
            text(cd.n, String(n));
            restart(cd.n, "run");
            restart(cd.ring, "run");
            this.events.push("count");
        }
    }

    updateBand(f) {
        const band = this.band;
        const over = f.state === "roundOver";
        flag(band.el, "off", !over);
        band.pips.forEach((pips, k) => pips.update(f.wins[k], f.winsNeeded));
        if (over && !this.bandShown) this.events.push("band");
        this.bandShown = over;
        if (!over) return;
        const w = f.roundWinner;
        const tie = w === null;
        flag(band.el, "p1", w === 0);
        flag(band.el, "p2", w === 1);
        flag(band.el, "tie", tie);
        klass(band.badge, `badge p${tie ? 1 : w + 1}${tie ? " half" : ""}`);
        text(band.badge, `J${tie ? 1 : w + 1}`);
        flag(band.badge2, "off", !tie);
        flag(band.eq, "off", !tie);
        text(band.sc1, String(f.wins[0]));
        text(band.sc2, String(f.wins[1]));
    }

    updateFinal(f) {
        const fin = this.final;
        const over = f.state === "matchOver";
        flag(fin.el, "off", !over);
        fin.pips.forEach((pips, k) => pips.update(f.wins[k], f.winsNeeded));
        if (!over) return;
        const w = f.matchWinner ?? 0;
        flag(fin.el, "p1", w === 0);
        flag(fin.el, "p2", w === 1);
        klass(fin.badge, `badge p${w + 1}`);
        text(fin.badge, `J${w + 1}`);
        text(fin.n1, String(f.wins[0]));
        text(fin.n2, String(f.wins[1]));
        flag(fin.n1, "lose", w !== 0);
        flag(fin.n2, "lose", w !== 1);
        flag(fin.n1, "c1", w === 0);
        flag(fin.n2, "c2", w === 1);
        const keyboard = f.device === "keyboard";
        html(fin.rematchGlyph, keyboard ? keyGlyph("Enter") : padGlyph("A"));
        html(fin.menuGlyph, keyboard ? keyGlyph("Esc") : padGlyph("start"));
        const locked = f.lock > 0;
        flag(fin.rematch, "lock", locked);
        flag(fin.menu, "lock", locked);
    }

    /** Daño de este frame de la víctima `k`: compara la vida (o el %) con la del frame anterior; solo cuenta lo que baja la vida. */
    detect(k, p, infinite) {
        const value = infinite ? p.pct : p.hp;
        const previous = this.last[k];
        this.last[k] = value;
        if (previous === null) return;
        const lost = infinite ? value - previous : previous - value;
        if (lost > 1e-6) this.damage(k, lost, previous / 100, infinite, infinite ? value : heatOfHp(value));
        else if (!infinite && lost < 0) this.headbars[k].chipRatio = Math.min(1, value / 100);
    }

    damage(k, amount, previousRatio, infinite, heat) {
        let f = this.attached[k];
        if (f && f.active && f.since <= HUD.floater.release && f.age < HUD.floater.life) {
            f.sum += amount;
            f.since = 0;
            restart(f.n, "shake");
        } else {
            f = this.floaters.find((x) => !x.active) ?? this.floaters.reduce((a, b) => (a.age > b.age ? a : b));
            f.active = true;
            f.victim = k;
            f.sum = amount;
            f.age = 0;
            f.since = 0;
            f.shook = false;
            f.infinite = infinite;
            flag(f.el, "off", false);
            restart(f.el, "hit");
            restart(f.n, "shake");
            this.attached[k] = f;
        }
        const shown = Math.max(1, Math.round(f.sum));
        text(f.n, f.infinite ? `${shown}%` : `−${shown}`);
        style(f.n, "color", heatColor(heat));
        if (f.sum > HUD.floater.shakeOver && !f.shook) {
            f.shook = true;
            restart(this.panels[k].el, "shake");
        }
        if (!infinite) {
            const bar = this.headbars[k];
            bar.chipRatio = Math.max(bar.chipRatio, previousRatio);
            bar.hold = HUD.headbar.chipHold;
            bar.timer = HUD.headbar.show;
            flag(bar.el, "off", false);
            flag(bar.el, "fade", false);
        }
    }

    updateFeedback(f, live) {
        const dt = f.dt;
        for (const fl of this.floaters) {
            if (!fl.active) continue;
            fl.age += dt;
            fl.since += dt;
            if (this.attached[fl.victim] === fl && fl.since > HUD.floater.release) this.attached[fl.victim] = null;
            if (fl.age >= HUD.floater.life) {
                fl.active = false;
                if (this.attached[fl.victim] === fl) this.attached[fl.victim] = null;
                flag(fl.el, "off", true);
                continue;
            }
            const torso = f.players[fl.victim].torso;
            if (this.attached[fl.victim] === fl && torso) this.place(fl.el, torso);
        }
        this.headbars.forEach((bar, k) => {
            if (bar.timer <= 0) {
                flag(bar.el, "off", true);
                return;
            }
            bar.timer -= dt;
            const p = f.players[k];
            const ratio = Math.max(0, p.hp / 100);
            if (bar.hold > 0) bar.hold -= dt;
            else bar.chipRatio = Math.max(ratio, bar.chipRatio - dt / HUD.headbar.chipTime);
            style(bar.fill, "width", pct(ratio));
            style(bar.chip, "width", pct(bar.chipRatio));
            flag(bar.el, "fade", bar.timer < HUD.headbar.fade);
            if (p.head) this.place(bar.el, p.head);
            if (bar.timer <= 0) flag(bar.el, "off", true);
        });
        if (!live) this.releaseAll();
    }

    place(el, point) {
        style(el, "left", `${Math.round(point.x)}px`);
        style(el, "top", `${Math.round(point.y)}px`);
    }

    /** Suelta los números flotantes y las barritas (fuera de la ronda en juego). */
    releaseAll() {
        for (const fl of this.floaters) {
            fl.active = false;
            flag(fl.el, "off", true);
        }
        this.attached = [null, null];
        for (const bar of this.headbars) {
            bar.timer = 0;
            bar.chipRatio = 1;
            flag(bar.el, "off", true);
        }
    }
}
