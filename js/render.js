// Dibujo en coordenadas del mundo (metros, Y hacia arriba): el contexto ya tiene aplicada la cámara.
// Los grosores se dividen por la escala para mantenerlos en píxeles de pantalla.

const FLASH_COLOR = [255, 40, 40];
const WET_COLOR = [40, 220, 255];
const WET_BLINK_HZ = 4;
// Algo mayor que el radio físico (0,1 m) para que el filtro goo una las gotas vecinas
const PARTICLE_RADIUS = 0.14;

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

export function drawParticles(ctx, particleSystem, radius = PARTICLE_RADIUS) {
    const count = particleSystem.GetParticleCount();
    const positions = Box2D.HEAPF32;
    const colors = Box2D.HEAPU8;
    const posBase = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    const colorBase = Box2D.getPointer(particleSystem.GetColorBuffer());
    for (let i = 0; i < count; i++) {
        const c = colorBase + i * 4;
        ctx.fillStyle = `rgb(${colors[c]}, ${colors[c + 1]}, ${colors[c + 2]})`;
        ctx.beginPath();
        ctx.arc(positions[posBase + i * 2], positions[posBase + i * 2 + 1], radius, 0, Math.PI * 2);
        ctx.fill();
    }
}
