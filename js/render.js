// Dibujo en coordenadas del mundo (metros, Y hacia arriba): el contexto ya tiene aplicada la cámara.
// Los grosores se dividen por la escala para mantenerlos en píxeles de pantalla.
import { MATERIALS } from "./materials.js";

const FLASH_COLOR = [255, 40, 40];
const WET_COLOR = [40, 220, 255];
const WET_BLINK_HZ = 4;
const STICKY_COLOR = [255, 170, 30];
const STICKY_BLINK_HZ = 3;
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
 * Dibujo de las gotas de disparo y de lluvia: un solo círculo por partícula, de área física `area` = A_p en m²,
 * igual para toda partícula de un material (sin trazos: la velocidad y el origen no cambian el dibujo).
 * `snapReach` y `snapFullReach` (m) acercan el círculo de las partículas junto a un cuerpo a su superficie: la fila de contacto física queda a
 * 0,192 m. `kinds` se indexa por `store.kind` (ids de `FLUID` en `js/weapons.js`: 1 ácido, 2 lava, 3 miel, 4 agua) y
 * dice, por material, `radiusScale` (k que multiplica a `√(A_p/π)`, con tope `maxRadius` en m). Los k se midieron con el fluido en reposo (|v| < 1 m/s) en la
 * escena estándar de `tests/helpers/invariants-run.js` (60 s, un muestreo cada 20 pasos): el k que hace que la
 * unión de círculos (con `skinPosition`) mida N · A_p, por bisección; resultado ponderado por N: agua 1,040
 * (109 muestras), miel 1,069 (111), lava 1,045 (12). El ácido nunca queda en reposo en esa escena (se absorbe o
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
        2: { radiusScale: 1.045 },
        3: { radiusScale: 1.069 },
        4: { radiusScale: 1.04 },
    },
};
const DEFAULT_KIND = { radiusScale: 1 };
// m que el agua acercada se mete bajo la superficie del cuerpo para que no quede una línea de fondo entre los dos
const SKIN_OVERLAP = 0.02;

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(base, k, wet = 0, sticky = 0) {
    let r = base[0] + (FLASH_COLOR[0] - base[0]) * k;
    let g = base[1] + (FLASH_COLOR[1] - base[1]) * k;
    let b = base[2] + (FLASH_COLOR[2] - base[2]) * k;
    r += (WET_COLOR[0] - r) * wet;
    g += (WET_COLOR[1] - g) * wet;
    b += (WET_COLOR[2] - b) * wet;
    r += (STICKY_COLOR[0] - r) * sticky;
    g += (STICKY_COLOR[1] - g) * sticky;
    b += (STICKY_COLOR[2] - b) * sticky;
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function drawLevel(ctx, level, scale) {
    ctx.fillStyle = "#2b2b38";
    ctx.strokeStyle = "#555566";
    ctx.lineWidth = 2 / scale;
    for (const s of level.solids) {
        ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
        ctx.strokeRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    }
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
    // Pegado por miel: tinte ámbar que parpadea
    const sticky = player.sticky && !player.dead ? 0.5 + 0.4 * Math.sin(now * STICKY_BLINK_HZ * Math.PI * 2) : 0;
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
        ctx.fillStyle = mix(base, player.flashAmount(item.bodyId, now), wet, sticky);
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
 * en blanco azulado.
 */
export const HIT_FX = {
    hit: { time: 0.2, radius: 0.15, grow: 0.4, color: "#ffffff", width: 3 },
    block: { time: 0.25, rays: 6, from: 0.15, to: 0.45, color: "#bfe0ff", width: 2.5 },
};

/**
 * Dibuja los eventos `{ x, y, time, kind }` de `Melee.hits` y descarta los vencidos.
 * @param {CanvasRenderingContext2D} ctx Contexto con la cámara aplicada.
 * @param {object[]} hits Eventos; `kind` es `"hit"` o `"block"`.
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
        ctx.fillText(`J${k + 1} Salud: ${Math.ceil(player.hp)}% · ${weapon.name}`, x, height - 30);

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
    ctx.fillText(`Ronda ${match.round}`, width / 2, 36);
    const seconds = Math.floor(match.roundTime);
    ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, width / 2, 60);
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
export function collectSurfaces(players, solids, reach = 0) {
    surfaceCount = 0;
    for (const s of solids) addSurface(0, s.x, s.y, 0, s.w / 2, s.h / 2, 0);
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
    const { N, dx, x0, b, h } = water;
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
    let i = 0;
    while (i < N) {
        if (h[i] <= wet) {
            i++;
            continue;
        }
        let end = i;
        while (end + 1 < N && h[end + 1] > wet) end++;
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
 */
export function drawWater(ctx, water, scale) {
    const { alpha, color, lineColor, lineWidth, colorStep } = water.config.draw;
    waterOutline(water, outline);
    const { xs, ys } = outline;
    const flat = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
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
