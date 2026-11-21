import { HELP } from "./menu.js";
import { ICONS, WEAPON_ICONS, icon, padGlyph, keyGlyph, hint, make, html, flag, restart, custom } from "./uikit.js";

/**
 * Menú principal, pantalla de controles y asignación de controles en HTML y CSS (#216, docs/design/18-interfaz.md
 * §3.1 a §3.3, estilos en `js/screens.css`). Módulo de vista: solo refleja el estado que le pasa `index.html` (`Menu.view`,
 * `HelpScreen.view`, `ControlsScreen.view`) y nunca decide ni lee dispositivos. Medidas en px de referencia sobre 1920 × 1080.
 */

/** Cuántos de 3 puntos se llenan por dificultad del bot (`id` de los valores de la fila `difficulty`). */
export const BOT_PIPS = { easy: 1, normal: 2, hard: 3 };

/** Ficha de dispositivo (px de referencia en la grilla): `x` de la columna J1, la bandeja y J2; `top` de la primera ficha y `step` entre fichas. */
export const TOKEN = { x: [180, 670, 1160], top: 220, step: 106 };

const MAP_THUMBS = {
    classic:
        '<svg viewBox="0 0 160 90"><rect width="160" height="90" fill="#10131f"/><rect y="50" width="52" height="40" fill="#4a5068"/><rect x="108" y="50" width="52" height="40" fill="#4a5068"/><rect x="52" y="62" width="56" height="28" fill="#2f6fe0"/><rect x="52" y="60" width="56" height="3" fill="#9ad6ff"/></svg>',
    infinite:
        '<svg viewBox="0 0 160 90"><rect width="160" height="90" fill="#10131f"/><rect x="12" y="62" width="50" height="6" fill="#4a5068"/><rect x="74" y="46" width="50" height="6" fill="#4a5068"/><rect x="24" y="30" width="50" height="6" fill="#4a5068"/><rect x="86" y="14" width="50" height="6" fill="#4a5068"/><rect y="78" width="160" height="12" fill="#2f6fe0"/><rect y="77" width="160" height="2" fill="#9ad6ff"/><path d="M144 34l8 10h-5v16h-6V44h-5z" fill="#40dcff"/></svg>',
};

/** Pares glifo + ícono de la barra de ayuda de cada pantalla: `pad` y `kb` son los glifos por dispositivo (`kb: null` si no aplica). */
const HINTS = {
    menu: [
        { pad: ["dpad"], kb: ["↑", "↓"], icon: "updown" },
        { pad: ["L"], kb: ["←", "→"], icon: "swap" },
        { pad: ["A"], kb: ["Enter"], icon: "ok" },
    ],
    help: [
        { pad: ["LB", "RB"], kb: ["←", "→"], icon: "swap" },
        { pad: ["B"], kb: ["Esc"], icon: "back" },
    ],
    assign: [
        { pad: ["L"], kb: ["←", "→"], icon: "swap" },
        { pad: ["A"], kb: null, icon: "plus" },
        { pad: ["start"], kb: ["Enter"], icon: "play" },
        { pad: ["B"], kb: ["Esc"], icon: "back" },
    ],
};

const hintsHtml = (pairs, device) =>
    pairs
        .map((pair) => {
            const names = device === "keyboard" ? pair.kb : pair.pad;
            if (!names) return "";
            return hint(names.map((n) => (device === "keyboard" ? keyGlyph(n) : padGlyph(n))), pair.icon);
        })
        .join("");

const botValue = (id) =>
    id === "dummy"
        ? icon("dummy", "big")
        : `<span class="pips3">${[1, 2, 3].map((n) => icon("pip", n <= BOT_PIPS[id] ? "on" : "empty")).join("")}</span>`;

const valueHtml = (row, id) => (row === "map" ? `<span class="thumb">${MAP_THUMBS[id]}</span>` : botValue(id));

const weaponHtml = (kind) => {
    if (kind === "prev") return `<span class="wp"><b>◀</b>${icon("agua")}</span>`;
    if (kind === "next") return `<span class="wp">${icon("agua")}<b>▶</b></span>`;
    return `<span class="wp">${WEAPON_ICONS.map((w) => icon(w)).join("")}</span>`;
};

function glyphHtml(name, hold = false) {
    const glyph = padGlyph(name);
    return hold ? `<span class="hold">${glyph}${icon("hold")}</span>` : glyph;
}

/** Fila de la tabla del gamepad, con el mismo formato que la del teclado: glifos a la izquierda y la acción a la derecha. */
function padRowHtml(glyphs, entry) {
    const keys = glyphs.map((g) => (g === "+" ? '<span class="plus">+</span>' : glyphHtml(g, entry.hold))).join("");
    const air = entry.air ? icon("bot", "air") : "";
    const label = entry.weapon
        ? weaponHtml(entry.weapon)
        : entry.glyph === "dpad"
          ? weaponHtml("direct")
          : `<span class="word">${entry.word}</span>`;
    return `<span class="keys">${keys}${air}</span>${label}`;
}

