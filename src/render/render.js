/**
 * Dibujo en coordenadas del mundo (metros, Y hacia arriba): el contexto ya tiene aplicada la cámara.
 * Los grosores se dividen por la escala para mantenerlos en píxeles de pantalla.
 */
import { COLOR_BYTES, tintOf } from "../core/color.js";
import { MATERIALS } from "../fluids/materials.js";
import { THRESHOLD_GAIN, THRESHOLD_OFFSET } from "./thresholdFilter.js";

/** Radio dibujado de las gotas: `√(A_p / π)` con `A_p = (1,5 · 0,06 m)²` el área física de una partícula (0,0508 m), para que el área dibujada sea la física (I3). */
export const PARTICLE_RADIUS = (1.5 * 0.06) / Math.sqrt(Math.PI);
const PARTICLE_AREA = Math.PI * PARTICLE_RADIUS ** 2;

/**
 * Radio de influencia `R` del campo de cada partícula, en m: el campo vale 0 a `R` del centro y solo las vecinas a
 * menos de `2 R` se suman. Con 2,2 radios dibujados las gotas a 0,12 m se funden y las de 0,16 m ya no.
 */
export const METABALL_RADIUS = 2.2 * PARTICLE_RADIUS;

/** Umbral de alfa del filtro de `thresholdFilter.js`: el alfa de salida es 0 hasta aquí (0,5 con ganancia 20 y desplazamiento −10). */
export const METABALL_THRESHOLD = -THRESHOLD_OFFSET / THRESHOLD_GAIN;

/**
 * Perfil radial del campo (Wyvill): `(1 − q²)²` con `q = d / R`, 1 en el centro y 0 desde `q` = 1, con derivada nula en ambos extremos.
 * @param {number} q distancia al centro sobre el radio de influencia
 */
export function metaballProfile(q) {
    if (q >= 1) return 0;
    const s = 1 - q * q;
    return s * s;
}

/**
 * Pico de alfa del sprite de un material para que una gota aislada de radio `radius` (m) cruce el umbral justo en ese radio:
 * `umbral / perfil(radius / R)`, con tope 1.
 * @param {number} radius radio visible de la gota, en m
 */
export function metaballPeak(radius, influence = METABALL_RADIUS, threshold = METABALL_THRESHOLD) {
    return Math.min(1, threshold / metaballProfile(radius / influence));
}

/**
 * Alfa de una gota de pico `peak` a `distance` m de su centro.
 * @param {number} distance
 * @param {number} peak
 */
export function metaballAlpha(distance, peak, influence = METABALL_RADIUS) {
    return peak * metaballProfile(distance / influence);
}

/**
 * Radio visible (m) de una gota aislada de pico `peak`: donde el alfa baja al umbral. Invierte `metaballAlpha`.
 * @param {number} peak
 */
export function metaballVisibleRadius(peak, influence = METABALL_RADIUS, threshold = METABALL_THRESHOLD) {
    return influence * Math.sqrt(1 - Math.sqrt(threshold / peak));
}

/**
 * Dibujo de las gotas de disparo y de lluvia: un solo círculo por partícula, de área física `area` = A_p en m²,
 * igual para toda partícula de un material (sin trazos: la velocidad y el origen no cambian el dibujo).
 * `snapReach` y `snapFullReach` (m) acercan el círculo de las partículas junto a un cuerpo a su superficie: la fila de contacto física queda a
 * 0,192 m. `kinds` se indexa por `store.kind` (ids de `FLUID` en `src/combat/weapons.js`: 1 ácido, 2 lava, 3 miel, 4 agua, 5 piedra, con el k de la lava) y
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
        6: { radiusScale: 1.04 },
    },
};
const DEFAULT_KIND = { radiusScale: 1 };
// m que el agua acercada se mete bajo la superficie del cuerpo para que no quede una línea de fondo entre los dos
const SKIN_OVERLAP = 0.02;

/** Radio del ícono de un arma recogible, en metros (el sensor mide 0,5 m). */
const PICKUP_ICON_RADIUS = 0.4;

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

