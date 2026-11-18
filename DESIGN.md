# GDD — ragdoll-fluidosSPH

Documento de diseño del juego (GDD) para la materia Simulación 1 (UNAHUR). Es un documento vivo.

- **Estado:** marca qué está hecho (✅), qué está diseñado y falta construir (🔨) y qué es una propuesta sin acordar (💬).
- **Valores:** los números son puntos de partida para ajustar jugando.
- **Verificación:** lo marcado como *verificado* se probó contra el build de LiquidFun que usamos (`vendor/liquidfun.js`).

## 1. Concepto

**Pelea 1 contra 1 de robots ragdoll en un escenario de plataformas con verticalidad, donde las armas son fluidos.**

Dos robots con ragdoll activo se disparan agua, ácido, lava, fuego y viento, y también se pegan a mano. Los fluidos son partículas SPH de verdad: salpican, se acumulan, empujan, se pegan y reaccionan entre sí. Los robots reaccionan como cuerpos físicos que intentan mantenerse en pie, así que caen, se tambalean y se empujan. Debajo del mapa hay una pileta de agua: caer ahí destruye al robot.

**Pilares**

1. **La física es el juego.** Cada mecánica sale de la simulación, no de animaciones armadas: el daño viene de contactos reales, el empuje de impulsos reales y los efectos de fluidos de partículas reales.
2. **Fluidos con personalidad.** Cada fluido se comporta distinto, tanto en lo físico como en lo táctico, y se combinan entre sí (lava + agua = piedra y vapor).
3. **Legible y caótico.** Lo que pasa tiene que entenderse de un vistazo (destello rojo en la parte golpeada, chispas cuando un robot se moja, el viento visible), aunque el resultado sea caótico.
4. **Partidas cortas, cero instalación.** Rondas de 1 a 2 minutos en el navegador, dos jugadores en la misma pantalla.

**Referencias:** Gang Beasts y Human: Fall Flat (ragdoll activo), Stick Fight (1v1 con física), Noita (simulación de materiales como mecánica).

## 2. Cómo cumple con la materia

La materia pide un juego web con URL pública que implemente **al menos dos unidades** "con sentido y coherencia". Este proyecto usa tres, y cada una con un rol central en el juego, no decorativo:

| Unidad | Qué usamos | Dónde se ve en el juego |
|---|---|---|
| **Box2D** | Ragdoll activo con motores, eventos de contacto, sensores, cuerpos cinemáticos, filtros de colisión, paso fijo | Robots, golpes, daño por impacto, empujones, plataformas móviles (§4, §7.1) |
| **Fluidos / SPH** | LiquidFun: tipos de partícula, grupos, dos sistemas (líquidos y gases), acople bidireccional con cuerpos, contactos partícula↔cuerpo y partícula↔partícula, render metaball | Las cinco armas, los peligros del mapa, la pileta inferior, las reacciones entre fluidos (§5, §7.2) |
| **Raycast** | `world.RayCast` con callbacks (más cercano, ignorar al que dispara, cortar en línea de visión), rayos en abanico, rayos desde un centro | Mira láser, golpe melee, detección de piso, arco eléctrico, explosión de vapor (§7.3) |

En la defensa oral mostraremos el costo de cada técnica con un panel de métricas (§8.3).

## 3. Loop de partida 🔨

1. **Ronda:** los robots aparecen en extremos opuestos del mapa. Gana el último que quede funcionando.
2. **Fin de ronda:** un robot pierde la ronda cuando su vida llega a 0 o cuando cae a la pileta inferior. Para dejar ver el final hay unos 2 segundos de cámara lenta.
3. **Partida:** al mejor de 3 rondas (💬). La pantalla de resultado ofrece revancha. Todo se reinicia sin recargar la página: se destruyen las instancias y las partículas y se vuelven a crear.
4. **Inundación (muerte súbita):** a los 90 s empieza a **llover desde arriba**: emisores en el techo sueltan agua que cae, se acumula y va llenando el mapa desde abajo. Las plataformas bajas quedan bajo el agua, el agua daña a los robots (cortocircuito, §5.1) y la pelea se va hacia arriba hasta que alguien cae. Es el uso masivo de partículas del juego: su costo está medido en §8.3.