function keyRowHtml(row) {
    const keys = row.keys.map((k) => (k === "+" ? '<span class="plus">+</span>' : keyGlyph(k))).join("");
    const label = row.weapon ? weaponHtml(row.weapon) : `<span class="word">${row.word}</span>`;
    return `<span class="keys">${keys}</span>${label}`;
}

/** Menú principal, controles y asignación de controles: una sola capa con tres pantallas, de las que se ve a lo sumo una. */
export class Screens {
    /**
     * @param document documento donde crear los elementos (inyectado para poder probarlo sin navegador).
     * @param container elemento sobre el que se monta la capa.
     */
    constructor(document, container) {
        const doc = document;
        this.doc = doc;
        this.root = make(doc, "div", "ui screens off", container);
        this.stage = make(doc, "div", "stage", this.root);
        make(doc, "div", "", this.stage).innerHTML = ICONS;
        this.menu = this.buildMenu();
        this.help = this.buildHelp();
        this.assign = this.buildAssign();
    }

    buildMenu() {
        const doc = this.doc;
        const el = make(doc, "div", "scr menu off", this.stage);
        make(doc, "div", "veil", el);
        make(doc, "div", "logo", el, "WATERBOTS");
        const col = make(doc, "div", "mcol", el);
        const rows = {};
        const selector = (id, className, iconNames) => {
            const row = make(doc, "div", `mrow ${className}`, col);
            make(doc, "span", "ricon", row).innerHTML = iconNames.map((n) => icon(n)).join("");
            const left = make(doc, "span", "arrow l", row);
            const val = make(doc, "span", "val", row);
            const right = make(doc, "span", "arrow r", row);
            rows[id] = { el: row, left, right, val, index: null };
        };
        selector("map", "m-map", ["map"]);
        selector("difficulty", "m-bot", ["bot"]);
        const link = make(doc, "div", "mrow m-controls link", col);
        make(doc, "span", "ricon", link).innerHTML = icon("pad") + icon("kb");
        rows.controls = { el: link };
        const play = make(doc, "div", "mrow m-play play", col);
        make(doc, "span", "ricon", play).innerHTML = icon("play");
        rows.play = { el: play };
        const hints = make(doc, "div", "hintbar", el);
        return { el, rows, hints };
    }

    buildHelp() {
        const doc = this.doc;
        const el = make(doc, "div", "scr help off", this.stage);
        make(doc, "div", "veil dark", el);
        const tabs = make(doc, "div", "tabs", el);
        make(doc, "span", "tabglyph", tabs).innerHTML = padGlyph("LB");
        const tabEls = {};
        for (const id of HELP.tabs) {
            const tab = make(doc, "span", "seg", tabs);
            tab.innerHTML = icon(id === "pad" ? "pad" : "kb");
            tabEls[id] = tab;
        }
        make(doc, "span", "tabglyph", tabs).innerHTML = padGlyph("RB");
        const ref = make(doc, "div", "refbox", el);
        const pad = make(doc, "div", "kbbody padbody off", ref);
        const padCard = make(doc, "div", "kcard", pad);
        for (const entry of [...HELP.pad.left, ...HELP.pad.right]) {
            make(doc, "div", "krow", padCard).innerHTML = padRowHtml([entry.glyph], entry);
        }
        for (const combo of HELP.pad.combos) make(doc, "div", "krow", padCard).innerHTML = padRowHtml(combo.glyphs, combo);
        const kb = make(doc, "div", "kbbody off", ref);
        const card = make(doc, "div", "kcard", kb);
        make(doc, "span", "badge p1", card, "J1");
        for (const row of HELP.keyboard.rows) make(doc, "div", "krow", card).innerHTML = keyRowHtml(row);
        const hints = make(doc, "div", "hintbar", el);
        return { el, tabs: tabEls, bodies: { pad, keyboard: kb }, hints };
    }

    buildAssign() {
        const doc = this.doc;
        const el = make(doc, "div", "scr assign off", this.stage);
        make(doc, "div", "veil dark", el);
        const recall = make(doc, "div", "recall", el);
        const thumb = make(doc, "span", "thumb", recall);
        make(doc, "span", "rbot", recall).innerHTML = icon("bot");
        const botVal = make(doc, "span", "rval", recall);
        const ref = make(doc, "div", "refbox", el);
        const grid = make(doc, "div", "agrid", ref);
        const columns = [];
        for (const k of [0, 1]) {
            const col = make(doc, "div", `pcol p${k + 1}`, grid);
            make(doc, "span", "ghost", col).innerHTML = icon("bot");
            const head = make(doc, "div", "phead", col);
            make(doc, "span", `badge p${k + 1}`, head, `J${k + 1}`);
            columns.push({ el: col, status: make(doc, "span", "status", head) });
            if (k === 0) make(doc, "div", "tray", grid);
        }
        const hints = make(doc, "div", "hintbar", el);
        return { el, thumb, botVal, grid, columns, tokens: new Map(), hints, lastMap: null };
    }

