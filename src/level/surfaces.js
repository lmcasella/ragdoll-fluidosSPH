/**
 * Materiales de las plataformas firmes (`docs/design/13-arte.md` §13.2). Una fila por material: `id` es el número con que
 * el shader de `src/render/surfaceFilter.js` reconoce el material; `acidAttack` es la fracción de la materia del acero que
 * el ácido le saca al material por la misma cantidad de ácido gastado (0: no le hace nada); `baseColor` es el color del
 * material limpio y `wearColor` y `wearDarkColor` los del óxido o la mancha del desgaste (en la chapa de las rompibles,
 * el óxido que ya trae), todos RGB de 0 a 1; `patternSize` (m) es el lado del panel del acero, la separación entre
 * nervaduras de la chapa, el grano del hormigón y el período del reflejo del vidrio; `alpha` es la opacidad con que se
 * dibuja. La chapa (`plate`) es el material de las plataformas rompibles, que no pasan por el terreno. La madera (`wood`) es
 * el de las cajas de los ítems (`docs/design/04-fluidos.md` §4.2): su `patternSize` es el lado de la caja, su `wearColor` y
 * `wearDarkColor` son la madera quemada, y el shader la dibuja en el marco local de cada caja, no en el del mundo.
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
    },
    concrete: {
        id: 2,
        acidAttack: 1,
        baseColor: [0.5, 0.47, 0.43],
        wearColor: [0.2, 0.18, 0.16],
        wearDarkColor: [0.12, 0.11, 0.1],
        patternSize: 0.15,
        alpha: 1,
    },
    glass: {
        id: 3,
        acidAttack: 0,
        baseColor: [0.55, 0.82, 0.92],
        wearColor: [0.55, 0.82, 0.92],
        wearDarkColor: [0.55, 0.82, 0.92],
        patternSize: 2,
        alpha: 0.45,
    },
    plate: {
        id: 4,
        acidAttack: 1,
        baseColor: [0.42, 0.45, 0.48],
        wearColor: [0.62, 0.3, 0.12],
        wearDarkColor: [0.3, 0.15, 0.08],
        patternSize: 0.25,
        alpha: 1,
    },
    wood: {
        id: 5,
        acidAttack: 1,
        baseColor: [0.55, 0.36, 0.2],
        wearColor: [0.2, 0.12, 0.07],
        wearDarkColor: [0.05, 0.035, 0.03],
        patternSize: 0.7,
        alpha: 1,
    },
};

/**
 * Material de un sólido: el de `solid.material` si lo declara y, si no, el que corresponde a su tipo: piso y pared de
 * hormigón y el resto de acero. El vidrio solo aparece si el nivel lo declara.
 * @param {{material?: string, kind?: string}} solid
 * @returns {keyof typeof SURFACES}
 */
export function surfaceOf(solid) {
    if (solid.material) return solid.material;
    if (solid.kind === "floor" || solid.kind === "wall") return "concrete";
    return "steel";
}