## 4. Robots

### 4.1 Movimiento

| Acción | Hoy | Diseño |
|---|---|---|
| Caminar | ✅ 6 m/s fijando la velocidad de la raíz | Igual. Se puede ajustar la aceleración para más inercia |
| Saltar (dirección arriba) | ✅ por velocidad vertical baja | 🔨 Detección de piso por raycast (§7.3). Hoy se puede saltar en la cima del salto, cuando la velocidad vertical es cerca de 0 |
| Girar | ✅ se vuelve a generar el ragdoll espejado | Igual. RagImporter no permite espejar una instancia viva |
| Apuntar | ✅ el brazo del arma rota con el hombro | Igual, más la mira láser (§7.3) |

### 4.2 Golpe melee 🔨

- **Acción:** botón propio. Reproduce el clip `punch`, que ya viene en el robot.
- **Detección del golpe:** en la ventana activa del golpe, un abanico de 3 rayos sale desde el hombro en la dirección del brazo, con alcance de 0,9 m. El primer cuerpo enemigo que tocan recibe el golpe (§7.3).
- **Efecto:** 8 de daño a esa parte (× multiplicador) y un impulso de 4 N·s en el punto de impacto, en la dirección del rayo. Con eso se empuja al rival: hacia la pileta, contra una pared o fuera de una plataforma.
- **Cadencia:** 0,5 s entre golpes.

### 4.3 Daño 🔨

**Una sola barra de vida (100)**, pero el daño entra por partes del cuerpo:

| Parte | Multiplicador |
|---|---|
| Cabeza | ×1,5 |
| Torso y pelvis | ×1 |
| Brazos y piernas | ×0,75 |

**Fuentes de daño:**

| Fuente | Cálculo | Técnica |
|---|---|---|
| Fluido que toca una parte | Por partícula, según el fluido (§5) | Contacto partícula↔cuerpo (*verificado*: requiere la flag `1 << 14`) |
| Golpe melee | 8 × multiplicador | Raycast (§4.2) |
| Impacto fuerte (caída, choque contra una pared, ser lanzado) | `(v − 4 m/s) × 2` si la velocidad de acercamiento supera 4 m/s | `BeginContact` (§7.1) |
| Pileta inferior | Destrucción inmediata | Sensor y partículas (§6.2) |

**Feedback de daño:** la parte golpeada se pone **roja** y vuelve a su color original en **1 s**. Cada pieza de render guarda el momento del último golpe y se dibuja con `lerp(rojo, colorBase, t)`. Un golpe nuevo reinicia el fundido.

**Extremidad inutilizada** (💬): si una extremidad acumula mucho daño de ácido, su articulación pierde fuerza y queda colgando. Se implementa con el override `strength` de `setJointAngle`. No se puede romper el joint: el contrato de RagImporter no permite que el juego destruya joints de una instancia.

### 4.4 Empujar

Los robots chocan entre sí (cada instancia colisiona con las demás). Además del contacto al caminar, empujan:
- el golpe melee, con su impulso;
- el viento (§5);
- los fluidos densos, porque transfieren cantidad de movimiento al cuerpo (acople bidireccional de LiquidFun).

## 5. Fluidos

### 5.1 Armas

**Recogida e inventario:**

- **Arranque:** cada robot empieza la ronda **solo con el golpe melee**.
- **En el mapa:** las armas están en **puntos de aparición** repartidos por el escenario. Un arma recogida reaparece en su punto a los 15 s.
- **Recoger:** al tocar un arma con el cuerpo (sensor de Box2D), se suma al inventario con su tanque lleno. Si ya la tenía, el tanque se rellena.
- **Elegir:** con una **rueda de armas**. Al mantener el botón de arma, se abre un círculo con las armas del inventario alrededor del robot; se elige con la dirección (teclas o stick) y al soltar queda equipada. Mientras la rueda está abierta, el juego sigue corriendo.
- **Tanque:** cada arma tiene uno que se gasta al disparar y **no se recarga**: hay que volver a recogerla. Así se recorre el mapa y se disputa el control de los puntos de aparición.

