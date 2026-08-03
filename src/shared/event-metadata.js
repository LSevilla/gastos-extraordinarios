// src/shared/event-metadata.js
//
// Agrupa los campos de "sobre" de un DomainEvent (quién, cuándo, qué versión
// de forma) separados del "payload" de negocio — Anexo A, punto 3. El
// schemaVersion versiona específicamente la forma del payload del evento, no
// la de este objeto.
import { ValueObject } from './value-object.js';
import { Identifier } from './identifier.js';

export class EventMetadata extends ValueObject {
  /**
   * @param {Identifier} eventId - identidad propia del evento, distinta del
   * id de la entidad que lo origina
   * @param {Date} occurredAt - siempre asignado vía Clock.utcNow(), nunca `new Date()` directo
   * @param {number} schemaVersion - entero, empieza en 1
   * @param {string|null} [actorId]
   */
  constructor(eventId, occurredAt, schemaVersion, actorId = null) {
    super();
    if (!(eventId instanceof Identifier)) {
      throw new TypeError('EventMetadata requiere un Identifier como eventId.');
    }
    this.eventId = eventId;
    this.occurredAt = occurredAt;
    this.schemaVersion = schemaVersion;
    this.actorId = actorId;
    Object.freeze(this);
  }
}
