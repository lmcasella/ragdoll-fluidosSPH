// Dibujo en coordenadas del mundo (metros, Y hacia arriba): el contexto ya tiene aplicada la cámara.
// Los grosores se dividen por la escala para mantenerlos en píxeles de pantalla.
import { MATERIALS } from "../fluids/materials.js";
import { shortCircuitDps } from "../ragdoll/ActiveRagdoll.js";

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
 * Radio de influencia `R` del campo de cada partícula, en m: el campo vale 0 a `R` del centro y solo las vecinas a
 * menos de `2 R` se suman. Con 2,2 radios dibujados las gotas a 0,12 m se funden y las de 0,16 m ya no.
 */
export const METABALL_RADIUS = 2.2 * PARTICLE_RADIUS;

/** Umbral de alfa del filtro `#goo` de `index.html` (alfa · 20 − 10 > 0, es decir alfa > 0,5). */
export const METABALL_THRESHOLD = 0.5;

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

const SPRITE_PX = 64;
const SPRITE_STOPS = 16;
const SPRITE_CAP = 256;

/**
 * Sprites de gradiente radial por material y color. El color se cuantiza a 5 bits por canal y cada material guarda
 * hasta `cap` sprites (descarta el más viejo). `makeCanvas` crea un canvas (en Node, uno falso).
 */
export class MetaballSprites {
    constructor(makeCanvas, cap = SPRITE_CAP) {
        this.makeCanvas = makeCanvas;
        this.cap = cap;
        this.byKind = new Map();
        this.baked = 0;
    }

    /** Sprite de `kind` con el color RGB (0-255) y el radio visible `radius` (m); lo hornea si no está. */
    get(kind, r, g, b, radius) {
        let cache = this.byKind.get(kind);
        if (cache === undefined) {
            cache = new Map();
            this.byKind.set(kind, cache);
        }
        const rq = r >> 3;
        const gq = g >> 3;
        const bq = b >> 3;
        const key = (rq << 10) | (gq << 5) | bq;
        let sprite = cache.get(key);
        if (sprite !== undefined) return sprite;
        if (cache.size >= this.cap) cache.delete(cache.keys().next().value);
        sprite = this.bake((rq << 3) | (rq >> 2), (gq << 3) | (gq >> 2), (bq << 3) | (bq >> 2), metaballPeak(radius));
        cache.set(key, sprite);
        return sprite;
    }

    bake(r, g, b, peak) {
        const canvas = this.makeCanvas();
        canvas.width = SPRITE_PX;
        canvas.height = SPRITE_PX;
        const ctx = canvas.getContext("2d");
        const half = SPRITE_PX / 2;
        const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
        for (let i = 0; i <= SPRITE_STOPS; i++) {
            const q = i / SPRITE_STOPS;
            gradient.addColorStop(q, `rgba(${r}, ${g}, ${b}, ${(peak * metaballProfile(q)).toFixed(4)})`);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
        this.baked++;
        return canvas;
    }
}

/**
 * Una capa (canvas DOM con el filtro `#goo` por CSS) por material presente en el frame, para que materiales
 * distintos no se fundan entre sí. Los canvas se crean al primer uso, antes de `anchor`, con `z-index` = id del material.
 * `apply(ctx)` pone la cámara en cada contexto usado.
 */
export class FluidLayers {
    constructor(doc, anchor, apply) {
        this.doc = doc;
        this.anchor = anchor;
        this.apply = apply;
        this.layers = new Map();
        this.width = 0;
        this.height = 0;
        this.sprites = new MetaballSprites(() => doc.createElement("canvas"));
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        for (const layer of this.layers.values()) {
            layer.canvas.width = width;
            layer.canvas.height = height;
        }
    }

    begin() {
        for (const layer of this.layers.values()) layer.used = false;
    }

    /** Contexto de la capa de `kind`: la crea si falta y, en el primer pedido del frame, la muestra, la limpia y le pone la cámara. */
    contextFor(kind) {
        let layer = this.layers.get(kind);
        if (layer === undefined) {
            const canvas = this.doc.createElement("canvas");
            canvas.className = "fluidLayer";
            canvas.style.zIndex = String(kind);
            canvas.width = this.width;
            canvas.height = this.height;
            this.anchor.before(canvas);
            layer = { canvas, ctx: canvas.getContext("2d"), used: false, shown: true };
            this.layers.set(kind, layer);
        }
        if (!layer.used) {
            layer.used = true;
            if (!layer.shown) {
                layer.canvas.style.display = "";
                layer.shown = true;
            }
            layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
            layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
            this.apply(layer.ctx);
        }
        return layer.ctx;
    }

    /** Oculta las capas que no se usaron en este frame. */
    end() {
        for (const layer of this.layers.values()) {
            if (layer.used || !layer.shown) continue;
            layer.canvas.style.display = "none";
            layer.shown = false;
        }
    }

