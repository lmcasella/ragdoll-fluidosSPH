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
 * - `pctStops`: color del % de Infinito, `[%, [r, g, b]]` con interpolación lineal;
 * - `gauge`: medidor de altura, ventana de `window` m con `below` m bajo el agua, `danger` m de zona roja y `stages`
 *   rayas a lo sumo; `height` y `marker` (px de referencia) dan la separación mínima entre fichas.
 */
export const HUD = {
    lowHp: 30,
    floater: { life: 1.2, release: 0.6, shakeOver: 5 },
    headbar: { show: 1.5, fade: 0.3, chipHold: 0.4, chipTime: 0.5 },
    pctStops: [
        [0, [255, 255, 255]],
        [100, [255, 233, 160]],
        [250, [255, 138, 106]],
        [500, [255, 77, 94]],
    ],
    gauge: { window: 60, below: 5, danger: 4, stages: 6, height: 790, marker: 36 },
};

const FLOATERS = 6;

const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-agua" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5C9 7 5.5 10.6 5.5 14.6a6.5 6.5 0 0 0 13 0C18.5 10.6 15 7 12 2.5z"/></symbol>
<symbol id="i-acido" viewBox="0 0 24 24"><path fill="currentColor" d="M10 3.5C7.6 7.2 4.8 10.1 4.8 13.4a5.2 5.2 0 0 0 10.4 0C15.2 10.1 12.4 7.2 10 3.5z"/><circle cx="18.5" cy="6.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="19" cy="13" r="1.5" fill="currentColor"/><circle cx="16" cy="19.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>
<symbol id="i-lava" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c1.2 3.6 5.8 6 5.8 11.2A5.8 5.8 0 0 1 6.2 13.2c0-2.3 1-3.8 2.4-5.2.2 2 1 3.2 2.3 3.6C10.4 8 11 4.8 12 2z"/></symbol>
<symbol id="i-miel" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5l7.5 4.3v8.6L15 18v3.5a1.5 1.5 0 0 1-3 0V19.7l-7.5-4.3V6.8z"/></symbol>
<symbol id="i-puno" viewBox="0 0 24 24"><path fill="currentColor" d="M6 9.5a2 2 0 0 1 2-2h8.5a2.5 2.5 0 0 1 2.5 2.5v4.5a6 6 0 0 1-6 6h-2A5 5 0 0 1 6 15.5zM8 5.5a1.5 1.5 0 0 1 3 0V7H8zm3.5-.5a1.5 1.5 0 0 1 3 0v2h-3zm3.5.5a1.5 1.5 0 0 1 3 0V7h-3z"/></symbol>
<symbol id="i-wave" viewBox="0 0 24 24"><path fill="currentColor" d="M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2v3c-2.5 0-2.5-2-5-2s-2.5 2-5 2-2.5-2-5-2-2.5 2-5 2zM12 3l4 5h-2.5v3h-3V8H8z"/></symbol>
<symbol id="i-up" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4l7 8h-4.5v8h-5v-8H5z"/></symbol>
</defs></svg>`;

const WEAPON_ICONS = ["agua", "acido", "lava", "miel", "puno"];

const icon = (name) => `<svg class="wicon ic-${name}"><use href="#i-${name}"/></svg>`;

/** `m:ss` de un tiempo en segundos (se trunca a segundos enteros). */
export function formatClock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Color CSS del % de daño de Infinito: interpolación lineal entre los `HUD.pctStops`. */
export function pctColor(pct) {
    const stops = HUD.pctStops;
    if (pct <= stops[0][0]) return `rgb(${stops[0][1].join(", ")})`;
    for (let i = 1; i < stops.length; i++) {
        const [x1, c1] = stops[i];
        if (pct > x1) continue;
        const [x0, c0] = stops[i - 1];
        const t = (pct - x0) / (x1 - x0);
        return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * t)).join(", ")})`;
    }
    return `rgb(${stops[stops.length - 1][1].join(", ")})`;
}

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

function make(doc, tag, className, parent, content) {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    if (parent) parent.appendChild(el);
    return el;
}

function text(node, value) {
    if (node.$text !== value) {
        node.$text = value;
        node.textContent = value;
    }
}

function html(node, value) {
    if (node.$html !== value) {
        node.$html = value;
        node.innerHTML = value;
    }
}

function style(node, prop, value) {
    const cache = (node.$style ??= {});
    if (cache[prop] !== value) {
        cache[prop] = value;
        node.style[prop] = value;
    }
}

