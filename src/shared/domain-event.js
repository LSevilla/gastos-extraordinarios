// src/shared/domain-event.js
//
// Representación estructurada e inmutable de un hecho de negocio ya ocurrido
// (Development Handbook, Capítulo 5; catálogo completo en Blueprint, Capítulo
// 5). No se publica a sí mismo — lo acumula un AggregateRoot y lo despacha la
// capa de aplicación, después de confirmar la persistencia.
import { Identifier } from './identifier.js';
import { EventMetadata } from './event-metadata.js';

export class DomainEvent {
  /**
   * @param {string} eventType - nombre estable, p. ej. "ExpenseAccepted"
   * @param {Identifier} aggregateId - id de la entidad que originó el evento
   * @param {Record<string, unknown>} payload - campos mínimos definidos por el catálogo de eventos
   * @param {EventMetadata} metadata
   */
  constructor(eventType, aggregateId, payload, metadata) {
    if (!(aggregateId instanceof Identifier)) {
      throw new TypeError('DomainEvent requiere un Identifier como aggregateId.');
    }
    if (!(metadata instanceof EventMetadata)) {
      throw new TypeError('DomainEvent requiere una instancia de EventMetadata.');
    }
    this.eventType = eventType;
    this.aggregateId = aggregateId;
    this.payload = Object.freeze({ ...payload });
    this.metadata = metadata;
    Object.freeze(this);
  }

  /**
   * Forma de conveniencia que genera su propio EventMetadata (eventId nuevo,
   * schemaVersion 1, occurredAt vía Clock inyectado).
   * @param {string} eventType
   * @param {Identifier} aggregateId
   * @param {Record<string, unknown>} payload
   * @param {{utcNow: () => Date}} clock
   * @param {string|null} [actorId]
   * @returns {DomainEvent}
   */
  static create(eventType, aggregateId, payload, clock, actorId = null) {
    const metadata = new EventMetadata(Identifier.generate(), clock.utcNow(), 1, actorId);
    return new DomainEvent(eventType, aggregateId, payload, metadata);
  }
}
