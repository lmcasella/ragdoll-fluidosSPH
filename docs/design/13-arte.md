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

Cada plataforma firme es de un material, y el material decide cómo se ve y cuánto le hace el ácido. Hay cuatro:

| Material | Dónde | Cómo se ve | Ácido |
|---|---|---|---|
| Acero | Plataformas, también las atravesables | Chapa gris azulada con paneles, remaches y rayado fino | Se corroe a la velocidad de la corrosión (§5.5) |
| Hormigón | Piso y paredes | Gris cálido, granulado, con manchas y bordes gastados | Se corroe igual que el acero |
| Vidrio | Solo donde el nivel lo pide | Celeste translúcido con un reflejo en diagonal | No le hace nada |
| Chapa | Plataformas rompibles | Chapa fina gris acero con un 40 % de óxido repartido a manchas y una nervadura cada 0,25 m, sin juntas de panel | Se corroe igual que el acero |

- **El dibujo sigue al mundo:** la textura queda pegada a la plataforma, no a la pantalla, y no se repite a simple vista.
- **Desgaste:** donde el ácido mordió, el borde que queda muestra óxido (naranja y marrón sobre el acero, manchas oscuras sobre el hormigón) que se oscurece con el daño acumulado. Una plataforma nueva no tiene óxido.
- **Sin contorno:** el borde no lleva una línea clara. Se lee por el bisel con la luz (de 8 cm o 3 px de ancho, lo que sea mayor) y por una oclusión suave: el material se oscurece hasta un 35 % en los 6 cm junto al borde de abajo y de los costados.
- **Sin costuras:** dos tramos vecinos del mismo material se ven como una sola pieza, sin bisel ni oscurecido en la unión. Las juntas de panel del acero siguen al mundo, no a los tramos.
- **Bordes gastados:** el borde visible no es un rectángulo perfecto: un ruido suave pegado al mundo come hasta 4 cm en los cantos expuestos y hasta 8 cm en las esquinas, como chapa y hormigón gastados. Es solo visual, la física no cambia.
- **Grietas de la chapa:** las líneas oscuras y finas crecen con la cuenta de rotura de la plataforma, desde una chapa entera hasta una muy agrietada; la vibración antes de romperse sigue igual.
- **Legibilidad:** el borde de cada plataforma se sigue leyendo contra el fondo por el bisel y la oclusión, y los materiales no compiten con los robots ni con los fluidos.
- **Costo:** los materiales no bajan los fps de forma medible: se dibujan en una sola pasada para todo el escenario.
- **Madera (cajas de ítems, §4.2):** marrón cálido con vetas a lo largo de cada tabla, listones más oscuros en el marco y una diagonal. A diferencia de las plataformas, el dibujo sigue a la caja, no al mundo; la luz sí es la del escenario. El ácido y la lava la oscurecen como madera quemada.

## 13.3 Luz

La escena tiene una luz clave fuerte, cálida y algo lateral que baja desde arriba a la izquierda, un relleno frío suave desde el lado contrario (sin brillo especular) y poco aire, y luces que se mueven: la lava y el ácido iluminan lo que tienen cerca.

- **Relieve:** las plataformas tienen volumen: el borde está biselado, las juntas del acero son canaletas, los remaches sobresalen y el hormigón tiene grano. La luz base marca ese relieve aunque no haya fluidos, y con ella sola el grano, el rayado y los remaches ya se ven (brillo del acero marcado, poco aire y luz clave fuerte), y cada luz cercana lo ilumina desde su lado.
- **Lava:** luz naranja intensa con alcance de unos 6 m, que cae con la distancia. Un charco de lava ilumina la parte de abajo de la plataforma de arriba y la pared de al lado.
- **Ácido:** luz verde tenue con alcance de unos 3 m.
- **Fondo:** las capas cercanas del fondo reciben la luz de la lava y del ácido, sin relieve; las lejanas casi no. Todas reciben la luz clave como un degradé vertical (más claras arriba) y una niebla que aclara más cuanto más lejos está la capa, para separar los planos sin tocar lo que dibujan.
- **Robots:** reciben la misma luz que las plataformas (§13.4). La lava y el ácido los alumbran de verdad: cerca de ellos el robot se ve teñido de su color, sin que la luz base borre ese efecto; el color del jugador se sigue leyendo.
- **Luz de cada robot:** cada robot es una luz puntual del color de su jugador (intensidad 0,9, alcance 5 m) en su cabeza, y es la única luz con sombras, como las luces 2D de Unity.
- **Sombras:** lo que tapa la luz son las plataformas, el terreno y las cajas; los robots y los líquidos no la tapan. Donde un colisionador se interpone entre un píxel y la luz de un robot, esa luz no llega (penumbra suave); la superficie de la plataforma que da hacia la luz sí la recibe. Un robot recibe la sombra de las plataformas y las cajas respecto de la luz del otro. La lava y el ácido iluminan como siempre, sin sombras. La luz clave y el relleno no proyectan sombra.
- **Ambiente:** el entorno es algo más oscuro (aire de 0,12 y luz clave al 80 % de antes) para que se noten las luces de los robots, la lava y el ácido.
- **Uso:** el fondo, las plataformas, las cajas, los robots y el agua leen la misma luz ya con sombras; en plataformas y robots el relieve la modula (55 % más 45 % según cuánto mira la superficie a la luz más fuerte).
- **Cantidad:** se juntan los fluidos cercanos en una sola luz por zona, con un tope de 8 luces por pantalla, robots incluidos; una gota suelta no ilumina.
- **Costo:** un dibujo del nivel como silueta y un pase de luz por frame, ambos a media resolución del canvas; solo los dos robots marchan 16 pasos por píxel.

## 13.4 Robots

Los robots son de metal pintado con el color de su jugador, sin sprites: las mismas piezas de hoy con volumen y luz.

- **Pintura:** cada pieza es del color del jugador, un poco más oscura y satinada; en los bordes la pintura está gastada y asoma el acero gris de las plataformas.
- **Relieve:** cada pieza tiene el borde biselado, y la unión entre dos piezas se ve como una junta oscura, no como un trazo blanco.
- **Luz:** la luz base marca el relieve y un brillo metálico chico; la lava y el ácido cercanos los iluminan de su color (§13.3).
- **Legibilidad:** el color del jugador sigue siendo lo que más se ve del robot. El destello rojo del golpe y el tinte celeste del mojado se ven igual que hoy.
- **Costo:** no baja los fps de forma medible: una sola pasada para todos los robots.
