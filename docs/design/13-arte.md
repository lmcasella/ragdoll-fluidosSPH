# 13. Arte

Hasta tener sprites, todo se dibuja con formas geométricas y colores planos (J1 naranja, J2 celeste). Así el juego queda completo sin depender del arte. Sprites: #34.

**Estilo de referencia:** Unreal Tournament / Unreal Flash como inspiración (HUD angular, armas con brillo, colores de equipo). Los assets originales tienen copyright de Epic Games y la URL del juego es pública: hay que **dibujar o generar sprites propios** inspirados en ese estilo, o usar packs con licencia libre (por ejemplo, Kenney, CC0).

**Imágenes necesarias** (PNG con transparencia; tamaños a 40 px/m, conviene entregarlas al doble):

| # | Imagen | Uso | Tamaño aprox. |
|---|---|---|---|
| 1 | Robot: cabeza | Parte `body_1` | 16 × 16 px |
| 2 | Robot: pecho | `body_2` | 24 × 24 px |
| 3 | Robot: pelvis | `body_6` | 16 × 16 px |
| 4 | Robot: brazo superior | `body_13` | 8 × 16 px |
| 5 | Robot: antebrazo con arma | `body_3` | 32 × 8 px |
| 6 | Robot: muslo | `body_7_copy2` | 10 × 6 px |
| 7 | Robot: pierna | `body_7_copy` | 8 × 16 px |
| 8 | Robot: pie | `body_4` | 12 × 16 px |
| 9 | Variante de color para J2 | Mismo set teñido (o se tiñe por código) | — |
| 10 | Íconos de armas ×5 | Agua, ácido, lava, fuego, viento: puntos de aparición y rueda | 48 × 48 px |
| 11 | Rueda de armas | Fondo circular segmentado | 256 × 256 px |
| 12 | HUD | Barra de vida, tanque y contador de rondas | 256 × 48 px |
| 13 | Plataformas | Tile repetible de metal | 32 × 32 px |
| 14 | Fondo | Escenario industrial con capas (parallax opcional) | 1920 × 1080 px |
| 15 | Partículas de efecto | Chispa eléctrica y brillo de fuego | 16 × 16 px |

## 13.1 Fondo

Una planta industrial vista de lejos, dibujada por el juego (sin imágenes): cielo, chimeneas y tanques en el horizonte, cañerías y estructuras en el medio y vigas cerca. Son cuatro capas detrás del escenario y cada una se mueve con la cámara según su profundidad: la más lejana casi no se mueve y la más cercana acompaña bastante al escenario. El zoom también afecta menos a las capas lejanas.

- **Legibilidad:** el fondo es oscuro, desaturado y se funde con el cielo hacia lo lejano. Robots, plataformas y fluidos siempre contrastan más que cualquier capa.
- **Sin repetición evidente:** el contenido sale de un azar con semilla por tramo, así que el mismo lugar se ve siempre igual y dos tramos vecinos se ven distintos.
- **Altura (Infinito):** el fondo cambia por franjas de altura: abajo el piso de la planta, más arriba pasarelas y la parte alta de los tanques, y arriba de todo las bocas de las chimeneas con humo y más cielo. Las franjas se funden, sin cortes.
- **Costo:** el fondo no baja los fps de forma medible.

## 13.2 Materiales de las plataformas

Cada plataforma firme es de un material, y el material decide cómo se ve y cuánto le hace el ácido. Hay tres:

| Material | Dónde | Cómo se ve | Ácido |
|---|---|---|---|
| Acero | Plataformas, también las atravesables | Chapa gris azulada con paneles, remaches y rayado fino | Se corroe a la velocidad de la corrosión (§5.5) |
| Hormigón | Piso y paredes | Gris cálido, granulado, con manchas y bordes gastados | Se corroe igual que el acero |
| Vidrio | Solo donde el nivel lo pide | Celeste translúcido con un reflejo en diagonal y borde claro | No le hace nada |

- **El dibujo sigue al mundo:** la textura queda pegada a la plataforma, no a la pantalla, y no se repite a simple vista.
- **Desgaste:** donde el ácido mordió, el borde que queda muestra óxido (naranja y marrón sobre el acero, manchas oscuras sobre el hormigón) que se oscurece con el daño acumulado. Una plataforma nueva no tiene óxido.
- **Legibilidad:** el contorno de cada plataforma se sigue leyendo contra el fondo, y los materiales no compiten con los robots ni con los fluidos.
- **Costo:** los materiales no bajan los fps de forma medible: se dibujan en una sola pasada para todo el escenario.
