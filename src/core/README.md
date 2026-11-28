# Índice de `src/core/`

Antes de escribir una cuenta, buscala acá. El detalle está en el docstring de cada función.

### math/scalar.js

| Nombre | Qué hace |
|---|---|
| `TAU` | Una vuelta completa, en rad. |
| `QUARTER_TURN` | Un cuarto de vuelta, en rad (la dirección "arriba" desde +X). |
| `GEOMETRY_TOLERANCE` | Tolerancia de comparaciones de geometría y alturas, en m. |
| `RELATIVE_TOLERANCE` | Tolerancia relativa para magnitudes que no son longitudes. |
| `NEGLIGIBLE_EXTENT` | Magnitud por debajo de la cual una longitud, área o altura se trata como nula. |
| `clamp` | Acota un valor a un intervalo. |
| `clampUnit` | Acota un valor a [0, 1]. |
| `lerp` | Interpolación lineal entre dos valores, sin acotar. |
| `inverseLerp` | Fracción en la que un valor cae entre dos extremos (inversa de `lerp`). |
| `signOr` | Signo de un valor, o un valor de respaldo si es 0 o NaN. |
| `signOrOne` | Signo de un valor; 1 si es 0 o NaN. |
| `wrapAngle` | Lleva un ángulo a (-π, π], en rad. |
| `shortestAngleDifference` | Giro más corto, con signo, entre dos ángulos, en rad. |
| `exponentialApproachFactor` | Fracción del camino a un objetivo que recorre un acercamiento exponencial, de 0 a 1. |

### math/vector2.js

| Nombre | Qué hace |
|---|---|
| `vectorLength` | Longitud de un vector 2D. |
| `distance` | Distancia entre dos puntos. |
| `normalize` | Vector de longitud 1 escrito en `out`; el nulo queda en (0, 0). |
| `dot` | Producto escalar de dos vectores 2D. |
| `cross` | Componente Z del producto vectorial; positivo si el segundo queda a la izquierda. |
| `rotateLocalToWorld` | Pasa un punto local de un cuerpo girado a coordenadas de mundo, en m. |

### math/geometry.js

| Nombre | Qué hace |
|---|---|
| `polygonArea` | Área de un polígono, en m², positiva si es antihorario. |
| `polygonCentroid` | Área y centroide de un polígono, escritos en `out`. |
| `clipPolygonByHalfPlane` | Recorta un polígono con un semiplano. |
| `clipSegmentToBand` | Estrecha el tramo de un segmento que queda dentro de una banda sobre un eje. |
| `intersectIntervals` | Recorta una lista de intervalos a un rango y descarta los vacíos. |
| `subtractIntervals` | Quita un tramo de una lista de intervalos, partiendo los que lo contienen. |
| `mergeBounds` | Agranda una caja para que también cubra otra. |

### math/numeric.js

| Nombre | Qué hace |
|---|---|
| `solveNewton` | Busca una raíz con el método de Newton. |
| `solveBisection` | Busca por bisección dónde una función creciente alcanza un valor. |
| `minmod` | Limitador de pendientes: la de menor módulo si coinciden en signo, 0 si no. |
| `sampleUniformGrid` | Interpola linealmente entre centros de celda de una grilla uniforme. |
| `piecewiseLinear` | Interpola una rampa de paradas (por ejemplo de color) canal por canal. |

### math/random.js

| Nombre | Qué hace |
|---|---|
| `createSeededRandom` | Generador pseudoaleatorio con semilla: misma semilla, misma secuencia, en [0, 1). |
| `hashToUnit` | Hash de un entero a [0, 1), para valores repetibles sin `Math.random`. |

### math/marchingSquares.js

| Nombre | Qué hace |
|---|---|
| `DENSITY_ISO_LEVEL` | Umbral de densidad que separa lo lleno de lo vacío (0,5). |
| `contoursOfGrid` | Anillos cerrados de una grilla de densidad (marching squares): externos antihorarios, agujeros horarios, en m. |

### math/polygonSimplify.js

| Nombre | Qué hace |
|---|---|
| `simplifyRing` | Simplifica un anillo cerrado con Douglas-Peucker y una tolerancia en m. |

### math/convexDecomposition.js