function klass(node, value) {
    if (node.$class !== value) {
        node.$class = value;
        node.className = value;
    }
}

function custom(node, prop, value) {
    const cache = (node.$style ??= {});
    if (cache[prop] !== value) {
        cache[prop] = value;
        node.style.setProperty(prop, value);
    }
}

function flag(node, name, on) {
    const cache = (node.$flags ??= {});
    if (cache[name] !== on) {
        cache[name] = on;
        node.classList.toggle(name, on);
    }
}

/** Reinicia la animación CSS de `name` en `node` (quita la clase, fuerza el recálculo y la vuelve a poner). */
function restart(node, name) {
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
}

const pct = (ratio) => `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(1)}%`;

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

export class Hud {
    /**
     * @param document documento donde crear los elementos (inyectado para poder probarlo sin navegador).
     * @param container elemento sobre el que se monta la capa (`position: relative`, del tamaño de la ventana).
     */
    constructor(document, container) {
        const doc = document;
        this.doc = doc;
        this.root = make(doc, "div", "hud off", container);
        this.stage = make(doc, "div", "stage", this.root);
        const sprite = make(doc, "div", "", this.stage);
        sprite.innerHTML = ICONS;

        this.panels = [0, 1].map((k) => this.buildPanel(k));
        this.score = this.buildScore();
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
        const big = make(doc, "span", "pctnum m-inf", row1);
        const bigValue = make(doc, "span", "", big, "0");
        make(doc, "small", "", big, "%");
        const meta = make(doc, "div", "pctmeta m-inf", row1);
        const pctBar = make(doc, "div", "pctbar", meta);
        const pctFill = make(doc, "i", "", pctBar);
        make(doc, "div", "tk5", pctBar);
        const row2 = make(doc, "div", "row2", main);
        const iconHolder = make(doc, "span", "", row2);
        const name = make(doc, "span", "", row2);
        const tank = make(doc, "span", "tank", row2);
        const tankFill = make(doc, "i", "", tank);
        const empty = make(doc, "span", "empty", row2, "VACÍO");
        const none = make(doc, "span", "none", row2, "Sin arma · solo golpe");
        return { el, bar, chip, fill, num, big, bigValue, pctFill, iconHolder, name, tank, tankFill, empty, none };
    }

    buildScore() {
        const doc = this.doc;
        const el = make(doc, "div", "score", this.stage);
        const bo = make(doc, "span", "bo", el, "AL MEJOR DE 3");
        const sb = make(doc, "div", "sb", el);
        const left = new Pips(doc, sb, 0);
        const mid = make(doc, "div", "mid", sb);
        const rd = make(doc, "div", "rd", mid, "RONDA 1");
        const clk = make(doc, "div", "clk", mid, "0:00");
        const right = new Pips(doc, sb, 1);
        const warn = make(doc, "span", "warn off", el);
        const warnIcon = make(doc, "span", "", warn);
        warnIcon.innerHTML = icon("wave");
        const warnText = make(doc, "span", "", warn);
        return { el, bo, pips: [left, right], rd, clk, warn, warnText };
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
        const ticks = Array.from({ length: stages }, () => ({
            line: make(doc, "span", "tick off", el),
            label: make(doc, "span", "tl off", el),
        }));
        const markers = [0, 1].map((k) => {
            const mk = make(doc, "span", `mk p${k + 1} off`, el);
            const who = make(doc, "b", "", mk, String(k + 1));
            const value = make(doc, "span", "", mk);
            return { mk, who, value };
        });
        const wl = make(doc, "span", "wl", el);
        const wlIcon = make(doc, "span", "", wl);
        wlIcon.innerHTML = `<svg style="width:calc(18 * var(--u));height:calc(18 * var(--u))"><use href="#i-up"/></svg>`;
        make(doc, "span", "", wl, "AGUA");
        style(wl, "top", pct(1 - below / span));
        return { el, ticks, markers };
    }

    buildCountdown() {
        const doc = this.doc;
        const wrap = make(doc, "div", "off", this.stage);
        make(doc, "div", "scrim", wrap);
        const label = make(doc, "div", "cd-label", wrap, "RONDA 1");
        const cd = make(doc, "div", "cd", wrap);
        const ring = make(doc, "div", "ring", cd);
        make(doc, "div", "core", cd);
        const n = make(doc, "span", "n", cd, "3");
        const ya = make(doc, "div", "ya off", this.stage, "¡YA!");
        return { wrap, label, ring, n, ya };
    }

