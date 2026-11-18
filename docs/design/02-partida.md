# 2. Loop de partida

Código: `js/round.js` (`Match`), integrado en `index.html`.

1. **Ronda** ✅: los robots aparecen en extremos opuestos del mapa. Gana el último que quede en pie.
2. **Fin de ronda** ✅: un robot pierde cuando su vida llega a 0 o cuando cae a la pileta ([05-escenario](05-escenario.md#52-pileta)). Al quedar uno solo:
   - 1,5 s de cámara lenta (×0,3);
   - un cartel con el ganador durante 3 s en total;
   - la ronda siguiente arranca sin recargar: se destruyen robots y disparos y se vuelve a aparecer.

   Si los dos caen a la vez, es empate y nadie suma.
3. **Partida** ✅: al mejor de 3 (gana quien llega a 2). El cartel final ofrece **revancha** con disparar (A / RT, Espacio, Enter). El HUD muestra las victorias como puntos y el número de ronda.
4. **Inundación (muerte súbita)** ✅ #22: a los 60 s de ronda empieza a **llover desde arriba**. El agua cae, se acumula sobre la pileta y va llenando el mapa desde abajo. Las plataformas bajas quedan bajo el agua, el agua daña por cortocircuito ([04-fluidos](04-fluidos.md#41-armas)) y la pelea se va hacia arriba. Es el uso masivo de partículas del juego; su costo está en [09-arquitectura](09-arquitectura.md#93-presupuestos-y-métricas). Detalle en [2.1](#21-inundación--22).

## 2.1 Inundación ✅ #22

Código: `js/flood.js` (`Flood`), datos en `LEVEL.flood` (`js/level.js`), reloj de ronda en `Match` (`js/round.js`).

> **🔨 #62:** la lluvia pasa al sistema líquido y se absorbe en un campo de alturas. El emisor deja de controlar el nivel: el caudal sale de `riseSpeed` y el nivel resulta de la conservación de la masa. Se borran el escurrido y la calibración de `density` ([14.7](14-agua.md#147-inundación-con-lluvia-absorbida)).

**Cómo sube el agua.** La lluvia se crea en el **mismo sistema de partículas que la pileta** (el "agua del nivel", radio 0,25 m). Como comparten sistema, las gotas chocan con el agua de la pileta y la hacen subir de verdad: no hay que simular el ascenso aparte. El nivel no se mide sobre las partículas: se **controla**. Una curva fija da el nivel objetivo según el tiempo de ronda y el emisor agrega gotas hasta que hay las necesarias para llenar ese nivel.

- **Nivel objetivo:** `nivel(t) = min(maxLevel, pool.surface + riseSpeed · (t − start))` para `t ≥ start`; antes, `pool.surface`.
- **Gotas necesarias:** `density × área libre entre pool.surface y el nivel`. El área libre a cada altura es el ancho del mapa menos los sólidos que la cruzan (sale de `LEVEL.solids`; las plataformas de 0,4 m casi no restan).
- **Emisión:** una vez por paso fijo, antes de `stepWorld`. Crea `min(caudal acumulado, gotas que faltan, lugar libre bajo el tope)` partículas en el techo (`emitY`), con velocidad hacia abajo. La x de cada gota sale de una secuencia de baja discrepancia (`x1 + frac(i · 0,618…) · ancho`): reparto parejo y determinista, sin `Math.random`, así se puede testear.
- **Charcos en plataformas altas:** la lluvia también cae sobre plataformas que el agua todavía no alcanzó. Las gotas de lluvia quietas (< 1 m/s) a más de 1 m sobre el nivel se eliminan ("escurren"). El controlador repone lo eliminado. Así el agua se junta abajo y las plataformas altas quedan secas.
- **Lo que daña es el agua real, no la curva**: el agua va entre 0,7 y 1,7 m por debajo de la curva mientras sube, porque las gotas caen desde 31,5 m. `Flood.surfaceAt(x)` da la superficie local: el percentil 90 de la altura de las partículas casi quietas (< 2 m/s) en la columna x ± 0,5 m (con menos de 3 partículas, no hay agua). El robot se moja si el **borde inferior** de alguna pieza (`lowestPoint()`, AABB de sus fixtures) está bajo la superficie en la x de su torso (ver cortocircuito en [04-fluidos](04-fluidos.md#cortocircuito-regla-compartida--22)). No usa callbacks por partícula; cuesta ~0,07 ms por frame.
- **Cómo se ve la lluvia** ✅ #44: las gotas en vuelo se dibujan como **trazos finos** orientados según su velocidad, no como pelotas; al caer al agua o quedar quietas vuelven a dibujarse como agua y se funden con ella. Medidas en [07-sph](07-sph.md#74-render).
- **Solo en juego:** fuera de `playing` (`Match.hazardsActive` en falso) el agua no moja y se apaga el estado mojado, para que nadie muera bajo el cartel de fin de ronda.
- **Reinicio:** `Flood.reset()` destruye toda el agua del nivel y vuelve a llenar la pileta, para que no queden charcos de rondas anteriores.
- **Sensor de la pileta:** **no se mueve.** Sigue cubriendo la pileta hasta `pool.killY` (2,2 m): hundirse en el hueco central destruye al robot aunque esté inundado. El agua sobre las islas y plataformas solo daña por cortocircuito, para que la muerte súbita empuje hacia arriba y no mate de golpe.
- **Fin garantizado:** `maxLevel` (15 m) supera a la plataforma más alta (13,4 m). Si nadie gana antes, el agua termina mojando a los dos.

**Valores de partida** (`LEVEL.flood`, se ajustan jugando en #27):

| Dato | Valor | Nota |
|---|---|---|
| `start` | 60 s | Tiempo de ronda en que empieza a llover |
| `riseSpeed` | 0,15 m/s | Islas (4 m) a los ~67 s, plataformas bajas (7,6 m) a los ~91 s, la más alta (13,4 m) a los ~129 s, tope a los 140 s (la curva; el agua real va 0,7–1,7 m atrás) |
| `maxLevel` | 15 m | Por encima de todas las plataformas |
| `emitY` | 31,5 m | Medio metro bajo el techo |
| `emitX1`, `emitX2` | 1 m, 55 m | Todo el ancho, sin tocar las paredes |
| `dropSpeed` | 8 m/s | Velocidad inicial hacia abajo |
| `maxRate` | 90 partículas/s | Tope del caudal; el necesario a 0,15 m/s es ~60/s |
| `density` | 6,3 partículas/m² | Agua en reposo con radio 0,25 m. **Calibrado** (18/11, Node, LiquidFun real): con 7,1 la superficie quedaba hasta +1,5 m sobre el nivel a 13,5 m; con 6,4 queda a −0,04…+0,3 m en 7,5, 10,5 y 13,5 m. **Recalibrado en #40** (19/11, 60 s de asentado) con las fuerzas y flags nuevas del agua del nivel: 6,3 queda a +0,44, +0,29 y −0,03 m a 7,5, 10,5 y 13,5 m. **No cumple la meta de −0,1…+0,3 m a 7,5 m** (el agua nueva comprime distinto según la profundidad: bajar `density` acerca los 7,5 m y aleja los 13,5 m; medidas en [07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)) |
| `drainHeight`, `drainSpeed` | 1 m, 1 m/s | Escurrido de charcos altos |
| `maxParticles` | 5.500 | Tope del sistema del agua del nivel (pileta + lluvia), `maxCount` |

**Reloj de ronda.** `Match` lleva `roundTime`: suma el `dt` real del frame solo en el estado `playing` y vuelve a 0 en cada `"reset"` (ronda nueva o revancha). Durante `roundOver` se congela: deja de subir el objetivo, el agua que cayó se sigue acomodando. `Flood` lee `match.roundTime`; `Match` no sabe nada de la inundación.

**`Flood.level` y `floodLevel()`.** La función pura `floodLevel(t)` devuelve el nivel de la curva: 3 m (`pool.surface`) hasta los 60 s. En cambio, el getter `Flood.level`, que usa el corte de disparos (y `Flood.surfaceAt`, que consume `DamageSystem.process`), vale **`-Infinity` mientras la inundación no empezó** (antes de los 60 s). Así la pileta, cuyo agua llega a 3 m, no moja a nadie antes de la muerte súbita.

**Reinicio.** Cada gota de lluvia lleva la marca **−1** en el buffer de `userData` (la pileta queda en 0). Es negativa para no chocar con los ids de disparo (1, 2, 3…) si más adelante los disparos pasan a este sistema ([07-sph](07-sph.md#72-sistemas-de-partículas)). `Flood.reset()` destruye **toda** el agua del nivel (lluvia y pileta, que pudo salpicar fuera del hueco), vuelve a llenar la pileta con `fillPoolWater` y pone en cero su contador y su caudal acumulado. Se llama desde `reiniciarRonda()` de `index.html`, que corre entre frames, fuera de todo callback. La marca sirve para contar y escurrir las gotas en `Flood.step`.

**Al jugador:**
- HUD: reloj de ronda arriba al centro; desde los 50 s, "Inundación en N"; desde los 60 s, "¡INUNDACIÓN!".
- Robot mojado: tinte cian intermitente en todas sus piezas mientras dure el estado; chispas eléctricas también, sea cual sea la fuente del mojado (✅ #18, [04-fluidos](04-fluidos.md#cortocircuito-regla-compartida--22)).