| Nombre | Qué hace |
|---|---|
| `decomposeConvex` | Parte un polígono con agujeros en piezas convexas de hasta N vértices (puente, ear clipping, Hertel-Mehlhorn). |

### math/ringNesting.js

| Nombre | Qué hace |
|---|---|
| `pointInPolygon` | Indica si un punto está dentro de un polígono (regla par-impar). |
| `assignHolesToOuters` | Reparte los agujeros de una grilla entre sus contornos externos: cada uno va al externo más chico que lo contiene. |

### physics/constants.js

| Nombre | Qué hace |
|---|---|
| `GRAVITY` | Aceleración de la gravedad, en m/s². |
| `WATER_DENSITY` | Densidad del agua, en kg/m³. |
| `KELVIN_OFFSET` | Diferencia entre kelvin y °C, en K. |
| `STEFAN_BOLTZMANN` | Constante de Stefan–Boltzmann, en W/(m²·K⁴). |

### physics/formulas.js

| Nombre | Qué hace |
|---|---|
| `mixtureViscosity` | Viscosidad de una mezcla de soluto y solvente, en Pa·s. |
| `kelvinFourthPower` | Temperatura en °C llevada a kelvin y elevada a la cuarta, en K⁴. |
| `radiativeHeatFlux` | Flujo neto de calor por radiación contra el ambiente, en W/m². |
| `limitTransfer` | Recorta una transferencia de energía a un máximo en módulo, conservando el signo, en J. |
| `fallTime` | Tiempo que tarda en caer una altura con velocidad vertical inicial, en s. |

### engine/box2d.js

| Nombre | Qué hace |
|---|---|
| `forEachFixture` | Recorre los fixtures de un cuerpo sin crear memoria nativa. |
| `fixtureBounds` | Escribe en `out` la caja de un fixture en el mundo, en m. |
| `forEachBody` | Recorre los cuerpos de un `Map` o arreglo. |
| `forEachWorldBody` | Recorre todos los cuerpos del mundo sin crear memoria nativa. |
| `boundsOfBody` | Escribe en `out` la caja que une los fixtures de un cuerpo, en m. |
| `boundsOfBodies` | Escribe en `out` la caja que une los fixtures de varios cuerpos, en m. |
| `BODY_TYPE` | Tipos de cuerpo de Box2D (`STATIC`, `KINEMATIC`, `DYNAMIC`), los valores de `b2BodyType`. |
| `MAX_POLYGON_VERTICES` | Máximo de vértices de un polígono de Box2D (8). |
| `PolygonFixtureBuilder` | Crea fixtures poligonales y cajas sin memoria nativa por llamada (`createPolygon`, `createBox`, `dispose`). |

### color.js

| Nombre | Qué hace |
|---|---|
| `COLOR_BYTES` | Bytes de un color RGBA en el buffer de color del motor. |
| `tintOf` | Tinte de PIXI (`0xRRGGBB`) a partir de tres canales de 0 a 255. |

### heap.js

| Nombre | Qué hace |
|---|---|
| `VECTOR_COMPONENTS` | Componentes de un vector 2D en los buffers de partículas del motor. |
| `wordIndexOf` | Índice de palabra de 4 bytes de un puntero del heap, para leer con `Box2D.HEAPF32`. |

### raycast.js

| Nombre | Qué hace |
|---|---|
| `Raycaster` | Raycast sobre el mundo de Box2D que devuelve el impacto más cercano, sin memoria nativa por rayo. |
| `getRaycaster` | Un `Raycaster` compartido por mundo. |

### fixedStep.js

| Nombre | Qué hace |
|---|---|
| `MAX_STEPS_PER_FRAME` | Tope de pasos de física por frame (2). |
| `consumeFixedSteps` | Pasos a correr en un frame y acumulador que queda; con el tope, descarta el exceso. |

### debug.js

| Nombre | Qué hace |
|---|---|
| `DEBUG` | Valores del monitor de física: promedio, topes de flechas y columnas, nombres de materiales. |
| `FLUID_MODES` | Modos de dibujo de los fluidos del menú de debug. |
| `DEBUG_ROWS` | Filas del menú de debug (estadísticas, fluidos y las capas de vectores y de terreno). |
| `relativeError` | Error relativo entre un valor medido y uno de referencia. |
| `Debug` | Estado y textos del menú y de las estadísticas del monitor de física. |