    buildBand() {
        const doc = this.doc;
        const el = make(doc, "div", "band off", this.stage);
        const k1 = make(doc, "span", "k1", el, "RONDA 1");
        const big = make(doc, "span", "big", el);
        const winner = make(doc, "span", "c1", big, "J1");
        const verdict = make(doc, "span", "", big, " GANA LA RONDA");
        const row = make(doc, "span", "row", el);
        const left = new Pips(doc, row, 0);
        const sc = make(doc, "span", "sc", row);
        const sc1 = make(doc, "span", "c1", sc, "0");
        make(doc, "span", "", sc, " – ");
        const sc2 = make(doc, "span", "c2", sc, "0");
        const right = new Pips(doc, row, 1);
        const next = make(doc, "span", "row next", el);
        return { el, k1, big, winner, verdict, pips: [left, right], sc1, sc2, next };
    }

    buildFinal() {
        const doc = this.doc;
        const el = make(doc, "div", "final off", this.stage);
        make(doc, "span", "lbl", el, "PARTIDA TERMINADA");
        const who = make(doc, "div", "who", el);
        const badge = make(doc, "span", "badge p1", who, "J1");
        const title = make(doc, "span", "t", who);
        title.innerHTML = "GANA LA<br>PARTIDA";
        const sc = make(doc, "div", "sc", el);
        const left = new Pips(doc, sc, 0);
        const n1 = make(doc, "span", "", sc, "0");
        make(doc, "span", "dash", sc, "–");
        const n2 = make(doc, "span", "", sc, "0");
        const right = new Pips(doc, sc, 1);
        const btns = make(doc, "div", "btns", el);
        const rematch = make(doc, "div", "primary focus", btns);
        make(doc, "span", "g g-face g-a", rematch, "A");
        make(doc, "span", "", rematch, "REVANCHA");
        const menu = make(doc, "div", "primary secondary", btns);
        make(doc, "span", "g g-menu", menu, "≡");
        make(doc, "span", "", menu, "MENÚ");
        make(doc, "div", "kbhint", el, "Teclado: Enter revancha · Esc menú");
        return { el, badge, pips: [left, right], n1, n2, rematch, menu };
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
     * Actualiza el HUD con los datos de este frame (todo plano):
     * - `dt` s reales del frame, `mode` ("classic" | "infinite"), `state` de `Match`, `round`, `winsNeeded`, `wins`
     *   `[J1, J2]`, `roundTime` s, `timer` s del estado de `Match`, `lock` s que faltan del bloqueo de fin de partida,
     *   `go` (recién empezó la ronda), `roundWinner` y `matchWinner` (índice o `null`), `floodStart` s, `maxPct`;
     * - `players[k]`: `hp`, `pct` (daño acumulado de Infinito), `alive`, `weapon` (`null` sin arma, o `{ icon, name, ratio }` con el
     *   tanque en 0 a 1), `head` (`{ x, y }` en píxeles de pantalla sobre la cabeza) y `above` (m del torso sobre el agua, o `null`);
     * - `gauge`: `null` fuera de Infinito, o `{ level, stageHeight, offset }` (m del agua, de una etapa y del primer piso).
     */
    update(f) {
        const infinite = f.mode === "infinite";
        const shown = f.state !== "title";
        flag(this.root, "off", !shown);
        const live = f.state === "playing" || f.state === "roundOver";
        if (f.mode !== this.lastMode || !live) {
            this.last = [null, null];
            this.lastMode = f.mode;
        }
        if (!shown) {
            this.releaseAll();
            return;
        }

        f.players.forEach((p, k) => {
            this.updatePanel(k, p, f, infinite);
            if (live) this.detect(k, p, infinite);
        });
        this.updateScore(f);
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
            text(panel.bigValue, String(Math.floor(p.pct)));
            style(panel.big, "color", pctColor(p.pct));
            style(panel.pctFill, "width", pct(p.pct / f.maxPct));
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
        flag(panel.name, "off", !weapon);
        flag(panel.tank, "off", !weapon);
        flag(panel.none, "off", weapon !== null);
        flag(panel.empty, "off", !weapon || weapon.ratio > 0);
        if (weapon) {
            text(panel.name, weapon.name);
            style(panel.tankFill, "width", pct(weapon.ratio));
            klass(panel.tankFill, `w-${WEAPON_ICONS.includes(weapon.icon) ? weapon.icon : "agua"}`);
        }
    }

    updateScore(f) {
        const score = this.score;
        text(score.bo, `AL MEJOR DE ${f.winsNeeded * 2 - 1}`);
        text(score.rd, `RONDA ${f.round}`);
        text(score.clk, formatClock(f.roundTime));
        score.pips.forEach((pips, k) => pips.update(f.wins[k], f.winsNeeded));
        const infinite = f.mode === "infinite";
        const flooding = f.state === "playing" && f.roundTime >= f.floodStart;
        const soon = !infinite && f.state === "playing" && !flooding && f.roundTime >= f.floodStart - 10;
        flag(score.warn, "off", !flooding && !soon);
        flag(score.warn, "soon", soon);
        flag(score.warn, "flood", flooding);
        if (soon) text(score.warnText, `INUNDACIÓN EN ${Math.ceil(f.floodStart - f.roundTime)}`);
        else if (flooding) text(score.warnText, infinite ? "EL AGUA SUBE" : "¡INUNDACIÓN!");
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
            const stage = first + i;
            const y = g.offset + stage * g.stageHeight;
            const inside = y <= base + span;
            flag(tick.line, "off", !inside);
            flag(tick.label, "off", !inside);
            if (!inside) return;
            const top = pct(1 - (y - base) / span);
            style(tick.line, "top", top);
            style(tick.label, "top", top);
            text(tick.label, `E${stage}`);
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
            const over = gaugeTop(above) < 0;
            style(m.mk, "top", `${shown[i].toFixed(2)}%`);
            custom(m.mk, "--shift", (shown[i] - reals[i]).toFixed(2));
            text(m.value, `${over ? "▲ " : ""}${Math.max(0, Math.round(above))} m`);
            flag(m.mk, "danger", above < danger);
        });
    }

    updateCountdown(f) {
        const cd = this.countdown;
        const counting = f.state === "countdown";
        flag(cd.wrap, "off", !counting);
        flag(cd.ya, "off", !(f.state === "playing" && f.go));
        if (!counting) {
            this.lastNumber = null;
            return;
        }
        const n = Math.max(1, Math.ceil(f.timer));
        text(cd.label, `RONDA ${f.round}`);
        if (n !== this.lastNumber) {
            this.lastNumber = n;
            text(cd.n, String(n));
            restart(cd.n, "run");
            restart(cd.ring, "run");
        }
    }

    updateBand(f) {
        const band = this.band;
        const over = f.state === "roundOver";
        flag(band.el, "off", !over);
        band.pips.forEach((pips, k) => pips.update(f.wins[k], f.winsNeeded));
        if (!over) return;
        const w = f.roundWinner;
        flag(band.el, "p1", w === 0);
        flag(band.el, "p2", w === 1);
        text(band.k1, `RONDA ${f.round}`);
        text(band.winner, w === null ? "" : `J${w + 1}`);
        flag(band.winner, "c1", w === 0);
        flag(band.winner, "c2", w === 1);
        text(band.verdict, w === null ? "EMPATE" : " GANA LA RONDA");
        text(band.sc1, String(f.wins[0]));
        text(band.sc2, String(f.wins[1]));
        const next = Math.max(...f.wins) < f.winsNeeded ? `Ronda ${f.round + 1} en ${Math.max(1, Math.ceil(f.timer))}` : "";
        text(band.next, w === null ? (next ? `nadie suma · ${next}` : "nadie suma") : next);
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
        if (lost > 1e-6) this.damage(k, lost, previous / 100, infinite);
        else if (!infinite && lost < 0) this.headbars[k].chipRatio = Math.min(1, value / 100);
    }

    damage(k, amount, previousRatio, infinite) {
        let f = this.attached[k];
        if (f && f.active && f.since <= HUD.floater.release && f.age < HUD.floater.life) {
            f.sum += amount;
            f.since = 0;
            restart(f.n, "bump");
        } else {
            f = this.floaters.find((x) => !x.active) ?? this.floaters.reduce((a, b) => (a.age > b.age ? a : b));
            f.active = true;
            f.victim = k;
            f.sum = amount;
            f.age = 0;
            f.since = 0;
            f.shook = false;
            f.infinite = infinite;
            f.n.classList.remove("bump");
            flag(f.el, "off", false);
            flag(f.el, "pct", infinite);
            this.attached[k] = f;
        }
        const shown = Math.max(1, Math.round(f.sum));
        text(f.n, f.infinite ? `+${shown} %` : `−${shown}`);
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
            const head = f.players[fl.victim].head;
            if (this.attached[fl.victim] === fl && head) this.place(fl.el, head);
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

    place(el, head) {
        style(el, "left", `${Math.round(head.x)}px`);
        style(el, "top", `${Math.round(head.y)}px`);
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
