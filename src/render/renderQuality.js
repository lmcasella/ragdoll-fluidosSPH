/**
 * Calidad de dibujo de PIXI. `filterResolution` es la resolución de los filtros de materiales, robots, líquidos y agua del
 * nivel, como fracción de la del canvas: con menos de 1 cada filtro rellena menos píxeles y la GPU integrada tarda menos
 * (el costo de los filtros es de relleno). Es el único lugar donde se fija, para que pueda configurarse desde un solo punto.
 */
export const RENDER_QUALITY = { filterResolution: 0.75 };
