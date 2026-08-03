// src/shared/aggregate-root.js
//
// Extiende Entity agregando la capacidad de acumular DomainEvent durante la
// ejecución de métodos de negocio, sin publicarlos ella misma — se exponen vía
// pullEvents() para que la capa de aplicación los despache DESPUÉS de que la
// persistencia se confirmó exitosamente (Development Handbook, Capítulo 5).
import { Entity } from './entity.js';

export class AggregateRoot extends Entity {
  /** @param {import('./identifier.js').Identifier} id */
  constructor(id) {
    super(id);
    this._pendingEvents = [];
  }

  /**
   * Uso interno: cada subclase concreta lo invoca desde sus propios métodos de
   * negocio, tras validar sus precondiciones y mutar su estado. No está
   * pensado para llamarse desde fuera de la propia subclase (JavaScript no
   * tiene "protected" real; se documenta la restricción como convención).
   * @param {import('./domain-event.js').DomainEvent} domainEvent
   */
  addEvent(domainEvent) {
    this._pendingEvents.push(domainEvent);
  }

  /**
   * Extrae y vacía la lista de eventos pendientes — se consumen una sola vez,
   * para que no se publiquen dos veces por accidente.
   * @returns {ReadonlyArray<import('./domain-event.js').DomainEvent>}
   */
  pullEvents() {
    const events = this._pendingEvents;
    this._pendingEvents = [];
    return events;
  }

  /** @returns {boolean} */
  hasEvents() {
    return this._pendingEvents.length > 0;
  }

  /**
   * Descarta los eventos pendientes sin publicarlos — para el camino de
   * aborto (una operación de negocio agregó eventos y luego, antes de
   * persistir, se determinó que debía cancelarse). Distinto de pullEvents():
   * ese comunica "los voy a usar", este comunica "los descarto" (Anexo A,
   * punto 6).
   */
  clearEvents() {
    this._pendingEvents = [];
  }
}
