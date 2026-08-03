# ADR-018 — Modelo de owner único por caso

**No reemplaza ningún ADR anterior** — formaliza una propiedad que ya era
cierta de facto en el Build 1.3b (nadie había construido un camino para
tener más de un owner), cerrando dos huecos reales que permitían romperla
por accidente.

## Contexto

Al revisar la protección del último owner, se confirmó contra el código
real que:

- `bootstrapOwnerMembership()` es el único lugar que asigna `role: 'owner'`
  — no existe `changeRole`/`updateRole` en ningún punto del sistema.
- Sin embargo, esa propiedad no estaba garantizada: `MembershipService.invite()`
  no rechazaba `role: 'owner'` (solo la interfaz lo ocultaba), y
  `revokeMembership()` no impedía revocar al owner, ni siquiera a sí mismo.

## Decisión

**El Build 1.3b adopta oficialmente un modelo de owner único.**

- La propiedad del caso se representa exclusivamente mediante la
  `CaseMembership` con `role == 'owner'` — no existe (ni debe agregarse)
  un campo `ownerUserId` en `Case`; sería una segunda fuente de verdad.
- El owner se crea únicamente al crear el caso (`bootstrapOwnerMembership`).
  **La creación de owners adicionales está prohibida** — `invite()`
  rechaza explícitamente `role: 'owner'`.
- **La revocación del owner está prohibida** — `revokeMembership()` rechaza
  cualquier intento sobre una membresía con `role == 'owner'`, incluido el
  propio owner intentando revocarse a sí mismo.
- `firestore.rules` refleja la misma política en el servidor: una
  membresía `owner` no puede alterarse (`role` ni `status`) mediante una
  escritura normal.

## Esto es una política del modelo actual, no una imposibilidad permanente

**No existe actualmente un caso de uso para transferir la propiedad.**
Cuando exista, deberá ser una operación específica y transaccional (p. ej.
`TransferOwnership`) — no una escritura suelta de `role`/`status` sobre la
membresía existente. El día que se implemente, los tres puntos que hoy
bloquean cualquier cambio (`invite()`, `revokeMembership()`,
`preservesOwnerUnderCurrentModel()` en `firestore.rules`) son exactamente
los tres lugares a revisar junto con esa implementación — ninguno más.

## Consecuencias

- Un caso nunca puede quedar sin administrador por un error de uso, una
  invitación mal configurada, o un cliente que no respete la interfaz.
- Ningún cambio de modelo de datos: `Case` conserva su forma actual
  (`name, description, operationMode, participantIds, beneficiaryIds,
onboardingCompleted, createdAt, updatedAt`), sin `ownerUserId`.
- Cuando se implemente `TransferOwnership`, deberá ser atómica (no puede
  existir, ni transitoriamente, un caso con cero owners) — queda fuera de
  alcance de este ADR, solo se deja documentado el requisito para cuando
  corresponda.

## Alcance de este cambio

Exclusivamente: `src/application/services/membership-service.js`
(`invite()`, `revokeMembership()`) y `firestore.rules`
(`match /caseMemberships/{membershipId}`). Ningún otro archivo del
Build 1.3b se modificó para esta decisión.
