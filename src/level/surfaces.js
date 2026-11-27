/**
 * Materiales de las plataformas firmes (`docs/design/13-arte.md` §13.2). Una fila por material: `id` es el número con que
 * el shader de `src/render/surfaceFilter.js` reconoce el material; `acidAttack` es la fracción de la materia del acero que
 * el ácido le saca al material por la misma cantidad de ácido gastado (0: no le hace nada); `baseColor` es el color del
 * material limpio y `wearColor` y `wearDarkColor` los del óxido o la mancha del desgaste, todos RGB de 0 a 1;
 * `patternSize` (m) es el lado del panel del acero, el grano del hormigón y el período del reflejo del vidrio; `alpha` es
 * la opacidad con que se dibuja y `edgeLighten` cuánto se aclara el borde hacia el blanco, de 0 a 1.
 */
export const SURFACES = {
    steel: {
        id: 1,
        acidAttack: 1,
        baseColor: [0.36, 0.42, 0.5],
        wearColor: [0.78, 0.36, 0.12],
        wearDarkColor: [0.34, 0.17, 0.09],
        patternSize: 1,
        alpha: 1,
        edgeLighten: 0.22,
    },
    concrete: {
        id: 2,
        acidAttack: 1 / 3,
        baseColor: [0.5, 0.47, 0.43],
        wearColor: [0.2, 0.18, 0.16],
        wearDarkColor: [0.12, 0.11, 0.1],
        patternSize: 0.15,
        alpha: 1,
        edgeLighten: 0.18,
    },
    glass: {
        id: 3,
        acidAttack: 0,
        baseColor: [0.55, 0.82, 0.92],
        wearColor: [0.55, 0.82, 0.92],
        wearDarkColor: [0.55, 0.82, 0.92],
        patternSize: 2,
        alpha: 0.45,
        edgeLighten: 0.45,
    },
};

/**
 * Material de un sólido: el de `solid.material` si lo declara y, si no, el que corresponde a su tipo: piso y pared de
 * hormigón, plataforma atravesable de vidrio y el resto de acero.
 * @param {{material?: string, kind?: string, oneWay?: boolean}} solid
 * @returns {keyof typeof SURFACES}
 */
export function surfaceOf(solid) {
    if (solid.material) return solid.material;
    if (solid.kind === "floor" || solid.kind === "wall") return "concrete";
    if (solid.oneWay) return "glass";
    return "steel";
}