    sprite(kind, r, g, b, radius) {
        return this.sprites.get(kind, r, g, b, radius);
    }
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

const SOLID_FILL = "#2b2b38";
const SOLID_STROKE = "#555566";
const BREAKABLE_FILL = [120, 82, 54];
const BREAKABLE_WARN = [220, 75, 45];
const BREAKABLE_STROKE = "#e0a96d";
const BREAKABLE_SHAKE = 0.06;

/** Dibuja los sólidos del nivel; las plataformas rompibles cambian de color, vibran con `crack` y se omiten mientras están rotas. */
export function drawLevel(ctx, level, scale, now = 0) {
    ctx.lineWidth = 2 / scale;
    for (const s of level.solids) {
        if (s.broken) continue;
        const x = s.x - s.w / 2;
        const y = s.y - s.h / 2;
        if (s.breakable) {
            const crack = s.crack ?? 0;
            const shake = crack > 0 ? Math.sin(now * 55) * BREAKABLE_SHAKE * crack : 0;
            const r = Math.round(BREAKABLE_FILL[0] + (BREAKABLE_WARN[0] - BREAKABLE_FILL[0]) * crack);
            const g = Math.round(BREAKABLE_FILL[1] + (BREAKABLE_WARN[1] - BREAKABLE_FILL[1]) * crack);
            const b = Math.round(BREAKABLE_FILL[2] + (BREAKABLE_WARN[2] - BREAKABLE_FILL[2]) * crack);
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.strokeStyle = BREAKABLE_STROKE;
            ctx.fillRect(x + shake, y, s.w, s.h);
            ctx.strokeRect(x + shake, y, s.w, s.h);
        } else {
            ctx.fillStyle = SOLID_FILL;
            ctx.strokeStyle = SOLID_STROKE;
            ctx.fillRect(x, y, s.w, s.h);
            ctx.strokeRect(x, y, s.w, s.h);
        }
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

/**
 * Chispas por destello según el daño del cortocircuito: `SPARKS_PER_FRAME` con agua limpia y proporcional al dps
 * (el ácido al 8 % da unas 5 veces más).
 */
export function sparkCount(dps) {
    return Math.max(1, Math.round((SPARKS_PER_FRAME * dps) / shortCircuitDps(MATERIALS.water.sigmaE)));
}

/**
 * Burbujas de H2 (docs/design/15-quimica.md §15.5b), solo dibujo en metros y segundos. `perPiece` (1/s) es la tasa
 * por pieza con ácido puro y se escala con σ/σ del ácido; nacen sobre la superficie de la pieza, suben `rise` (m/s),
 * miden de `minRadius` a `maxRadius` (m) y desaparecen a los `life` s. `capacity` es el máximo vivo por robot.
 */
export const H2_BUBBLES = { perPiece: 20, rise: 0.3, life: 0.5, minRadius: 0.02, maxRadius: 0.04, capacity: 256 };
const BUBBLE_STRIDE = 5;
const bubbleStates = new WeakMap();
const surface = [0, 0];

function bubbleState(player) {
    let state = bubbleStates.get(player);
    if (!state) {
        state = { data: new Float32Array(H2_BUBBLES.capacity * BUBBLE_STRIDE), cursor: 0, acc: 0, last: -1, seed: 0 };
        bubbleStates.set(player, state);
    }
    return state;
}

/** Punto (x, y) del mundo sobre el borde de la pieza `item`, elegido con `u`, `v` en [0, 1); queda en `surface`. */
function surfacePoint(item, u, v) {
    let lx;
    let ly;
    if (item.type === "circle") {
        lx = Math.cos(u * Math.PI * 2) * item.radius;
        ly = Math.sin(u * Math.PI * 2) * item.radius;
    } else if (item.type === "box") {
        const side = Math.floor(u * 4);
        const t = v * 2 - 1;
        lx = side === 0 ? item.hw : side === 1 ? -item.hw : t * item.hw;
        ly = side === 2 ? item.hh : side === 3 ? -item.hh : t * item.hh;
    } else {
        const verts = item.vertices;
        const a = verts[Math.floor(u * verts.length) % verts.length];
        const b = verts[(Math.floor(u * verts.length) + 1) % verts.length];
        lx = a[0] + (b[0] - a[0]) * v;
        ly = a[1] + (b[1] - a[1]) * v;
    }
    const ca = Math.cos(item.angle);
    const sa = Math.sin(item.angle);
    const bx = item.cx + lx * ca - ly * sa;
    const by = item.cy + lx * sa + ly * ca;
    const pos = item.body.GetPosition();
    const angle = item.body.GetAngle();
    const cb = Math.cos(angle);
    const sb = Math.sin(angle);
    surface[0] = pos.get_x() + bx * cb - by * sb;
    surface[1] = pos.get_y() + bx * sb + by * cb;
}

function drawBubbles(ctx, player, scale, now) {
    const items = player.renderItems;
    const sigma = player.wetSigma;
    const emitting = player.wet && !player.dead && sigma > MATERIALS.water.sigmaE;
    let state = bubbleStates.get(player);
    if (!state && !emitting) return;
    state ??= bubbleState(player);
    const dt = state.last < 0 ? 0 : Math.min(now - state.last, 0.1);
    state.last = now;
    const { data } = state;
    const { life, rise, capacity } = H2_BUBBLES;
    if (emitting && dt > 0) {
        state.acc += H2_BUBBLES.perPiece * items.length * Math.min(1, sigma / MATERIALS.acid.sigmaE) * dt;
        while (state.acc >= 1) {
            state.acc -= 1;
            const seed = state.seed++ * 7;
            surfacePoint(items[Math.floor(hash01(seed) * items.length)], hash01(seed + 1), hash01(seed + 2));
            const at = state.cursor * BUBBLE_STRIDE;
            state.cursor = (state.cursor + 1) % capacity;
            data[at] = surface[0];
            data[at + 1] = surface[1];
            data[at + 2] = H2_BUBBLES.minRadius + hash01(seed + 3) * (H2_BUBBLES.maxRadius - H2_BUBBLES.minRadius);
            data[at + 3] = 0;
            data[at + 4] = 1;
        }
    }
    ctx.lineWidth = 1 / scale;
    for (let at = 0; at < data.length; at += BUBBLE_STRIDE) {
        if (data[at + 4] === 0) continue;
        data[at + 3] += dt;
        if (data[at + 3] >= life) {
            data[at + 4] = 0;
            continue;
        }
        data[at + 1] += rise * dt;
        ctx.globalAlpha = 1 - data[at + 3] / life;
        ctx.fillStyle = "rgba(235, 255, 235, 0.35)";
        ctx.strokeStyle = "#f2fff2";
        ctx.beginPath();
        ctx.arc(data[at], data[at + 1], data[at + 2], 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawSparks(ctx, player, scale, now) {
    const items = player.renderItems;
    if (items.length === 0) return;
    const tick = Math.floor(now * SPARK_TICK_HZ);
    ctx.lineWidth = 3 / scale;
    const sparks = sparkCount(player.shortCircuitDps);
    for (let s = 0; s < sparks; s++) {
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
    drawBubbles(ctx, player, scale, now);
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

// Piezas de los robots (las mismas formas que dibuja drawRobot) y sólidos del nivel. Los polígonos se omiten:
// los rigs actuales no los usan.
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
 * Dibuja las partículas de `particleSystem` como un sprite de campo cada una (ver `metaballPeak`) en la capa de su material
 * (`layers.contextFor(kind)`, `kind` = `store.kind` o 0 sin `store`), con el color propio de la partícula. `skin` (`SHOT_DRAW`) acerca las
 * partículas junto a un cuerpo a su superficie (ver `skinPosition`). La forma la decide `dropShape`. Dentro de la capa
 * los sprites se combinan en `source-over` y el filtro `#goo` recorta el campo por el umbral. Una gota en movimiento
 * se estira a lo largo de su velocidad (`DROP_STRETCH`).
 */
export function drawParticles(layers, particleSystem, skin = null, store = null) {
    const count = particleSystem.GetParticleCount();
    const positions = Box2D.HEAPF32;
    const colors = Box2D.HEAPU8;
    const posBase = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    const velBase = Box2D.getPointer(particleSystem.GetVelocityBuffer()) >> 2;
    const colorBase = Box2D.getPointer(particleSystem.GetColorBuffer());
    const draw = skin ?? NO_SKIN;
    const side = 2 * METABALL_RADIUS;
    layers.begin();
    let lastKind = -1;
    let ctx = null;
    for (let i = 0; i < count; i++) {
        const c = colorBase + i * 4;
        const kind = store !== null ? store.kind[store.slotAt(i)] : 0;
        if (kind !== lastKind) {
            lastKind = kind;
            ctx = layers.contextFor(kind);
        }
        dropShape(positions[posBase + i * 2], positions[posBase + i * 2 + 1], kind, draw, shape);
        const sprite = layers.sprite(kind, colors[c], colors[c + 1], colors[c + 2], shape.radius);
        const vx = positions[velBase + i * 2];
        const vy = positions[velBase + i * 2 + 1];
        const speed = Math.hypot(vx, vy);
        if (speed < DROP_STRETCH.minSpeed) {
            ctx.drawImage(sprite, shape.x0 - METABALL_RADIUS, shape.y0 - METABALL_RADIUS, side, side);
            continue;
        }
        const half = METABALL_RADIUS + Math.min(DROP_STRETCH.max, (speed * DROP_STRETCH.time) / 2);
        ctx.save();
        ctx.translate(shape.x0, shape.y0);
        ctx.rotate(Math.atan2(vy, vx));
        ctx.drawImage(sprite, -half, -METABALL_RADIUS, 2 * half, side);
        ctx.restore();
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