**Las armas:**

| Fluido | Implementación LiquidFun | Comportamiento | Efecto en el robot |
|---|---|---|---|
| **Agua** | Sistema líquido, `b2_waterParticle` | Chorro rápido que salpica y se acumula en charcos | **Cortocircuito:** el robot mojado suelta **chispas eléctricas** y **pierde vida**: 3 por segundo mientras tenga agua encima y 3 s más después de secarse. Si dos robots mojados quedan cerca, salta un arco eléctrico (§7.3) |
| **Ácido** | Sistema líquido, `b2_waterParticle` con baja viscosidad | Rápido, se escurre por las superficies | Corroe: 2 de daño por partícula, que se consume. Debilita la extremidad tocada (§4.3) |
| **Lava** | Sistema líquido, `b2_viscousParticle \| b2_tensileParticle` | Pesada, pegajosa, forma gotas | Quema: 0,5 de daño por segundo por cada parte en contacto. No se consume: hay que sacársela de encima |
| **Fuego** | Sistema de **gases** (gravedad −0,3, vida 0,6 s) | Lanzallamas de corto alcance (unos 3 m). Sube y se apaga solo | 0,3 de daño por partícula y por paso de contacto. Seca el estado *mojado* |
| **Viento** | Sistema de **gases** (gravedad 0, vida 1,2 s), con velocidad escrita en cada paso | Ráfaga visible como estelas blancas semitransparentes | **Sin daño.** Empuja por transferencia de cantidad de movimiento. Sirve para tirar al rival de una plataforma o a la pileta |

**¿El fuego es un fluido?** Lo modelamos como un **fluido gaseoso**. Es SPH igual que los líquidos, pero en un segundo sistema de partículas con gravedad negativa (sube) y tiempo de vida corto (se extingue). Es correcto desde lo físico, porque SPH simula fluidos en general, no solo líquidos, y además muestra un uso distinto del motor. El viento usa el mismo sistema.

**El viento como impulso:** LiquidFun no tiene una "fuerza de viento". La ráfaga es un grupo de partículas sin gravedad cuya velocidad se escribe en cada paso (*verificado*: escribir el buffer de velocidad persiste). Al tocar un cuerpo le transfieren cantidad de movimiento como cualquier fluido. Las partículas en sí se ven, así que el empuje se entiende de un vistazo.

### 5.2 Peligros del mapa

| Peligro | Implementación | Efecto |
|---|---|---|
| **Charcos de miel** | Grupos `b2_viscousParticle` al colocar el nivel | Velocidad ×0,5 y salto ×0,5 mientras se esté en contacto |
| **Goteo de ácido** | Emisor periódico desde el techo | Fuerza a moverse |
| **Ventiladores** | Emisor de viento hacia arriba | **Ascensor de aire**: lleva al robot a plataformas altas. Sirve para la verticalidad |
| **Cascada de lava** (💬) | Emisor continuo | Corta el mapa; se puede apagar con agua (§5.3) |
| **Gel elástico** (💬) | Grupo `b2_elasticParticle` | Trampolín deformable |
| **Pileta inferior** | Agua al fondo del mapa | Caer = robot destruido (§6.2) |

### 5.3 Reacciones entre fluidos 🔨

Las reacciones se detectan con contactos **partícula↔partícula** (`BeginParticleContact`). Para eso los fluidos que reaccionan comparten el sistema líquido y se identifican por color o por flags.

| Reacción | Resultado |
|---|---|
| Lava + agua | La lava se vuelve **piedra**: pasa a `b2_wallParticle`, que es estática, y se pinta gris. Aparece una nube de **vapor** en el sistema de gases. Así se forman **plataformas temporales** que se rompen con el tiempo |
| Fuego + agua | Se apagan los dos y queda vapor |
| Fuego + miel | La miel se vuelve **caramelo**: más viscosa y quema poco (💬) |
| Ácido + agua | El ácido se diluye y pierde daño (💬) |