/**
 * Arma la lista de superficies sólidas, en metros del mundo, con las piezas de los robots (las mismas formas que dibuja
 * `RagdollShapes`) y los sólidos del nivel, y la grilla que las indexa. Los polígonos se omiten: los rigs actuales no los usan.
 * @param {object[]} players robots con `renderItems`
 * @param {object[]} solids sólidos del nivel
 * @param {number} reach alcance del acercamiento del agua, en m
 * @param {number} offsetY desplazamiento vertical de los sólidos, en m
 * @returns {number} cantidad de superficies
 */
export function collectSurfaces(players, solids, reach = 0, offsetY = 0) {
    surfaceCount = 0;
    for (const s of solids) {
        if (s.broken) continue;
        addSurface(0, s.x, s.y + offsetY, 0, s.w / 2, s.h / 2, 0);
    }
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
 * Estiramiento del sprite a lo largo de la velocidad, para que un chorro muestreado se dibuje continuo: medio largo extra
 * `|v| · time / 2` (m), con `time` el intervalo de emisión del chorro (1/100 s), desde `minSpeed` (m/s) y con tope `max` (m).
 * A 18 m/s la separación entre gotas del chorro es 0,18 m y el campo solo funde a menos de 2 `METABALL_RADIUS`.
 */
export const DROP_STRETCH = { time: 0.01, minSpeed: 1, max: 0.2 };

/**
 * Pone las partículas de `particleSystem` en las capas de `layers` (`FluidLayers`): una partícula del pool por gota, con la
 * textura de campo de su material (`kind` = `store.kind`, o 0 sin `store`) teñida con el color del buffer del motor, que la térmica
 * escribe por partícula. `skin` (`SHOT_DRAW`) acerca las partículas junto a un cuerpo a su superficie (ver `skinPosition`) y
 * la forma la decide `dropShape`. Una gota en movimiento se estira a lo largo de su velocidad (`DROP_STRETCH`). Lee los buffers
 * del heap y no crea nada nativo. Ver `docs/design/07-sph.md` §7.4.
 */
export function drawParticles(layers, particleSystem, skin = null, store = null) {
    const count = particleSystem.GetParticleCount();
    const positions = Box2D.HEAPF32;
    const colors = Box2D.HEAPU8;
    const posBase = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    const velBase = Box2D.getPointer(particleSystem.GetVelocityBuffer()) >> 2;
    const colorBase = Box2D.getPointer(particleSystem.GetColorBuffer());
    const draw = skin ?? NO_SKIN;
    const { pixelsPerMeter, scalePerMeter } = layers;
    layers.begin();
    for (let i = 0; i < count; i++) {
        const colorOffset = colorBase + i * COLOR_BYTES;
        const kind = store !== null ? store.kind[store.slotAt(i)] : 0;
        dropShape(positions[posBase + i * 2], positions[posBase + i * 2 + 1], kind, draw, shape);
        const particle = layers.acquire(kind, shape.radius);
        const vx = positions[velBase + i * 2];
        const vy = positions[velBase + i * 2 + 1];
        const speed = Math.hypot(vx, vy);
        const stretching = speed >= DROP_STRETCH.minSpeed;
        const half = stretching ? METABALL_RADIUS + Math.min(DROP_STRETCH.max, (speed * DROP_STRETCH.time) / 2) : METABALL_RADIUS;
        particle.x = shape.x0 * pixelsPerMeter;
        particle.y = shape.y0 * pixelsPerMeter;
        particle.scaleX = half * scalePerMeter;
        particle.scaleY = METABALL_RADIUS * scalePerMeter;
        particle.rotation = stretching ? Math.atan2(vy, vx) : 0;
        particle.tint = tintOf(colors[colorOffset], colors[colorOffset + 1], colors[colorOffset + 2]);
    }
    layers.end();
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
