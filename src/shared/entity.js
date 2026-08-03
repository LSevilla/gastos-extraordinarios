// src/shared/entity.js
//
// Clase base para todo objeto de dominio con identidad propia que persiste a
// través de cambios de estado (Development Handbook, Capítulo 3). La igualdad
// se compara SOLO por id, nunca por el resto de los campos. El id es
// inmutable desde la construcción; el resto del estado, en las subclases
// concretas, se muta únicamente a través de métodos con nombre de intención
// de negocio — nunca por asignación directa de campos desde afuera.
import { Identifier } from './identifier.js';

export class Entity {
  /** @param {Identifier} id */
  constructor(id) {
    if (!(id instanceof Identifier)) {
      throw new TypeError('Entity requiere una instancia de Identifier.');
    }
    Object.defineProperty(this, 'id', {
      value: id,
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }

  /** @returns {Identifier} */
  getId() {
    return this.id;
  }

  /**
   * Compara solo por id — dos entidades con el mismo id son la misma entidad
   * aunque su estado en memoria difiera momentáneamente.
   * @param {unknown} other
   * @returns {boolean}
   */
  equals(other) {
    return other instanceof Entity && this.id.equals(other.id);
  }
}