**Explosión de vapor:** cuando reacciona mucha lava de una vez, se lanzan rayos desde el centro y solo se empuja a los cuerpos con línea de visión directa. Las paredes protegen (§7.3).

## 6. Escenario

### 6.1 Mapa y cámara 🔨

- **Mundo de tamaño fijo en metros** (unos 60 × 30 m), independiente de la ventana. Hoy el escenario depende del tamaño de la pantalla.
- **Cámara compartida:** encuadra a los dos robots con margen, hace zoom según la distancia entre ellos y se limita a los bordes del mapa. Es un sidescroller con verticalidad: plataformas a varias alturas, ventiladores para subir, ninguna zona segura permanente.
- **Plataformas:**
  - estáticas: ✅ ya hay 5 en la rama de plataformas;
  - **cinemáticas** que se mueven en un recorrido: muestran ese tipo de cuerpo de Box2D;
  - **de piedra temporal**: lava + agua.

**Limitación:** el build no expone `PreSolve`, así que no hay plataformas atravesables desde abajo. Todas son sólidas, y eso hay que tenerlo en cuenta al ubicarlas.

### 6.2 Pileta inferior 🔨

- Agua SPH real al fondo del mapa. Un robot que cae salpica.
- Un **sensor** de Box2D cubre la pileta: el robot que entra pierde la ronda, con chispas y la explosión del cortocircuito.
- Es donde se acumula la lluvia de la inundación, que la hace subir (§3).
- Presupuesto aproximado de 1500 partículas, con el ancho limitado al mapa.

## 7. Uso técnico de los tres conceptos

### 7.1 Box2D (LiquidFun = Box2D v2)

La materia usa Phaser Box2D (v3, API por ids). Nosotros usamos LiquidFun, que es Box2D v2 con API de objetos. Equivalencias:

| Concepto de la materia | Nosotros |
|---|---|
| `b2World_Step` + acumulador | `stepWorld` de RagImporter: 1/60 s en 8 subpasos ✅ |
| Ragdoll activo: revolute con motor y límites | RagImporter: control PD de cada articulación hacia el clip, balance de la raíz ✅ |
| `groupIndex` negativo / filtros | RagImporter filtra el auto-choque ✅ |
| Eventos `begin` / `hit` con `approachSpeed` | `JSContactListener.BeginContact`: se juntan los contactos durante el paso y el daño se aplica después (la "regla de oro" de la materia). La velocidad de acercamiento se calcula con las velocidades relativas en el punto de contacto (no hay `PostSolve` en el build) |
| Sensores (`isSensor`) | Pileta inferior y zonas de muerte |
| Cuerpos cinemáticos | Plataformas móviles |
| Impulsos (`ApplyLinearImpulse`) | Golpe melee, explosiones |

### 7.2 Fluidos / SPH (LiquidFun)

- **Modelo:** LiquidFun es una variante de SPH. Arma pares de partículas a menos de un diámetro con peso `w = 1 − d/D` y calcula la presión como `max(0, η(w − w₀))`. Los tipos de partícula (water, viscous, tensile, elastic, wall) agregan términos de fuerza o restricciones. Esto se explicará en la defensa, junto con su relación con el SPH de doble densidad de la materia.
- **Dos sistemas de partículas** (*verificado*):

  | Sistema | Contenido | Gravedad | Tiempo de vida |
  |---|---|---|---|
  | Líquidos | Agua, ácido, lava, miel | 1 | Ilimitado |
  | Gases | Fuego, viento, vapor | Negativa o 0 | Corto (*verificado*) |

