// Dibujo en coordenadas del mundo (metros, Y hacia arriba): el contexto ya tiene aplicada la cámara.
// Los grosores se dividen por la escala para mantenerlos en píxeles de pantalla.
import { MATERIALS } from "./materials.js";

const FLASH_COLOR = [255, 40, 40];
const WET_COLOR = [40, 220, 255];
const WET_BLINK_HZ = 4;
// Chispas del cortocircuito: se repiten por tick de reloj, no por frame, para que se vean como destellos
const SPARK_TICK_HZ = 12;
const SPARKS_PER_FRAME = 3;
const SPARK_SEGMENTS = 3;
const SPARK_SEGMENT_LENGTH = 0.3; // m; con 0,12 m quedaban dentro del cuerpo y no se veían al zoom de juego
const SPARK_COLORS = ["#fff27a", "#e8ffff"];
/** Radio dibujado de las gotas: `√(A_p / π)` con `A_p = (1,5 · 0,06 m)²` el área física de una partícula (0,0508 m), para que el área dibujada sea la física (I3). */
export const PARTICLE_RADIUS = (1.5 * 0.06) / Math.sqrt(Math.PI);
const PARTICLE_AREA = Math.PI * PARTICLE_RADIUS ** 2;

/**
 * Desenfoque del filtro goo, en m (se pasa a píxeles con el zoom). El umbral del filtro (alfa · 20 − 10) solo deja
 * ver lo que supera alfa 0,5, y un círculo aislado de radio r desenfocado con σ llega en el centro a
 * `1 − exp(−r² / 2σ²)`: con σ = 0,07 m una gota de 0,05 m quedaba en 0,22 y desaparecía. Con 0,03 m llega a 0,75.
 */
export const GOO_BLUR = 0.03;

/**
 * Alfa en el centro de un círculo aislado de radio `radius` después del desenfoque gaussiano de `sigma` (misma unidad).
 * @param {number} radius
 * @param {number} sigma
 */
export function gooPeakAlpha(radius, sigma) {
    return 1 - Math.exp(-(radius * radius) / (2 * sigma * sigma));
}

/**
 * Dibujo de las gotas de disparo y de lluvia: un solo círculo por partícula, de área física `area` = A_p en m²,
 * igual para toda partícula de un material (sin trazos: la velocidad y el origen no cambian el dibujo).
 * `snapReach` y `snapFullReach` (m) acercan el círculo de las partículas junto a un cuerpo a su superficie: la fila de contacto física queda a
 * 0,192 m. `kinds` se indexa por `store.kind` (ids de `FLUID` en `js/weapons.js`: 1 ácido, 2 lava, 3 miel, 4 agua, 5 piedra, con el k de la lava) y
 * dice, por material, `radiusScale` (k que multiplica a `√(A_p/π)`, con tope `maxRadius` en m). Los k se midieron con el fluido en reposo (|v| < 1 m/s) en la
 * escena estándar de `tests/helpers/invariants-run.js` (60 s, un muestreo cada 20 pasos): el k que hace que la
 * unión de círculos (con `skinPosition`) mida N · A_p, por bisección; resultado ponderado por N: agua 1,040
 * (109 muestras), miel 1,069 (111), lava 1,045 (12); con la viscosidad de la lava (#75) la pila de lava ya no se
 * comprime y el k de lava y piedra sube a 1,06 (con 1,045, 6 de 2.458 pasos de I3p pasan de ±15 %). El ácido nunca queda en reposo en esa escena (se absorbe o
 * cae al campo) y usa el k del agua, que tiene sus mismos flags y separación SPH.
 */
