# 2. Loop de partida

Código: `js/round.js` (`Match`), integrado en `index.html`.

1. **Ronda** ✅: los robots aparecen en extremos opuestos del mapa. Gana el último que quede en pie.
2. **Fin de ronda** ✅: un robot pierde cuando su vida llega a 0 o cuando cae a la pileta ([05-escenario](05-escenario.md#52-pileta)). Al quedar uno solo:
   - 1,5 s de cámara lenta (×0,3);
   - un cartel con el ganador durante 3 s en total;
   - la ronda siguiente arranca sin recargar: se destruyen robots y disparos y se vuelve a aparecer.

   Si los dos caen a la vez, es empate y nadie suma.
3. **Partida** ✅: al mejor de 3 (gana quien llega a 2). El cartel final ofrece **revancha** con disparar (A / RT, Espacio, Enter). El HUD muestra las victorias como puntos y el número de ronda.
4. **Inundación (muerte súbita)** 🔨 #22: a los 90 s de ronda empieza a **llover desde arriba**. El agua cae, se acumula sobre la pileta y va llenando el mapa desde abajo. Las plataformas bajas quedan bajo el agua, el agua daña por cortocircuito ([04-fluidos](04-fluidos.md#41-armas)) y la pelea se va hacia arriba. Es el uso masivo de partículas del juego; su costo está en [09-arquitectura](09-arquitectura.md#93-presupuestos-y-métricas).
