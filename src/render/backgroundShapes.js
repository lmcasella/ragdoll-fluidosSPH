/**
 * Figuras del fondo de planta industrial (`docs/design/13-arte.md` §13.1). Cada constructor agrega a `shapes` las figuras de un
 * elemento que ocupa `width` x `height` m con su esquina inferior izquierda en (`x`, `y`), en m con la Y hacia arriba.
 * Figuras: `rect` (`x`, `y`, `width`, `height`), `polygon` (`points`, lista plana `x, y`) y `puff` (`x`, `y`, `radius`, `alpha`: humo).
 */

/** Proporciones del tanque respecto de su ancho o alto. */
const TANK = { legHeightRatio: 0.2, legWidthRatio: 0.1, legInsetRatio: 0.1, lidHeightRatio: 0.06, lidOverhangRatio: 0.05 };

/** Proporciones de la chimenea respecto de su ancho o alto: cuánto se afina cada lado hacia arriba y el aro de la boca. */
const CHIMNEY = { taperRatio: 0.15, rimHeightRatio: 0.04, rimOverhangRatio: 0.06 };

/** Humo de la chimenea: cantidad de bocanadas, radio de la primera respecto del ancho de la boca, crecimiento, subida, deriva y opacidad. */
const SMOKE = {
    puffCountMin: 3,
    puffCountMax: 5,
    firstRadiusRatio: 0.6,
    radiusGrowth: 1.3,
    riseRadiusRatio: 1.2,
    driftRadiusRatio: 0.5,
    firstAlpha: 0.6,
    alphaDecay: 0.75,
};

/** Proporciones de la cañería respecto de su grosor: separación y ancho de las bridas, cuánto sobresalen y largo del tramo vertical. */
const PIPE = { flangeSpacingRatio: 4, flangeWidthRatio: 0.3, flangeOverhangRatio: 0.15, riserLengthRatio: 3 };

/** Estructura de pisos: cantidad de pisos y grosor de cada miembro respecto del ancho. */
const STRUCTURE = { floorCount: 3, memberRatio: 0.07 };

/** Pasarela: grosor del piso, grosor del pasamanos, ancho de los parantes y su separación, respecto de la altura de la baranda. */
const CATWALK = { deckRatio: 0.15, railRatio: 0.1, postWidthRatio: 0.1, postSpacingRatio: 1.2, minimumPosts: 2 };

/** Viga en I: grosor del alma y de cada ala respecto de su lado menor. */
const BEAM = { webRatio: 0.3, flangeRatio: 0.3 };

/**
 * @param {object[]} shapes
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function rect(shapes, x, y, width, height) {
    shapes.push({ type: "rect", x, y, width, height });
}

/**
 * Tanque sobre patas con tapa algo más ancha que el cuerpo.
 * @param {object[]} shapes
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function tank(shapes, x, y, width, height) {
    const legHeight = height * TANK.legHeightRatio;
    const legWidth = width * TANK.legWidthRatio;
    const legInset = width * TANK.legInsetRatio;
    const lidHeight = height * TANK.lidHeightRatio;
    const lidOverhang = width * TANK.lidOverhangRatio;
    rect(shapes, x + legInset, y, legWidth, legHeight);
    rect(shapes, x + width - legInset - legWidth, y, legWidth, legHeight);
    rect(shapes, x, y + legHeight, width, height - legHeight - lidHeight);
    rect(shapes, x - lidOverhang, y + height - lidHeight, width + 2 * lidOverhang, lidHeight);
}

/**
 * Chimenea que se afina hacia arriba, con un aro en la boca.
 * @param {object[]} shapes
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function chimney(shapes, x, y, width, height) {
    const taper = width * CHIMNEY.taperRatio;
    shapes.push({ type: "polygon", points: [x, y, x + width, y, x + width - taper, y + height, x + taper, y + height] });
    const rimHeight = height * CHIMNEY.rimHeightRatio;
    const rimOverhang = width * CHIMNEY.rimOverhangRatio;
    rect(shapes, x + taper - rimOverhang, y + height - rimHeight, width - 2 * taper + 2 * rimOverhang, rimHeight);
}

/**
 * Chimenea con una columna de humo que sube de su boca y se ensancha.
 * @param {object[]} shapes
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {() => number} random
 */
