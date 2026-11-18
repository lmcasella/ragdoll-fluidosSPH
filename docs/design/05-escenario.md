# 5. Escenario

Código: `js/level.js` (`LEVEL`, `buildLevel`, `fillPool`), `js/camera.js`.

## 5.1 Mapa y cámara

- **Mundo de tamaño fijo** ✅: 56 × 32 m, en metros e independiente de la ventana. Definido como datos en `LEVEL`.
- **Geometría actual** ✅:
  - dos islas de piso (x 0–18 y 38–56, tope a y = 4);
  - el hueco central es la pileta;
  - paredes a los costados;
  - plataformas a varias alturas, cada una a ≤ 3,5 m de la anterior para que se alcancen saltando (el salto llega a ~4 m);
  - plataformas chicas sobre la pileta para cruzarla.
- **Aparición** ✅: J1 en x = 7,5 y J2 en x = 48,5. La altura sale de un rayo vertical desde el techo ([08-raycast](08-raycast.md)).
- **Cámara compartida** ✅: encuadra a los dos robots con margen (6 × 4 m), hace zoom según la distancia (máximo ×1,6), nunca muestra fuera del mapa y se suaviza en el tiempo.
- **Pendiente:**
  - mapa definitivo con puntos de armas (#25);
  - plataformas **cinemáticas** (#33);
  - plataformas de **piedra temporal** (lava + agua, #30).

**Limitación:** el build no expone `PreSolve`, así que no hay plataformas atravesables desde abajo. Todas son sólidas.

## 5.2 Pileta ✅

- **Agua:** SPH real en el hueco central (x 18–38, del fondo hasta y = 3), en un **sistema de partículas propio** Un robot que cae salpica.
  - ✅ #22: es el **agua del nivel**, compartido con la lluvia de la inundación. Radio **0,25 m** (`LEVEL.pool.radius`; 477 partículas en la pileta, medido) y `maxCount` = `LEVEL.flood.maxParticles` (5.500) al crearlo en `fillPool`. Se dibuja con radio **0,28 m** (decisión del usuario: no agrandar las partículas).
- **Sensor:** un sensor de Box2D cubre la pileta hasta y = 2,2. El robot que se hunde ahí queda **destruido** (vida 0, todo rojo) y pierde la ronda. Con la inundación **no se mueve** ([02-partida](02-partida.md#21-inundación--22)).
- **Disparos:** los sistemas de disparos y del agua del nivel no interactúan entre sí. Por eso las partículas de los disparos que caen al agua se eliminan; si no, la atravesarían.
  - ✅ #22: el corte es `y < max(pool.surface si x está sobre la pileta, nivel de la inundación)`. Con el mapa inundado, los disparos que entran al agua se eliminan en todo el ancho.
- **Inundación:** la lluvia de la muerte súbita cae sobre la pileta y la hace subir (#22, [02-partida](02-partida.md#21-inundación--22)).