    /**
     * Actualiza la capa con el estado de este frame:
     * - `screen`: "menu", "help", "assign" o `null` (fuera del título: toda la capa con `display: none`);
     * - `device`: "pad" o "keyboard", los glifos que se muestran (el último dispositivo usado en la pantalla);
     * - `menu`: `Menu.view`, `choice`: `Menu.choice`, `helpView`: `HelpScreen.view` y `assignView`: `ControlsScreen.view`.
     */
    update({ screen, device, menu, choice, helpView, assignView }) {
        flag(this.root, "off", screen === null);
        flag(this.menu.el, "off", screen !== "menu");
        flag(this.help.el, "off", screen !== "help");
        flag(this.assign.el, "off", screen !== "assign");
        if (screen === "menu") this.updateMenu(menu, device);
        else if (screen === "help") this.updateHelp(helpView, device);
        else if (screen === "assign") this.updateAssign(assignView, choice, device);
    }

    updateMenu(rows, device) {
        for (const row of rows) {
            const r = this.menu.rows[row.id];
            flag(r.el, "focus", row.selected);
            if (row.values.length === 0) continue;
            const index = row.values.findIndex((v) => v.chosen);
            const chosen = row.values[index];
            html(r.val, valueHtml(row.id, chosen.id));
            flag(r.val, "dim", chosen.disabled);
            flag(r.left, "dim", !row.values.slice(0, index).some((v) => !v.disabled));
            flag(r.right, "dim", !row.values.slice(index + 1).some((v) => !v.disabled));
            if (r.index !== null && r.index !== index) {
                r.val.classList.remove(index > r.index ? "sl-l" : "sl-r");
                restart(r.val, index > r.index ? "sl-r" : "sl-l");
            }
            r.index = index;
        }
        html(this.menu.hints, hintsHtml(HINTS.menu, device));
    }

    updateHelp(view, device) {
        for (const tab of view.tabs) flag(this.help.tabs[tab.id], "on", tab.selected);
        for (const id of HELP.tabs) flag(this.help.bodies[id], "off", id !== view.tab);
        html(this.help.hints, hintsHtml(HINTS.help, device));
    }

    updateAssign(view, choice, device) {
        const a = this.assign;
        if (a.lastMap !== choice.map) {
            a.lastMap = choice.map;
            html(a.thumb, MAP_THUMBS[choice.map]);
        }
        html(a.botVal, botValue(choice.difficulty));
        const used = [0, 0, 0];
        const seen = new Set();
        view.devices.forEach((d) => {
            seen.add(d.id);
            const token = a.tokens.get(d.id) ?? this.buildToken(d);
            const row = used[d.column]++;
            custom(token.el, "--x", String(TOKEN.x[d.column]));
            custom(token.el, "--y", String(TOKEN.top + row * TOKEN.step));
            flag(token.el, "joined", d.joined);
            flag(token.el, "tray", d.column === 1);
            flag(token.el, "p1", d.joined && d.column === 0);
            flag(token.el, "p2", d.joined && d.column === 2);
            flag(token.left, "dim", d.column === 0);
            flag(token.right, "dim", d.column === 2 || (d.kind === "keyboard" && d.column === 1));
            flag(token.invite, "off", d.joined);
        });
        for (const [id, token] of a.tokens) {
            if (seen.has(id)) continue;
            token.el.remove();
            a.tokens.delete(id);
        }
        a.columns.forEach((column, k) => {
            const bot = view.bots.includes(k);
            const joined = view.devices.some((d) => d.joined && d.column === k * 2);
            flag(column.el, "bot", bot);
            html(column.status, bot ? icon("bot") + botValue(choice.difficulty) : joined ? icon("ok", "okay") : "");
        });
        html(a.hints, hintsHtml(HINTS.assign, device));
    }

    buildToken(d) {
        const doc = this.doc;
        const el = make(doc, "div", `tok ${d.kind}`, this.assign.grid);
        const left = make(doc, "span", "tarrow l", el);
        const body = make(doc, "span", "tbody", el);
        body.innerHTML = d.kind === "keyboard" ? icon("kb") : `${icon("pad")}<b>${d.number}</b>`;
        const right = make(doc, "span", "tarrow r", el);
        const invite = make(doc, "span", "invite", el);
        invite.innerHTML = padGlyph("A") + icon("plus");
        const token = { el, left, right, invite };
        this.assign.tokens.set(d.id, token);
        return token;
    }
}