function smokingChimney(shapes, x, y, width, height, random) {
    chimney(shapes, x, y, width, height);
    const puffCount = SMOKE.puffCountMin + Math.floor(random() * (SMOKE.puffCountMax - SMOKE.puffCountMin + 1));
    let radius = width * SMOKE.firstRadiusRatio;
    let puffX = x + width / 2;
    let puffY = y + height;
    let alpha = SMOKE.firstAlpha;
    for (let puff = 0; puff < puffCount; puff++) {
        shapes.push({ type: "puff", x: puffX, y: puffY + radius, radius, alpha });
        puffY += radius * SMOKE.riseRadiusRatio;
        puffX += (random() * 2 - 1) * radius * SMOKE.driftRadiusRatio;
        radius *= SMOKE.radiusGrowth;
        alpha *= SMOKE.alphaDecay;
    }
}

/**
 * Cañería horizontal de grosor `height`, con bridas y un tramo vertical en la punta derecha.
 * @param {object[]} shapes
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function pipe(shapes, x, y, width, height) {
    rect(shapes, x, y, width, height);
    const flangeCount = Math.floor(width / (height * PIPE.flangeSpacingRatio));
    const flangeWidth = height * PIPE.flangeWidthRatio;
    const overhang = height * PIPE.flangeOverhangRatio;
    for (let flange = 1; flange <= flangeCount; flange++) {
        const flangeX = x + (flange * width) / (flangeCount + 1) - flangeWidth / 2;
        rect(shapes, flangeX, y - overhang, flangeWidth, height + 2 * overhang);
    }
    const riserLength = height * PIPE.riserLengthRatio;
    rect(shapes, x + width - height, y - riserLength, height, riserLength + height);
}

/**
 * Estructura de pisos: dos parantes, travesaños y una diagonal por tramo, alternando el sentido.
 * @param {object[]} shapes
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function structure(shapes, x, y, width, height) {
    const member = width * STRUCTURE.memberRatio;
    rect(shapes, x, y, member, height);
    rect(shapes, x + width - member, y, member, height);
    const levelSpacing = (height - member) / STRUCTURE.floorCount;
    for (let level = 0; level <= STRUCTURE.floorCount; level++) {
        rect(shapes, x, y + level * levelSpacing, width, member);
    }
    for (let bay = 0; bay < STRUCTURE.floorCount; bay++) {
        const startX = bay % 2 === 0 ? x + member : x + width - member;
        const endX = bay % 2 === 0 ? x + width - member : x + member;
        const startY = y + bay * levelSpacing + member;
        const endY = y + (bay + 1) * levelSpacing;
        shapes.push({ type: "polygon", points: [startX, startY, endX, endY, endX, endY + member, startX, startY + member] });
    }
}

/**
 * Pasarela con piso, pasamanos y parantes; `height` es la altura de la baranda.
 * @param {object[]} shapes
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function catwalk(shapes, x, y, width, height) {
    const railHeight = height * CATWALK.railRatio;
    rect(shapes, x, y, width, height * CATWALK.deckRatio);
    rect(shapes, x, y + height - railHeight, width, railHeight);
    const postWidth = height * CATWALK.postWidthRatio;
    const postCount = Math.max(CATWALK.minimumPosts, Math.floor(width / (height * CATWALK.postSpacingRatio)) + 1);
    for (let post = 0; post < postCount; post++) {
        rect(shapes, x + (post * (width - postWidth)) / (postCount - 1), y, postWidth, height);
    }
}

/**
 * Viga en I horizontal: alma entre dos alas.
 * @param {object[]} shapes
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function horizontalBeam(shapes, x, y, width, height) {
    const flange = height * BEAM.flangeRatio;
    const web = height * BEAM.webRatio;
    rect(shapes, x, y, width, flange);
    rect(shapes, x, y + height - flange, width, flange);
    rect(shapes, x, y + (height - web) / 2, width, web);
}

/**
 * Viga en I vertical: alma entre dos alas.
 * @param {object[]} shapes
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function verticalBeam(shapes, x, y, width, height) {
    const flange = width * BEAM.flangeRatio;
    const web = width * BEAM.webRatio;
    rect(shapes, x, y, flange, height);
    rect(shapes, x + width - flange, y, flange, height);
    rect(shapes, x + (width - web) / 2, y, web, height);
}

/** Constructores de figuras por tipo de elemento (`kind` de las capas de `BACKGROUND`). */
export const SHAPE_BUILDERS = { tank, chimney, smokingChimney, pipe, structure, catwalk, horizontalBeam, verticalBeam };
