// Dibujo en coordenadas del mundo (metros, Y hacia arriba): el contexto ya tiene aplicada la cámara.
// Los grosores se dividen por la escala para mantenerlos en píxeles de pantalla.

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
// Algo mayor que el radio físico (0,1 m) para que el filtro goo una las gotas vecinas
const PARTICLE_RADIUS = 0.14;
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
    const sticky = player.sticky && !player.dead ? 0.35 + 0.35 * Math.sin(now * STICKY_BLINK_HZ * Math.PI * 2) : 0;
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

// Impacto del golpe: un destello blanco que se agranda y se apaga en HIT_TIME
const HIT_TIME = 0.2;

export function drawHits(ctx, hits, scale, now) {
    for (let i = hits.length - 1; i >= 0; i--) {
        const k = (now - hits[i].time) / HIT_TIME;
        if (k >= 1) {
            hits.splice(i, 1);
            continue;
        }
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3 / scale;
        ctx.beginPath();
        ctx.arc(hits[i].x, hits[i].y, 0.15 + k * 0.4, 0, Math.PI * 2);
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

// `skin` = LEVEL.pool.draw ({ radius, snapReach, snapFullReach }): además del círculo en la posición real, las
// partículas junto a un cuerpo suman un segundo círculo acercado a su superficie (ver skinPosition). Mover la
// partícula en vez de duplicarla abría huecos en el agua donde estaba.
export function drawParticles(ctx, particleSystem, radius = PARTICLE_RADIUS, skin = null) {
    const count = particleSystem.GetParticleCount();
    const positions = Box2D.HEAPF32;
    const colors = Box2D.HEAPU8;
    const posBase = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    const colorBase = Box2D.getPointer(particleSystem.GetColorBuffer());
    for (let i = 0; i < count; i++) {
        const c = colorBase + i * 4;
        ctx.fillStyle = `rgb(${colors[c]}, ${colors[c + 1]}, ${colors[c + 2]})`;
        const x = positions[posBase + i * 2];
        const y = positions[posBase + i * 2 + 1];
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (skin) {
            const p = skinPosition(x, y, skin.radius, skin.snapReach, skin.snapFullReach);
            if (p.x !== x || p.y !== y) {
                ctx.moveTo(p.x + radius, p.y);
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            }
        }
        ctx.fill();
    }
}