- **Acople bidireccional:** los fluidos empujan cuerpos y los cuerpos desplazan fluidos.
- **Contactos partícula↔cuerpo** (`BeginParticleBodyContact`, *verificado*): daño por parte del cuerpo y estado *mojado*.
- **Contactos partícula↔partícula:** reacciones entre fluidos (§5.3).
- **Escritura directa de buffers:** viento y cambios de flags en las reacciones.
- **Render:** hoy son metaballs con un filtro SVG (desenfoque más umbral). 🔨 Se reemplazaría por la técnica de la materia: acumular kernels en una textura y aplicar un shader con umbral (`metaball.frag.glsl`), con un color por fluido y brillo propio en lava y fuego.

### 7.3 Raycast

Se usa `world.RayCast` con `JSRayCastCallback` (*verificado*). El valor que devuelve el callback define el modo, como enseña la materia:

| Valor de retorno | Modo |
|---|---|
| `fraction` | El impacto más cercano |
| `-1` | Ignorar esa forma, por ejemplo el propio robot |
| `0` | Cortar: solo interesa si hay línea de visión |

| Uso | Rayos | Detalle |
|---|---|---|
| **Mira láser** | 1 por jugador y frame | Desde el arma hasta el primer impacto, ignorando al propio robot. Se dibuja como línea con un punto al final: muestra a dónde va el disparo |
| **Golpe melee** | 3 en abanico durante la ventana del golpe | El más cercano define parte, punto y normal del impacto (§4.2) |
| **Detección de piso** | 2 por jugador y paso (uno por pie) | 0,15 m hacia abajo. Habilita el salto solo apoyado y da la normal del piso. Reemplaza la heurística de velocidad |
| **Arco eléctrico** | 1 por par de robots mojados cada 0,2 s | Si hay línea de visión a menos de 2,5 m, salta un arco con daño y chispas. Las paredes lo bloquean |
| **Explosión de vapor** | 32 desde el centro | Empuja solo a lo que tiene línea de visión directa (patrón de "explosión que respeta obstáculos" de la materia) |

Costo: 10 a 20 rayos por frame en lo normal y unos 50 en picos. Cada rayo es O(log n) sobre el árbol de AABBs (*broad phase*) de Box2D. En la defensa se mide con el panel de §8.3.

## 8. Arquitectura y rendimiento

### 8.1 Hoy ✅

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Escenario, disparos, daño, render, loop |
| `js/ActiveRagdoll.js` | Jugador: vida, miel, movimiento, mira, clips |
| `js/Input.js` | Teclado por jugador y Gamepad API |
| `lib/` | RagImporter, copiado de ragassembler2d |
| `assets/*.rag.json` | Rigs (robot en uso) |
| `tests/` | Tests de humo, que corre el CI antes de cada deploy |

### 8.2 Propuesta 🔨

`index.html` concentra demasiado. Propuesta de módulos en `js/`:

| Módulo | Responsabilidad |
|---|---|
| `world.js` | Mundo, paso y listeners |
| `fluids.js` | Sistemas, armas, reacciones |
| `damage.js` | Contactos → daño → destello |
| `raycast.js` | Utilidades de rayos |
| `camera.js` | Encuadre |
| `round.js` | Loop de partida |
| `render.js` | Dibujo |
| `level.js` | Datos del mapa |

### 8.3 Presupuestos y métricas

- **Memoria:** el heap de LiquidFun es **fijo de 16 MiB**. Cada `new Box2D.*` temporal se libera con `Box2D.destroy`. Se fija un tope por sistema con `maxCount`. Con 20.000 partículas todavía entra en el heap (medido).
- **Tiempo:** un frame a 60 FPS dura 16,6 ms. La meta es que la física use como máximo unos 8 ms y deje el resto para el render.

**Benchmark** (medido el 18/11 en Node 24 con el mismo build; agua en reposo dentro de una caja de 60 m):

| Partículas | 1 paso por frame | 8 subpasos por frame (lo que usa `stepWorld`) |
|---|---|---|
| 2.000 | 0,5 ms | 2,0 ms |
| 5.000 | 0,9 ms | 4,5 ms |
| 10.000 | 1,2 ms | 8,8 ms |
| 20.000 | 1,9 ms | 14,4 ms |