export const SHOT_DRAW = {
    radius: PARTICLE_RADIUS,
    area: PARTICLE_AREA,
    maxRadius: 0.14,
    snapReach: 0.15,
    snapFullReach: 0.11,
    kinds: {
        1: { radiusScale: 1.04 },
        2: { radiusScale: 1.06 },
        3: { radiusScale: 1.069 },
        4: { radiusScale: 1.04 },
        5: { radiusScale: 1.06 },
    },
};
const DEFAULT_KIND = { radiusScale: 1 };
// m que el agua acercada se mete bajo la superficie del cuerpo para que no quede una línea de fondo entre los dos
const SKIN_OVERLAP = 0.02;

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(base, k, wet = 0) {
    let r = base[0] + (FLASH_COLOR[0] - base[0]) * k;
    let g = base[1] + (FLASH_COLOR[1] - base[1]) * k;
    let b = base[2] + (FLASH_COLOR[2] - base[2]) * k;
    r += (WET_COLOR[0] - r) * wet;
    g += (WET_COLOR[1] - g) * wet;
    b += (WET_COLOR[2] - b) * wet;
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Radio del ícono de un arma recogible, en metros (el sensor mide 0,5 m). */
const PICKUP_ICON_RADIUS = 0.4;

export function drawLevel(ctx, level, scale) {
    ctx.fillStyle = "#2b2b38";
    ctx.strokeStyle = "#555566";
    ctx.lineWidth = 2 / scale;
    for (const s of level.solids) {
        ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
        ctx.strokeRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    }
}

/** Tuerca del ítem de reparación (#156): lados del hexágono, radio del agujero relativo al del ícono y colores `[r, g, b]`. */
export const NUT = { sides: 6, hole: 0.4, fill: [190, 200, 210], edge: [80, 220, 120] };

/**
 * Dibuja la tuerca hexagonal centrada en (x, y), del mismo tamaño que el ícono de las armas. El agujero circular se
 * recorta del canvas con `destination-out`; el hexágono usa solo `lineTo` porque las pruebas cuentan los `moveTo` de
 * este canvas como trazos de la mira láser.
 */
function drawNut(ctx, x, y) {
    ctx.beginPath();
    for (let i = 0; i < NUT.sides; i++) {
        const a = (Math.PI * 2 * i) / NUT.sides;
        ctx.lineTo(x + Math.cos(a) * PICKUP_ICON_RADIUS, y + Math.sin(a) * PICKUP_ICON_RADIUS);
    }
    ctx.closePath();
    ctx.fillStyle = `rgb(${NUT.fill.join(", ")})`;
    ctx.fill();
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = `rgb(${NUT.edge.join(", ")})`;
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, PICKUP_ICON_RADIUS * NUT.hole, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/**
 * Ícono placeholder de cada punto de aparición: círculo del color del arma con su inicial, o tuerca hexagonal para
 * el ítem de reparación. Los puntos inactivos (esperando reaparecer) no se dibujan. Va en un canvas propio, por
 * encima de los fluidos.
 */
export function drawPickups(ctx, points, weapons) {
    for (const point of points) {
        if (!point.active) continue;
        if (point.kind === "repair") {
            drawNut(ctx, point.x, point.y);
            continue;
        }
        const weapon = weapons.find((w) => w.id === point.weapon);
        if (!weapon) continue;
        const [r, g, b] = weapon.color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, PICKUP_ICON_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
        ctx.lineWidth = 0.06;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.scale(1, -1);
        ctx.font = "bold 0.5px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#101018";
        ctx.fillText(weapon.name[0], 0, 0);
        ctx.restore();
    }
}

/** Radios de la rueda de armas en metros, alrededor del torso: borde interno, externo y externo del sector apuntado. */
export const WHEEL_RADII = { inner: 0.45, outer: 1.6, selected: 1.75 };

/**
 * Rueda de armas centrada en (cx, cy), en metros. `entries` son los sectores en orden, el primero centrado
 * arriba y los demás en sentido horario: { name, color, fill (0 a 1, tanque), equipped }. `selected` es el índice apuntado (-1 ninguno), más
 * opaco y más grande; el arma equipada lleva borde blanco. Va en el canvas que queda encima de los fluidos.
 */
export function drawWeaponWheel(ctx, cx, cy, entries, selected) {
    const count = entries.length;
    const step = (Math.PI * 2) / count;
    entries.forEach((entry, i) => {
        const [r, g, b] = entry.color;
        const outer = i === selected ? WHEEL_RADII.selected : WHEEL_RADII.outer;
        const from = Math.PI / 2 - (i + 0.5) * step;
        const to = Math.PI / 2 - (i - 0.5) * step;
        ctx.beginPath();
        ctx.arc(cx, cy, outer, from, to);
        ctx.arc(cx, cy, WHEEL_RADII.inner, to, from, true);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${i === selected ? 0.95 : 0.6})`;
        ctx.fill();
        ctx.lineWidth = entry.equipped ? 0.08 : 0.03;
        ctx.strokeStyle = entry.equipped ? "#ffffff" : "rgba(16, 16, 24, 0.8)";
        ctx.stroke();

        const mid = (from + to) / 2;
        const labelRadius = (WHEEL_RADII.inner + WHEEL_RADII.outer) / 2;
        const lx = cx + Math.cos(mid) * labelRadius;
        const ly = cy + Math.sin(mid) * labelRadius;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.scale(1, -1);
        ctx.font = "bold 0.5px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#101018";
        ctx.fillText(entry.name[0], 0, 0);
        ctx.restore();

        const barWidth = 0.6;
        const barHeight = 0.06;
        const barY = ly - 0.3;
        ctx.fillStyle = "rgba(16, 16, 24, 0.6)";
        ctx.fillRect(lx - barWidth / 2, barY, barWidth, barHeight);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(lx - barWidth / 2, barY, barWidth * Math.max(0, Math.min(1, entry.fill)), barHeight);
    });
}

// Piezas de render de un robot (en metros) a partir de su .rag.json; con flipX se espejan en el marco del cuerpo
export function buildRenderItems(rag, json, flipX) {
    const mirror = flipX ? -1 : 1;
    const items = [];
    for (const b of json.bodies) {
        const body = rag.bodies.get(b.id);
        for (const f of b.fixtures) {
            const s = f.shape;
            const item = {
                body,
                bodyId: b.id,
                type: s.type,
                cx: (s.center?.[0] ?? 0) * mirror,
                cy: s.center?.[1] ?? 0,
                angle: (s.angle ?? 0) * mirror,
            };
            if (s.type === "box") {
                item.hw = s.width / 2;
                item.hh = s.height / 2;
            } else if (s.type === "circle") {
                item.radius = s.radius;
            } else if (s.type === "polygon") {
                item.vertices = s.vertices.map(([vx, vy]) => [vx * mirror, vy]);
            }
            items.push(item);
        }
    }
    return items;
}

// Hash entero a [0, 1): da piezas y ángulos repetibles sin Math.random
function hash01(n) {
    n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
    n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

function drawSparks(ctx, player, scale, now) {
    const items = player.renderItems;
    if (items.length === 0) return;
    const tick = Math.floor(now * SPARK_TICK_HZ);
    ctx.lineWidth = 3 / scale;
    for (let s = 0; s < SPARKS_PER_FRAME; s++) {
        const seed = tick * 97 + s * 13;
        const pos = items[Math.floor(hash01(seed) * items.length)].body.GetPosition();
        let x = pos.get_x();
        let y = pos.get_y();
        let angle = hash01(seed + 1) * Math.PI * 2;
        ctx.strokeStyle = SPARK_COLORS[s % SPARK_COLORS.length];
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let seg = 0; seg < SPARK_SEGMENTS; seg++) {
            angle += (hash01(seed + 2 + seg) - 0.5) * 2.4;
            x += Math.cos(angle) * SPARK_SEGMENT_LENGTH;
            y += Math.sin(angle) * SPARK_SEGMENT_LENGTH;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
}
export function drawRobot(ctx, player, color, scale, now) {
    const base = hexToRgb(color);
    // Mojado: tinte cian que parpadea
    const wet = player.wet && !player.dead ? 0.35 + 0.35 * Math.sin(now * WET_BLINK_HZ * Math.PI * 2) : 0;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 / scale;
    for (const item of player.renderItems) {
        const pos = item.body.GetPosition();
        const x = pos.get_x();
        const y = pos.get_y();
        const angle = item.body.GetAngle();

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.translate(item.cx, item.cy);
        ctx.rotate(item.angle);
        ctx.fillStyle = mix(base, player.flashAmount(item.bodyId, now), wet);
        ctx.beginPath();
        if (item.type === "box") {
            ctx.rect(-item.hw, -item.hh, item.hw * 2, item.hh * 2);
        } else if (item.type === "circle") {
            ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        } else if (item.type === "polygon") {
            item.vertices.forEach(([vx, vy], k) => (k === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy)));
            ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    if (player.wet && !player.dead) drawSparks(ctx, player, scale, now);
}

// Mira láser: desde la boca del arma hasta el primer impacto (o el alcance máximo)
export function drawAimLaser(ctx, laser, color, scale) {
    if (!laser) return;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (laser.hit) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(laser.x2, laser.y2, 4 / scale, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Feedback de golpes melee, en metros y segundos. `hit`: un círculo blanco que se agranda (de `radius` a
 * `radius + grow`) y se apaga en `time`. `block`: `rays` líneas radiales que salen del contacto, de `from` a `to`,
 * en blanco azulado. `blockBreak`: lo mismo, más grande y en naranja.
 */
export const HIT_FX = {
    hit: { time: 0.2, radius: 0.15, grow: 0.4, color: "#ffffff", width: 3 },
    block: { time: 0.25, rays: 6, from: 0.15, to: 0.45, color: "#bfe0ff", width: 2.5 },
    blockBreak: { time: 0.35, rays: 8, from: 0.15, to: 0.8, color: "#ff8a1f", width: 3 },
};

/**
 * Dibuja los eventos `{ x, y, time, kind }` de `Melee.hits` y descarta los vencidos.
 * @param {CanvasRenderingContext2D} ctx Contexto con la cámara aplicada.
 * @param {object[]} hits Eventos; `kind` es `"hit"`, `"block"` o `"blockBreak"`.
 * @param {number} scale Píxeles por metro.
 * @param {number} now Reloj de simulación, s.
 */
export function drawHits(ctx, hits, scale, now) {
    for (let i = hits.length - 1; i >= 0; i--) {
        const fx = HIT_FX[hits[i].kind] ?? HIT_FX.hit;
        const k = (now - hits[i].time) / fx.time;
        if (k >= 1) {
            hits.splice(i, 1);
            continue;
        }
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = fx.width / scale;
        ctx.beginPath();
        if (fx.rays) {
            const from = fx.from;
            const to = fx.from + (fx.to - fx.from) * k;
            for (let r = 0; r < fx.rays; r++) {
                const angle = (r / fx.rays) * Math.PI * 2;
                ctx.moveTo(hits[i].x + Math.cos(angle) * from, hits[i].y + Math.sin(angle) * from);
                ctx.lineTo(hits[i].x + Math.cos(angle) * to, hits[i].y + Math.sin(angle) * to);
            }
        } else {
            ctx.arc(hits[i].x, hits[i].y, fx.radius + k * fx.grow, 0, Math.PI * 2);
        }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}
const MENU_LAYOUT = { rowHeight: 38, labelX: -300, valueX: -110, valueWidth: 200, top: 100 };

/**
 * Dibuja las filas del menú principal debajo del cartel del título, en píxeles de pantalla. `rows` es `Menu.view`:
 * la fila elegida va resaltada, el valor elegido entre corchetes, los deshabilitados atenuados con su nota y las filas
 * sin efecto (dificultad sin bots) apagadas.
 */
export function drawMenu(ctx, width, height, rows) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = "left";
    ctx.font = "24px Segoe UI";
    rows.forEach((row, i) => {
        const y = height / 2 + MENU_LAYOUT.top + i * MENU_LAYOUT.rowHeight;
        const x = width / 2;
        ctx.fillStyle = !row.enabled ? "#555555" : row.selected ? "#ffd84a" : "#dddddd";
        ctx.fillText(`${row.selected ? "▶ " : ""}${row.label}`, x + MENU_LAYOUT.labelX, y);
        row.values.forEach((v, j) => {
            ctx.fillStyle = !row.enabled || v.disabled ? "#555555" : v.chosen ? (row.selected ? "#ffd84a" : "#ffffff") : "#aaaaaa";
            const text = `${v.chosen ? "[" : ""}${v.label}${v.chosen ? "]" : ""}${v.note ? ` (${v.note})` : ""}`;
            ctx.fillText(text, x + MENU_LAYOUT.valueX + j * MENU_LAYOUT.valueWidth, y);
        });
    });
    drawControlsHelp(ctx, width, height, rows.length);
}

/** Líneas de ayuda de controles del menú principal (#163): ya no se muestran durante la partida. */
export const CONTROLS_HELP = [
    "Armas: 1 Agua · 2 Ácido · 3 Lava · 4 Miel · se recogen en el mapa",
    "Gamepad: stick izq. mover · arriba saltar · stick der. apuntar · A/RT disparar (mantener) · X golpe · LB/RB arma",
    "Teclado J1: A/D · W · Espacio · F golpe · 1-4 · mouse apunta, clic mantenido dispara",
    "Teclado J2: ←/→ · ↑ · Enter · Num 5 golpe · Num − bloqueo · Num 1-4",
    "Caer a la pileta = robot destruido · Al mejor de 3 rondas",
];

/** Dibuja `CONTROLS_HELP` centrado, debajo de las `rowCount` filas del menú. */
export function drawControlsHelp(ctx, width, height, rowCount) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = "center";
    ctx.font = "14px Segoe UI";
    ctx.fillStyle = "#aaaaaa";
    const y0 = height / 2 + MENU_LAYOUT.top + rowCount * MENU_LAYOUT.rowHeight + 6;
    CONTROLS_HELP.forEach((line, i) => ctx.fillText(line, width / 2, y0 + i * 20));
    ctx.textAlign = "left";
}

/**
 * Cartel chico del premio por etapa (#25), arriba y centrado en píxeles de pantalla, sin fondo para no tapar el juego.
 * `alpha` ∈ [0, 1] lo desvanece al final.
 */
export function drawStageBanner(ctx, width, text, alpha = 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = "center";
    ctx.font = "bold 20px Segoe UI";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffd84a";
    ctx.fillText(text, width / 2, 124);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
}

const TANK_BAR = { width: 180, height: 10 };

// HUD en pantalla (sin cámara): vida, arma, tanque y rondas ganadas por jugador; cartel central entre rondas.
// `weapons` es la tabla de armas (id, name, color, tank).
export function drawHud(ctx, width, height, players, match, colors, weapons, floodStart = Infinity) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = "bold 24px Segoe UI";
    ctx.textBaseline = "alphabetic";
    players.forEach((player, k) => {
        const left = k === 0;
        const x = left ? 20 : width - 20;
        ctx.textAlign = left ? "left" : "right";
        ctx.fillStyle = player.hp > 30 ? "#55ff55" : "#ff5555";
        const weapon = weapons.find((w) => w.id === player.weapon);
        ctx.fillText(`J${k + 1} Salud: ${Math.ceil(player.hp)}%${weapon ? ` · ${weapon.name}` : ""}`, x, height - 30);

        if (weapon) {
            const left0 = left ? x : x - TANK_BAR.width;
            const top = height - 22;
            const ratio = Math.max(0, Math.min(1, (player.tanks.get(weapon.id) ?? 0) / weapon.tank));
            ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
            ctx.fillRect(left0, top, TANK_BAR.width, TANK_BAR.height);
            ctx.fillStyle = `rgb(${weapon.color.join(", ")})`;
            ctx.fillRect(left0, top, TANK_BAR.width * ratio, TANK_BAR.height);
            if (ratio === 0) {
                ctx.fillStyle = "#ff5555";
                ctx.font = "bold 12px Segoe UI";
                ctx.textAlign = "left";
                ctx.fillText("VACÍO", left0 + 4, top + TANK_BAR.height - 1);
                ctx.font = "bold 24px Segoe UI";
                ctx.textAlign = left ? "left" : "right";
            }
        }
        for (let w = 0; w < match.winsNeeded; w++) {
            const cx = left ? x + 10 + w * 26 : x - 10 - w * 26;
            ctx.beginPath();
            ctx.arc(cx, height - 70, 9, 0, Math.PI * 2);
            ctx.fillStyle = w < match.wins[k] ? colors[k] : "rgba(255, 255, 255, 0.15)";
            ctx.fill();
        }
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "#cccccc";
    ctx.font = "bold 18px Segoe UI";
    if (match.state !== "title") {
        ctx.fillText(`Ronda ${match.round}`, width / 2, 36);
        const seconds = Math.floor(match.roundTime);
        ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, width / 2, 60);
    }
    if (match.state === "playing" && match.roundTime >= floodStart - 10) {
        const flooding = match.roundTime >= floodStart;
        ctx.fillStyle = flooding ? "#40dcff" : "#ffcc44";
        ctx.font = "bold 22px Segoe UI";
        ctx.fillText(
            flooding ? "¡INUNDACIÓN!" : `Inundación en ${Math.ceil(floodStart - match.roundTime)}`,
            width / 2,
            88,
        );
    }

    const banner = match.banner;
    if (banner) {
        ctx.fillStyle = "rgba(10, 10, 16, 0.7)";
        ctx.fillRect(0, height / 2 - 70, width, 130);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 48px Segoe UI";
        ctx.fillText(banner.title, width / 2, height / 2);
        ctx.font = "20px Segoe UI";
        ctx.fillStyle = "#cccccc";
        ctx.fillText(banner.subtitle, width / 2, height / 2 + 40);
    }
    ctx.textAlign = "left";
}

// Superficies sólidas en metros del mundo (cajas y círculos con su pose), para acercar el agua dibujada a los cuerpos.
// Se rearma en cada frame con `collectSurfaces` (con el alcance del acercamiento: arma la grilla); los objetos se reutilizan.
const surfacePool = [];
let surfaceCount = 0;

function addSurface(kind, x, y, angle, hw, hh, radius) {
    const s = (surfacePool[surfaceCount] ??= {});
    s.kind = kind; // 0 caja, 1 círculo
    s.x = x;
    s.y = y;
    s.cos = Math.cos(angle);
    s.sin = Math.sin(angle);
    s.hw = hw;
    s.hh = hh;
    s.radius = radius;
    // Mitad de la caja que encierra la pieza, para anotarla en la grilla
    s.ex = kind === 0 ? Math.abs(s.cos) * hw + Math.abs(s.sin) * hh : radius;
    s.ey = kind === 0 ? Math.abs(s.sin) * hw + Math.abs(s.cos) * hh : radius;
    surfaceCount++;
}

// Grilla de 1 m sobre el nivel (con margen): cada celda lista las superficies a menos de `reach` de ella, así cada
// partícula prueba solo las de su celda en vez de todas. Lo de afuera de la grilla cae en la celda del borde.
const CELL = 1;
const GRID_X0 = -2;
const GRID_Y0 = -2;
const GRID_W = 64;
const GRID_H = 40;
const grid = Array.from({ length: GRID_W * GRID_H }, () => []);
let gridUsed = [];

function cellIndex(v, origin, size) {
    return Math.min(size - 1, Math.max(0, Math.floor((v - origin) / CELL)));
}

function buildGrid(reach) {
    for (const cell of gridUsed) cell.length = 0;
    gridUsed = [];
    for (let i = 0; i < surfaceCount; i++) {
        const s = surfacePool[i];
        const x0 = cellIndex(s.x - s.ex - reach, GRID_X0, GRID_W);
        const x1 = cellIndex(s.x + s.ex + reach, GRID_X0, GRID_W);
        const y0 = cellIndex(s.y - s.ey - reach, GRID_Y0, GRID_H);
        const y1 = cellIndex(s.y + s.ey + reach, GRID_Y0, GRID_H);
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const cell = grid[cy * GRID_W + cx];
                if (cell.length === 0) gridUsed.push(cell);
                cell.push(s);
            }
        }
    }
}

// Piezas de los robots (las mismas formas que dibuja drawRobot) y sólidos del nivel. Los polígonos se omiten:
// los rigs actuales no los usan.
export function collectSurfaces(players, solids, reach = 0, offsetY = 0) {
    surfaceCount = 0;
    for (const s of solids) addSurface(0, s.x, s.y + offsetY, 0, s.w / 2, s.h / 2, 0);
    for (const player of players) {
        for (const item of player.renderItems) {
            if (item.type === "polygon") continue;
            const pos = item.body.GetPosition();
            const a = item.body.GetAngle();
            const c = Math.cos(a);
            const s = Math.sin(a);
            addSurface(
                item.type === "box" ? 0 : 1,
                pos.get_x() + item.cx * c - item.cy * s,
                pos.get_y() + item.cx * s + item.cy * c,
                a + item.angle,
                item.hw,
                item.hh,
                item.radius,
            );
        }
    }
    buildGrid(reach);
    return surfaceCount;
}

const skinShift = { x: 0, y: 0 };

// Posición del segundo círculo de una partícula de agua. LiquidFun deja el centro de la primera fila a ~1,85 radios
// físicos de la superficie del cuerpo (docs/design/07-sph.md §7.4), más lejos de lo que cubre el círculo dibujado: ahí
// queda un hueco. El segundo círculo se acerca por la normal hasta que su borde toca la superficie y el
// desplazamiento se apaga entre `fullReach` y `reach`. Devuelve la posición real si no hay nada que acercar.
export function skinPosition(x, y, drawRadius, reach, fullReach) {
    let best = reach;
    let gx = 0;
    let gy = 0;
    const near = grid[cellIndex(y, GRID_Y0, GRID_H) * GRID_W + cellIndex(x, GRID_X0, GRID_W)];
    for (let i = 0; i < near.length; i++) {
        const s = near[i];
        const dx = x - s.x;
        const dy = y - s.y;
        const lx = dx * s.cos + dy * s.sin;
        const ly = -dx * s.sin + dy * s.cos;
        let d;
        let nx;
        let ny;
        if (s.kind === 0) {
            const qx = Math.abs(lx) - s.hw;
            const qy = Math.abs(ly) - s.hh;
            const ox = Math.max(qx, 0);
            const oy = Math.max(qy, 0);
            d = Math.hypot(ox, oy);
            if (d === 0) continue;
            nx = (Math.sign(lx) * ox) / d;
            ny = (Math.sign(ly) * oy) / d;
        } else {
            const len = Math.hypot(lx, ly);
            d = len - s.radius;
            if (len === 0) continue;
            nx = lx / len;
            ny = ly / len;
        }
        if (d <= 0 || d >= best) continue;
        best = d;
        gx = nx * s.cos - ny * s.sin;
        gy = nx * s.sin + ny * s.cos;
    }
    const gap = best - (drawRadius - SKIN_OVERLAP);
    if (best >= reach || gap <= 0) {
        skinShift.x = x;
        skinShift.y = y;
        return skinShift;
    }
    const fade = best <= fullReach ? 1 : (reach - best) / (reach - fullReach);
    skinShift.x = x - gx * gap * fade;
    skinShift.y = y - gy * gap * fade;
    return skinShift;
}

const NO_SKIN = { radius: PARTICLE_RADIUS, area: PARTICLE_AREA, maxRadius: Infinity, snapReach: 0, snapFullReach: 0, kinds: {} };

/**
 * Círculo con que se dibuja una partícula (puro, sin `ctx`): llena `out` (`radius`, `x0`, `y0`, en metros) y lo
 * devuelve. Siempre un solo círculo de radio `min(draw.radius · k_material, draw.maxRadius)`, acercado a la
 * superficie del cuerpo si corresponde (`skinPosition`). Depende solo del material (`kind` = `store.kind`): ni la
 * velocidad ni el origen (lluvia o disparo) cambian el dibujo.
 */
export function dropShape(x, y, kind, draw, out) {
    const entry = draw.kinds[kind] ?? DEFAULT_KIND;
    const radius = Math.min(draw.radius * entry.radiusScale, draw.maxRadius);
    out.radius = radius;
    out.x0 = x;
    out.y0 = y;
    if (draw.snapReach > 0) {
        const p = skinPosition(x, y, radius, draw.snapReach, draw.snapFullReach);
        out.x0 = p.x;
        out.y0 = p.y;
    }
    return out;
}

const shape = { radius: 0, x0: 0, y0: 0 };

/**
 * Dibuja las partículas de `particleSystem` como un círculo cada una, de `radius` (por material con `skin`). Con
 * `skin` (`SHOT_DRAW`), las partículas junto a un cuerpo se dibujan acercadas a su superficie (ver `skinPosition`). Lo
 * que se dibuja lo decide `dropShape`. `store` (opcional): `store.kind` da el material de cada partícula.
 */
export function drawParticles(ctx, particleSystem, radius = PARTICLE_RADIUS, skin = null, store = null) {
    const count = particleSystem.GetParticleCount();
    const positions = Box2D.HEAPF32;
    const colors = Box2D.HEAPU8;
    const posBase = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    const colorBase = Box2D.getPointer(particleSystem.GetColorBuffer());
    const draw = skin ?? NO_SKIN;
    NO_SKIN.radius = radius;
    for (let i = 0; i < count; i++) {
        const c = colorBase + i * 4;
        const x = positions[posBase + i * 2];
        const y = positions[posBase + i * 2 + 1];
        const kind = store !== null ? store.kind[store.slotAt(i)] : 0;
        dropShape(x, y, kind, draw, shape);
        ctx.fillStyle = `rgb(${colors[c]}, ${colors[c + 1]}, ${colors[c + 2]})`;
        ctx.beginPath();
        ctx.arc(shape.x0, shape.y0, shape.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Contorno del agua del campo (puro, sin `ctx`): llena `out` y lo devuelve. Un polígono por tramo mojado (celdas
 * consecutivas con `h > hDry`), con `out.count` tramos; el tramo `s` ocupa los vértices `out.start[s]` a
 * `out.start[s] + out.size[s] − 1` de `out.xs` y `out.ys` (metros): lecho y superficie de la cara izquierda, los
 * centros de celda por arriba, la cara derecha y los centros por abajo. `out.surface[s]` es la cantidad de
 * vértices de la línea de superficie, que empieza en `out.start[s] + 1`. Los buffers se crean en la primera
 * llamada y se reutilizan.
 */
export function waterOutline(water, out) {
    const { N, i1, dx, x0, b, h } = water;
    const wet = water.config.hDry;
    if (!out.xs || out.xs.length < 4 * N + 4) {
        out.xs = new Float64Array(4 * N + 4);
        out.ys = new Float64Array(4 * N + 4);
        out.start = new Int32Array(N + 2);
        out.size = new Int32Array(N + 2);
        out.surface = new Int32Array(N + 2);
    }
    const { xs, ys } = out;
    let count = 0;
    let v = 0;
    let i = water.i0;
    while (i < i1) {
        if (h[i] <= wet) {
            i++;
            continue;
        }
        let end = i;
        while (end + 1 < i1 && h[end + 1] > wet) end++;
        const left = x0 + i * dx;
        const right = x0 + (end + 1) * dx;
        const first = v;
        xs[v] = left;
        ys[v++] = b[i];
        xs[v] = left;
        ys[v++] = b[i] + h[i];
        for (let c = i; c <= end; c++) {
            xs[v] = x0 + (c + 0.5) * dx;
            ys[v++] = b[c] + h[c];
        }
        xs[v] = right;
        ys[v++] = b[end] + h[end];
        xs[v] = right;
        ys[v++] = b[end];
        for (let c = end; c >= i; c--) {
            xs[v] = x0 + (c + 0.5) * dx;
            ys[v++] = b[c];
        }
        out.start[count] = first;
        out.size[count] = v - first;
        out.surface[count] = end - i + 3;
        count++;
        i = end + 1;
    }
    out.count = count;
    return out;
}

const outline = {};
const stopColor = [0, 0, 0];

/**
 * Color del agua del campo en `x` (puro, sin `ctx`): llena `out` y lo devuelve con el RGB entero. Falso color de
 * la fracción másica de H2SO4 `w` (docs/design/14-agua.md §14.3, Render): `f = 1 − 10^(−α w / w_a)`, con
 * `α = MATERIALS.acid.tintAbsorbance` (Beer–Lambert), de `water.config.draw.color` hacia `MATERIALS.acid.tint`.
 * Con `w` = 0 es exactamente `draw.color`. El tinte es una aproximación de juego: el ácido real es incoloro.
 */
export function fieldColor(water, x, out = [0, 0, 0]) {
    const { color } = water.config.draw;
    const { tint, tintAbsorbance, species } = MATERIALS.acid;
    const f = 1 - 10 ** ((-tintAbsorbance * water.acidFractionAt(x)) / species.H2SO4);
    for (let k = 0; k < 3; k++) out[k] = Math.round(color[k] + f * (tint[k] - color[k]));
    return out;
}

/**
 * Degradado horizontal de `fieldColor` para el tramo mojado entre las caras `left` y `right` (m), con una parada
 * en cada cara y una en el centro de cada `step`-ésima celda. Devuelve `null` si ninguna celda del tramo tiene
 * ácido (`A` = 0), y el tramo se rellena con `draw.color`.
 */
function tintedFill(ctx, water, left, right, step) {
    const { x0, dx, A } = water;
    const first = Math.round((left - x0) / dx);
    const end = Math.round((right - x0) / dx) - 1;
    let acid = false;
    for (let c = first; c <= end && !acid; c++) acid = A[c] > 0;
    if (!acid) return null;
    const gradient = ctx.createLinearGradient(left, 0, right, 0);
    const width = right - left;
    const stop = (x) => {
        fieldColor(water, x, stopColor);
        gradient.addColorStop(Math.min(1, Math.max(0, (x - left) / width)), `rgb(${stopColor[0]}, ${stopColor[1]}, ${stopColor[2]})`);
    };
    stop(left);
    for (let c = first; c <= end; c += step) stop(x0 + (c + 0.5) * dx);
    stop(right);
    return gradient;
}

/**
 * Dibuja el campo de alturas (docs/design/14-agua.md §14.3, Render): un polígono relleno por tramo mojado, del
 * lecho a `η`, con la línea de superficie encima. Va después de los robots, con la opacidad de
 * `water.config.draw`, para que las piezas sumergidas se vean bajo el agua. Los tramos con ácido se rellenan con
 * un degradado horizontal de `fieldColor`, con una parada cada `draw.colorStep` celdas y en las dos caras; la
 * geometría no cambia. Los datos de dibujo son `WATER_FIELD.draw`; el contexto ya tiene la cámara aplicada.
 * `deep` (opcional, `{ floor, bottom }` en metros): con `floor > 0` pinta además un rectángulo del color del agua entre las
 * caras del span, de `floor` a `bottom` (borde inferior de la cámara), para que no se vea el fondo efectivo.
 */
export function drawWater(ctx, water, scale, deep = null) {
    const { alpha, color, lineColor, lineWidth, colorStep } = water.config.draw;
    waterOutline(water, outline);
    const { xs, ys } = outline;
    const flat = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    if (deep && deep.floor > 0 && deep.bottom < deep.floor) {
        const left = water.x0 + water.i0 * water.dx;
        ctx.fillStyle = flat;
        ctx.globalAlpha = alpha;
        ctx.fillRect(left, deep.bottom, (water.i1 - water.i0) * water.dx, deep.floor - deep.bottom);
    }
    ctx.strokeStyle = `rgb(${lineColor[0]}, ${lineColor[1]}, ${lineColor[2]})`;
    ctx.lineWidth = lineWidth / scale;
    ctx.lineJoin = "round";
    for (let s = 0; s < outline.count; s++) {
        const first = outline.start[s];
        const last = first + outline.size[s];
        ctx.fillStyle = tintedFill(ctx, water, xs[first], xs[first + outline.surface[s]], colorStep) ?? flat;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(xs[first], ys[first]);
        for (let v = first + 1; v < last; v++) ctx.lineTo(xs[v], ys[v]);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(xs[first + 1], ys[first + 1]);
        const top = first + 1 + outline.surface[s];
        for (let v = first + 2; v < top; v++) ctx.lineTo(xs[v], ys[v]);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}
