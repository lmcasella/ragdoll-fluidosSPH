---
name: next
description: Elige el issue abierto más relevante para trabajar a continuación, explica por qué y, al confirmar, crea su rama convencional desde la rama de integración.
---

# /next

Elegir la próxima tarea entre los PRs abiertos y los issues abiertos de GitHub. No tomar simplemente el primero o el más viejo. La taxonomía (labels, milestones) y el formato de rama están en `CLAUDE.md`.

## 1. Reunir

```powershell
gh pr list --state open --json number,title,author,headRefName,body,reviewDecision,isDraft,createdAt
gh issue list --state open --limit 300 --json number,title,labels,milestone,body,assignees
gh api "repos/{owner}/{repo}/milestones?state=open" --jq '.[] | {title, due_on}'
git branch --list
```

## 1b. PRs abiertos primero

Un PR abierto de otra persona, que no es borrador y espera revisión (`reviewDecision` vacío o `REVIEW_REQUIRED`), va antes que cualquier issue: es trabajo hecho que solo falta integrar, y si queda esperando se desactualiza contra `main`. Por cada uno, informar título, autor, antigüedad, si cierra un issue (`Closes #n`) y si es mergeable. Si hay alguno, recomendar revisarlo con `/code-review <número>` y presentar el mejor issue como alternativa. Los PRs propios abiertos se informan como trabajo en curso (falta merge o prueba), no como tarea nueva.

## 2. Descartar

- Issues con una dependencia abierta ("Depende de" lista un issue abierto) o marcados como bloqueados. Si la marca de bloqueado quedó pero todas sus dependencias están cerradas, no se descarta: se avisa que la marca está desactualizada.
- Issues en curso: hay un PR abierto que los referencia, o una rama local contiene `issue-<número>`.
- Antes de recomendar un issue, buscar PRs ya mergeados que lo referencien (`gh pr list --state merged --search "<número>"`). Si los hay, contar esa historia (qué se hizo y por qué sigue abierto) en vez de presentarlo como trabajo nuevo.
- Issues asignados a otra persona (`gh api user --jq .login` es el usuario actual).

## 3. Ordenar los que quedan

1. **El plan de la etapa actual:** si `CLAUDE.md` o la memoria del proyecto fijan un plan para la etapa (por ejemplo, una cadena de issues a terminar antes de una fecha), su próximo issue disponible va primero, aunque haya bugs abiertos.
2. **Bugs de prioridad alta:** lo roto va primero.
3. **Milestone más cercano** (por fecha de vencimiento; sin fecha, por orden de creación): el orden del plan manda.
4. **Poder de desbloqueo:** cuántos issues abiertos dependen de este, directa o indirectamente.
5. **Label de prioridad:** alta > media > baja.
6. **Número de issue más bajo** como desempate final.

## 4. Presentar

- El issue recomendado (número, título, milestone, labels) y 2–3 líneas de **por qué** queda primero, citando los criterios.
- Las dos alternativas siguientes, con una línea de motivo cada una.
- El agente que debería empezar, según el flujo de `CLAUDE.md`.

Pedir confirmación al usuario antes de hacer cualquier otra cosa.

## 5. Al confirmar

La rama sale de la rama de integración que indica `CLAUDE.md` (no de la rama de producción).

```powershell
git switch <rama-de-integracion>
git pull --ff-only
git switch -c <tipo>/issue-<número>-<descripcion-corta>
gh issue edit <número> --add-assignee "@me"
```

`<tipo>` y el formato de la descripción siguen la convención de ramas de `CLAUDE.md`.