**Lectura:**
- El costo crece casi lineal con N. LiquidFun ordena las partículas por celda y solo arma pares entre vecinas, así que cada partícula se compara con un número acotado de vecinas.
- El factor que más pesa son los **8 subpasos**. Los exige RagImporter para que los ragdolls sean estables, pero las partículas no los necesitan.
- Con 8 subpasos el techo razonable es de **unas 8.000–10.000 partículas** en total.

**Optimizaciones previstas para la inundación** (en orden; cada una se mide con el panel de métricas):

1. **Partículas más grandes para la inundación.** Un sistema propio de radio 0,25 m llena el mismo volumen con unas 2,8 veces menos partículas que uno de 0,15 m. Por ejemplo, 10 m de agua en un mapa de 60 m son unas 2.400 partículas en lugar de 6.700.
2. **Simular las partículas con menos frecuencia.** Pausar el sistema de la inundación (`SetPaused`) en parte de los subpasos. Exige compensar el paso de tiempo; hay que probar si se ve bien.
3. **Agua que se asienta.** Las partículas del fondo que llevan tiempo quietas se reemplazan por un bloque de agua estático, que es un rectángulo con un sensor. Solo la capa de arriba sigue siendo SPH (híbrido, como en la materia: "cuándo usar qué").
4. **Render eficiente.** Hoy cada partícula es un `arc()` en Canvas 2D con un filtro SVG, y eso no escala a miles. Se pasa a dibujar las partículas en un buffer de menor resolución, o en la GPU con PIXI, que ya está cargado.

**Respuesta corta:** sí se puede, y está bueno para la defensa porque muestra el problema de rendimiento y cómo lo resolvemos con mediciones.

- **Panel de métricas** (F3): partículas por sistema, ms de paso y de render, rayos por frame, contactos partícula↔cuerpo por paso y FPS. Lo exige la defensa (Big O y benchmarks).

## 9. Controles

Movimiento y disparo ✅ ya implementados. Faltan el golpe y la rueda de armas 🔨, que reemplaza las teclas 1/2/3 y la necesidad del teclado numérico:

| | Mover | Saltar | Disparar | Golpe 🔨 | Rueda de armas 🔨 |
|---|---|---|---|---|---|
| J1 | A / D | W | Espacio | F | Mantener Q y elegir con WASD |
| J2 | ← / → | ↑ | Enter | Shift derecho | Mantener Ctrl derecho y elegir con flechas |
| Gamepad | stick izquierdo / cruceta | arriba | A / RT | X | Mantener LB y elegir con el stick |

## 10. Cronograma

**Fechas:**
- **Martes 24/11:** entrega. El juego tiene que estar cerrado y funcionando en la URL pública.
- **Martes 1/12:** presentación frente a los compañeros.

**Prioridad:** primero el juego completo, después los detalles. Cada día termina con algo jugable mergeado en `main`, que se despliega solo.

| Día | Objetivo | Incluye |
|---|---|---|
| **Mié 18** | Infraestructura | Mergear el deploy y configurar Pages (§13). Mergear plataformas y GDD |
| **Jue 19** | Mundo y combate base | Mundo de tamaño fijo y cámara compartida. Piso y mira láser por raycast. Daño por parte con destello rojo. Daño por impacto |
| **Vie 20** | Partida completa | Loop de rondas (al mejor de 3, revancha sin recargar). Golpe melee. Pileta inferior con sensor |
| **Sáb 21** | Armas | Puntos de aparición, inventario, rueda de armas y tanques. Sistema de gases: fuego y viento. Agua con cortocircuito y chispas |
| **Dom 22** | Escenario e inundación | Mapa definitivo con verticalidad, miel y ventiladores. Inundación desde arriba con las optimizaciones de §8.3 |
| **Lun 23** | Cierre | Render eficiente de partículas, balance, bugs, pruebas con dos jugadores. **Congelar funcionalidades** |
| **Mar 24** | **Entrega** | Solo arreglos. Verificar el deploy |
| **25/11 → 1/12** | Pulido y defensa | Panel de métricas y benchmarks. Sprites. Reacciones lava + agua. Arco eléctrico. Explosión de vapor. Shader metaball. Sonido (💬). Ensayo de la presentación |

