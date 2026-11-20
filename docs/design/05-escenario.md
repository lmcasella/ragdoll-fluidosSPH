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
  - mapa definitivo con puntos de armas (#25): es el mapa Infinito, diseñado en [16](16-ascenso.md). Lo de esta sección describe el Clásico, que queda como mapa de testing y como etapa 0 del Infinito;
  - plataformas **cinemáticas** (#33);
  - plataformas de **piedra temporal** (lava + agua, #30).

**Limitación (hoy):** el build no expone `PreSolve`, así que hoy todas las plataformas son sólidas. Hay una vía alternativa con el filtro de contactos: [5.3](#53-plataformas-atravesables-desde-abajo-).

## 5.2 Pileta ✅

> **🔨 #62:** el agua de la pileta pasa a ser un campo de alturas (Saint-Venant 1D) que arranca en reposo exacto. **✅ #71 (0.15.0): el campo de alturas ya reemplaza a las partículas de la pileta; lo que sigue describiendo partículas es historia.** La flotación de los robots es #72 (todavía no flotan). El sensor se mantiene como regla de juego ([14.3](14-agua.md#143-campo-de-alturas-saint-venant-1d-shallowwater), [14.5](14-agua.md#145-flotación-de-arquímedes-por-pieza)).

- **Agua:** SPH real en el hueco central (x 18–38, del fondo hasta y = 3), en un **sistema de partículas propio** Un robot que cae salpica.
  - ✅ #22: es el **agua del nivel**, compartido con la lluvia de la inundación. Radio **0,25 m** (`LEVEL.pool.radius`; 477 partículas en la pileta, medido) y `maxCount` = `LEVEL.flood.maxParticles` (5.500) al crearlo en `fillPool`. Se dibuja con radio **0,28 m** (decisión del usuario: no agrandar las partículas).
  - ✅ #40: las fuerzas del sistema (`LEVEL.pool.physics`: damping 1,0, viscosidad 0,1) y las flags de sus partículas (`LEVEL.pool.flags`: `VISCOUS | STATIC_PRESSURE`) son datos, para que el agua en reposo quede quieta y se nivele en lugar de verse como un pelotero ([07-sph §7.5](07-sph.md#75-parámetros-por-sistema--40)).
- **Sensor:** un sensor de Box2D cubre la pileta hasta y = 2,2. El robot que se hunde ahí queda **destruido** (vida 0, todo rojo) y pierde la ronda. Con la inundación **no se mueve** ([02-partida](02-partida.md#21-inundación--22)).
- **Disparos:** los sistemas de disparos y del agua del nivel no interactúan entre sí en LiquidFun.
  - ✅ #22: hasta ahora, las partículas de los disparos que caían al agua se eliminaban (corte `y < max(pool.surface si x está sobre la pileta, nivel de la inundación)`), porque si no la atravesaban.
  - ✅ #39: **ya no se eliminan.** El puente detecta los disparos dentro del agua (pileta, inundación o charcos) y los frena y los hace flotar o hundirse según el fluido ([07-sph §7.6](07-sph.md#76-puente-agua--disparos--39)).
- **Inundación:** la lluvia de la muerte súbita cae sobre la pileta y la hace subir (#22, [02-partida](02-partida.md#21-inundación--22)).

## 5.3 Plataformas atravesables desde abajo 🔨 (#149)

Pedido del usuario (remapeo del 18/11; issue #149, requisito del ascenso infinito #25). Un robot atraviesa una plataforma atravesable al subir desde abajo, y la atraviesa hacia abajo con `drop` (abajo + A, [10](10-controles.md#101-mapeo--remapeo-pedido-por-el-usuario-el-1811)). El usuario pidió un **sistema estándar y genérico**, reutilizable por otros sistemas (ascenso infinito, plataformas cinemáticas #33) y fácil de ajustar.

**Fluidos (decisión del usuario, 20/11):** las partículas no atraviesan las plataformas en ningún sentido. La plataforma es sólida para los fluidos: retiene charcos, lava y piedra, y sirve de cobertura contra disparos desde abajo. Solo los robots la cruzan.

**Decisiones del 19/11 (reemplazan lo que se contradiga más abajo):**
- **Atravesable es un dato:** `oneWay: true` en el sólido de `LEVEL`. Todas las `kind: "platform"` actuales lo llevan; piso y paredes no. Un sistema que cree plataformas en ejecución las registra con `addPlatform(fixture)` / `removePlatform(fixture)`.
- **Decisión por dueño, no por pieza:** un dueño es un conjunto de cuerpos que pasa entero o choca entero (`addOwner(key, bodies)` / `removeOwner(key)`; cada robot es un dueño, y cualquier otro sistema puede registrar los suyos). Un cuerpo dinámico sin dueño es su propio dueño. Así ninguna pieza del ragdoll queda trabada a medio cruzar.
- **Regla estándar por par dueño–plataforma:** sólido solo si el punto más bajo del dueño (mínimo `GetAABB` de sus fixtures) estaba por encima de `tope − ONE_WAY.tolerance` y el dueño no tiene bajada activa en esa plataforma. Si no, fantasma. El estado del par se recalcula después de cada `stepWorld`; cuando cambia, se hace `Refilter` de las fixtures del dueño.
- **Valores en una tabla** `ONE_WAY` (`tolerance` 0,05 m, `dropMaxTime` 0,4 s) para ajustarlos sin tocar lógica.

### Verificado en el binding (`vendor/liquidfun.js`, 18/11)

| Vía | Qué hay | ¿Sirve? |
|---|---|---|
| `PreSolve` (desactivar el contacto en cada paso) | `JSContactListener` solo expone `BeginContact`, `EndContact`, `BeginParticleContact`, `EndParticleContact`, `BeginParticleBodyContact` y `EndParticleBodyContact`. **No** hay `PreSolve` ni `PostSolve` | No |
| `b2Contact.SetEnabled(false)` desde `BeginContact` | `SetEnabled` existe, pero según el fuente de Box2D 2.3, `b2Contact::Update` vuelve a habilitar el contacto en cada paso antes de `PreSolve`. Desactivado desde `BeginContact`, solo dura un paso. Además, cambiar el contacto dentro de un callback rompe "juntar durante el paso" | No |
| Filtro de contactos: `JSContactFilter` con `ShouldCollide(fixtureA, fixtureB)`, `b2World.SetContactFilter` y `b2Fixture.Refilter()` | Los tres existen | **Sí** |
| Datos de filtro (`b2Filter` con `categoryBits`/`maskBits`/`groupIndex`, `b2Fixture.SetFilterData`) | Existen, pero habría que escribir el filtro de las fixtures de la instancia de RagImporter, y es por robot, no por par pieza–plataforma | Descartado |

### Diseño

- **Módulo nuevo `js/platforms.js`**, clase `OneWayPlatforms(world, level, players)`. Instala un `JSContactFilter` en el mundo (hay uno solo por mundo).
- **`ShouldCollide(A, B)`:**
  - Primero reproduce la regla por defecto de Box2D con `GetFilterData` de las dos fixtures (`groupIndex` igual y distinto de 0; si no, `categoryBits`/`maskBits`). Así no cambia ningún filtro que ya use RagImporter.
  - Si un lado es una plataforma atravesable (punteros guardados al crear el nivel) y el otro es una pieza de robot, devuelve `false` cuando el par está **fantasma**: el borde inferior de la pieza (`GetAABB`) está por debajo del tope de la plataforma menos 0,05 m (viene de abajo o la está cruzando), o ese robot tiene activa una **bajada**.
  - Solo lee estado; no crea ni destruye nada. Es una consulta, compatible con "juntar durante el paso, actuar después".
- **Por qué hace falta `Refilter`:** Box2D llama a `ShouldCollide` cuando las cajas de dos fixtures empiezan a solaparse, y no lo repite mientras sigan solapadas. Una pieza que entra desde abajo y termina arriba de la plataforma seguiría sin contacto. Después de cada `stepWorld`, para cada pieza que solapa una plataforma y cambió de lado (abajo → arriba, o termina la bajada), se llama a `fixture.Refilter()`. Eso marca sus contactos para volver a filtrarlos en el paso siguiente. `Refilter` no cambia ningún dato de la fixture.
- **Bajada (`drop`):** si el robot está apoyado en una plataforma atravesable (piso por raycast desde los pies, como el salto), se activa la bajada de esa plataforma: dura hasta que el borde superior del robot queda por debajo de la plataforma, o `DROP.maxTime` (0,4 s). Al empezar y al terminar se hace `Refilter` de las piezas del robot. Si no está sobre una atravesable, `drop` cuenta como salto.
- **Contrato de RagImporter:** no escribe filtros ni destruye fixtures de la instancia. `Refilter` solo marca contactos. El usuario lo aceptó el 18/11 como excepción del contrato, registrada en `CLAUDE.md`.
- **Partículas:** no cambian. LiquidFun solo consulta `ShouldCollide(fixture, sistema, índice)` para partículas con la flag `b2_fixtureContactFilterParticle` (1 << 16), que el juego no usa, y esa sobrecarga no está en el binding. Las partículas siguen chocando con las plataformas desde los dos lados: la lluvia y los charcos quedan arriba ([14.7](14-agua.md#147-inundación-con-lluvia-absorbida)).
- **Campo de alturas:** no cambia. Las plataformas nunca fueron lecho ([14.3](14-agua.md#paso-estabilidad-y-bordes)).
- **Gancho:** el rayo sigue pegando en las plataformas desde abajo (los rayos no usan el filtro de contactos). Engancharse desde abajo y recoger la cuerda deja pasar al robot a través de la plataforma, que es lo esperado.

### Por verificar en ejecución

- Que `JSContactFilter.ShouldCollide` reciba los punteros de las fixtures (como `JSContactListener`) y que su valor de retorno se respete.
- Que `Refilter` vuelva a llamar a `ShouldCollide` en el paso siguiente.

### Criterios (Node, gamepad simulado)

- Saltar desde abajo de una plataforma de 0,4 m atraviesa y aterriza arriba en el mismo salto.
- `drop` sobre una plataforma cruza los pies en ≤ 0,3 s y al robot entero en ≤ 0,6 s (caída libre de 1,6 m desde el reposo: 0,57 s), y no vuelve a subir.
- Sobre el piso de las islas, `drop` salta (9 m/s).
- Los robots siguen chocando entre sí y con el piso y las paredes. Las partículas siguen apoyadas en las plataformas.
