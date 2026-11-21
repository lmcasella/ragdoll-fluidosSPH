/**
 * Piezas comunes de la interfaz HTML (docs/design/18-interfaz.md): el sprite de íconos, los glifos de botones y las
 * funciones que escriben en el DOM solo lo que cambió. Módulo hoja: lo usan `js/hud.js` (partida) y `js/screens.js`
 * (menús). Los estilos están en `js/ui.css`.
 */

/** Armas en el orden de la cruceta: arriba, derecha, abajo, izquierda (el de la posición en `WEAPONS`). */
export const WEAPON_ICONS = ["agua", "acido", "lava", "miel"];

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';

/** Sprite SVG con todos los íconos de 24 × 24: los de armas rellenos y el resto con trazo de 2,5 redondeado. */
export const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-agua" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5C9 7 5.5 10.6 5.5 14.6a6.5 6.5 0 0 0 13 0C18.5 10.6 15 7 12 2.5z"/></symbol>
<symbol id="i-acido" viewBox="0 0 24 24"><path fill="currentColor" d="M10 3.5C7.6 7.2 4.8 10.1 4.8 13.4a5.2 5.2 0 0 0 10.4 0C15.2 10.1 12.4 7.2 10 3.5z"/><circle cx="18.5" cy="6.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="19" cy="13" r="1.5" fill="currentColor"/><circle cx="16" cy="19.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>
<symbol id="i-lava" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c1.2 3.6 5.8 6 5.8 11.2A5.8 5.8 0 0 1 6.2 13.2c0-2.3 1-3.8 2.4-5.2.2 2 1 3.2 2.3 3.6C10.4 8 11 4.8 12 2z"/></symbol>
<symbol id="i-miel" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5l7.5 4.3v8.6L15 18v3.5a1.5 1.5 0 0 1-3 0V19.7l-7.5-4.3V6.8z"/></symbol>
<symbol id="i-puno" viewBox="0 0 24 24"><path fill="currentColor" d="M6 9.5a2 2 0 0 1 2-2h8.5a2.5 2.5 0 0 1 2.5 2.5v4.5a6 6 0 0 1-6 6h-2A5 5 0 0 1 6 15.5zM8 5.5a1.5 1.5 0 0 1 3 0V7H8zm3.5-.5a1.5 1.5 0 0 1 3 0v2h-3zm3.5.5a1.5 1.5 0 0 1 3 0V7h-3z"/></symbol>
<symbol id="i-wave" viewBox="0 0 24 24"><path fill="currentColor" d="M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2v3c-2.5 0-2.5-2-5-2s-2.5 2-5 2-2.5-2-5-2-2.5 2-5 2zM12 3l4 5h-2.5v3h-3V8H8z"/></symbol>
<symbol id="i-up" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4l7 8h-4.5v8h-5v-8H5z"/></symbol>
<symbol id="i-map" viewBox="0 0 24 24"><path ${STROKE} d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20"/></symbol>
<symbol id="i-bot" viewBox="0 0 24 24"><path ${STROKE} d="M12 8V4.5M6.5 8h11a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-8A1.5 1.5 0 0 1 6.5 8z"/><circle cx="12" cy="3.5" r="1.4" fill="currentColor"/><circle cx="9.3" cy="13" r="1.3" fill="currentColor"/><circle cx="14.7" cy="13" r="1.3" fill="currentColor"/></symbol>
<symbol id="i-dummy" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.6" ${STROKE}/><path ${STROKE} d="M6 10h12M8 10l1 6h6l1-6M12 16v5M8 21h8"/></symbol>
<symbol id="i-pip" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/></symbol>
<symbol id="i-pad" viewBox="0 0 24 24"><path ${STROKE} d="M7 8h10a4 4 0 0 1 4 4.3l-.8 4.2a2 2 0 0 1-3.4 1L15 16H9l-1.8 1.5a2 2 0 0 1-3.4-1L3 12.3A4 4 0 0 1 7 8zM8 10.5v3M6.5 12h3"/><circle cx="16" cy="11" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/></symbol>
<symbol id="i-kb" viewBox="0 0 24 24"><path ${STROKE} d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></symbol>
<symbol id="i-play" viewBox="0 0 24 24"><path fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M7 4.5l13 7.5-13 7.5z"/></symbol>
<symbol id="i-back" viewBox="0 0 24 24"><path ${STROKE} d="M9 6L4 11l5 5M4 11h10a6 6 0 0 1 6 6v1"/></symbol>
<symbol id="i-ok" viewBox="0 0 24 24"><path ${STROKE} d="M4.5 12.5l5 5 10-11"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path ${STROKE} d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-swap" viewBox="0 0 24 24"><path ${STROKE} d="M8 6l-5 6 5 6M16 6l5 6-5 6"/></symbol>
<symbol id="i-updown" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3l-5.5 6.5h11zM12 21l-5.5-6.5h11z"/></symbol>
<symbol id="i-retry" viewBox="0 0 24 24"><path ${STROKE} d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24"><path ${STROKE} d="M3 11l9-8 9 8M5.5 9.5V20h13V9.5M10 20v-6h4v6"/></symbol>
<symbol id="i-crown" viewBox="0 0 24 24"><path fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></symbol>
<symbol id="i-hold" viewBox="0 0 24 24"><path ${STROKE} d="M3.6 10A9 9 0 0 1 20.4 10M12 2.5V4"/></symbol>
<symbol id="i-bolt" viewBox="0 0 24 24"><path fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M13 2L4 14h7l-1 8 9-12h-7z"/></symbol>
<symbol id="i-tank" viewBox="0 0 24 24"><path ${STROKE} d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path fill="currentColor" d="M6 12h12v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/></symbol>
</defs></svg>`;

/** SVG de un ícono del sprite (`i-<name>`), con `extra` clases opcionales. */
export const icon = (name, extra = "") => `<svg class="ic ic-${name}${extra ? ` ${extra}` : ""}"><use href="#i-${name}"/></svg>`;

const FACE = new Set(["A", "B", "X", "Y"]);
const BUMPER = new Set(["LB", "RB"]);
const TRIGGER = new Set(["LT", "RT"]);

/**
 * Glifo de un botón del gamepad, estilo Xbox (§1): `A B X Y` círculos del color del botón, `LB RB` y `LT RT`
 * rectángulos, `L R` y `L↓` sticks, `dpad` la cruceta y `start` la píldora con ≡.
 */
export function padGlyph(name) {
    if (FACE.has(name)) return `<span class="g g-face g-${name.toLowerCase()}">${name}</span>`;
    if (BUMPER.has(name)) return `<span class="g g-bumper">${name}</span>`;
    if (TRIGGER.has(name)) return `<span class="g g-trigger">${name}</span>`;
    if (name === "dpad") return '<span class="g g-dpad"><i></i><i></i></span>';
    if (name === "start") return '<span class="g g-start">≡</span>';
    return `<span class="g g-stick">${name}</span>`;
}

/** Tecla del teclado; el texto con "clic" o "mouse" es un botón del mouse (píldora). */
export function keyGlyph(label) {
    const mouse = /^(clic|mouse)/.test(label);
    return `<span class="k${mouse ? " mouse" : ""}">${label}</span>`;
}

/** Par glifo + ícono de la barra de ayuda (`.hint`): `glyphs` ya son HTML. */
export const hint = (glyphs, iconName) => `<span class="hint">${glyphs.join("")}${icon(iconName)}</span>`;

/** Crea un elemento `tag` con `className`, lo agrega a `parent` y le pone `content` como texto si se da. */
export function make(doc, tag, className, parent, content) {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    if (parent) parent.appendChild(el);
    return el;
}

/** Escribe `textContent` solo si cambió. */
export function text(node, value) {
    if (node.$text !== value) {
        node.$text = value;
        node.textContent = value;
    }
}

/** Escribe `innerHTML` solo si cambió. */
export function html(node, value) {
    if (node.$html !== value) {
        node.$html = value;
        node.innerHTML = value;
    }
}

/** Escribe una propiedad de `style` solo si cambió. */
export function style(node, prop, value) {
    const cache = (node.$style ??= {});
    if (cache[prop] !== value) {
        cache[prop] = value;
        node.style[prop] = value;
    }
}

/** Escribe una variable CSS solo si cambió. */
export function custom(node, prop, value) {
    const cache = (node.$style ??= {});
    if (cache[prop] !== value) {
        cache[prop] = value;
        node.style.setProperty(prop, value);
    }
}

/** Escribe `className` solo si cambió. */
export function klass(node, value) {
    if (node.$class !== value) {
        node.$class = value;
        node.className = value;
    }
}

/** Pone o saca la clase `name` solo si cambió. */
export function flag(node, name, on) {
    const cache = (node.$flags ??= {});
    if (cache[name] !== on) {
        cache[name] = on;
        node.classList.toggle(name, on);
    }
}

/** Reinicia la animación CSS de `name` en `node` (quita la clase, fuerza el recálculo y la vuelve a poner). */
export function restart(node, name) {
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
}

/** Porcentaje CSS de una razón, acotada a 0..1. */
export const pct = (ratio) => `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(1)}%`;