**Si algo se atrasa, se recorta en este orden** (se mueve después del 24):
1. Reacciones entre fluidos.
2. Arco eléctrico.
3. Ventiladores.
4. Viento como arma.

Lo mínimo para entregar:
- rondas completas;
- melee;
- tres armas que se recogen;
- inundación;
- pileta inferior;
- raycast de piso, mira y golpe.

**Reparto sugerido** (💬): una persona en combate y partida (robots, daño, rondas, melee, raycast) y otra en fluidos y escenario (armas, gases, inundación, mapa, render). Así cada una toca mayormente sus propios archivos (§8.2) y hay menos conflictos de merge.

## 11. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Daño del agua | El robot mojado pierde vida por cortocircuito, con chispas visibles (§5.1) |
| Armas | Se recogen en el mapa, se guardan en el inventario y se eligen con una rueda (§5.1) |
| Muerte súbita | Lluvia desde arriba que inunda el mapa (§3). Costo medido en §8.3 |
| Fuego | Cuenta como fluido gaseoso: SPH en un sistema con gravedad negativa (§5.1) |

## 12. Preguntas abiertas

1. **Fuego amigo:** ¿un robot se daña con sus propios fluidos? Hoy sí.
2. **Plataformas atravesables desde abajo:** el build no lo permite (sin `PreSolve`). ¿Lo aceptamos?
3. **Sonido:** es otra unidad de la materia. ¿Lo sumamos después de la entrega?

## 13. Arte (placeholders)

Hasta tener sprites, todo se dibuja con formas geométricas y colores planos. Así el juego queda completo sin depender del arte.

**Estilo de referencia:** Unreal Tournament / Unreal Flash como inspiración (HUD angular, armas con brillo, colores de equipo). **Ojo:** los assets originales de Unreal Tournament tienen copyright de Epic Games. La URL del juego es pública, así que hay que **dibujar o generar sprites propios inspirados en ese estilo**, o usar packs con licencia libre (por ejemplo, de Kenney, CC0). No copiar los archivos del juego.

**Imágenes necesarias** (PNG con transparencia; tamaños a 40 px/m):

| # | Imagen | Uso | Tamaño aprox. |
|---|---|---|---|
| 1 | Robot: cabeza | Sprite de la parte `body_1` | 16 × 16 px |
| 2 | Robot: pecho | `body_2` | 24 × 24 px |
| 3 | Robot: pelvis | `body_6` | 16 × 16 px |
| 4 | Robot: brazo superior | `body_13` | 8 × 16 px |
| 5 | Robot: antebrazo con arma | `body_3` | 32 × 8 px |
| 6 | Robot: muslo | `body_7_copy2` | 10 × 6 px |
| 7 | Robot: pierna | `body_7_copy` | 8 × 16 px |
| 8 | Robot: pie | `body_4` | 12 × 16 px |
| 9 | Variante de color para J2 | Mismo set teñido (o se tiñe por código) | — |
| 10 | Íconos de armas ×5 | Agua, ácido, lava, fuego, viento: para los puntos de aparición en el mapa y la rueda de armas | 48 × 48 px |
| 11 | Rueda de armas | Fondo circular segmentado | 256 × 256 px |
| 12 | HUD | Marco de barra de vida, contador de rondas | 256 × 48 px |
| 13 | Plataformas | Tile repetible de metal | 32 × 32 px |
| 14 | Fondo | Escenario industrial con capas (parallax opcional) | 1920 × 1080 px |
| 15 | Partículas de efecto | Chispa eléctrica y brillo de fuego | 16 × 16 px |

Los tamaños salen de las medidas del robot en `robot.rag.json` a 40 px/m. Conviene entregarlos al doble de resolución para que se vean nítidos con zoom.
