// src/shared/value-object.js
//
// Clase base para conceptos sin identidad propia, comparados por su valor
// (Development Handbook, Capítulo 3). Toda subclase debe congelarse a sí misma
// (Object.freeze(this)) al final de su constructor — ValueObject no lo hace por
// ella porque necesita permitir que la subclase termine de asignar sus campos
// primero.

export class ValueObject {
  /**
   * Compara por valor: dos instancias de la misma clase con los mismos campos
   * son iguales, sin importar si son la misma referencia en memoria.
   *
   * Implementación por defecto basada en serialización — correcta incluso para
   * campos que son objetos anidados con su propio `toJSON` (p. ej. `Date`) o que
   * son a su vez otros ValueObject serializables. Una subclase puede sobrescribir
   * este método si necesita una comparación distinta; ninguna del Shared Kernel
   * lo necesita hoy.
   * @param {unknown} other
   * @returns {boolean}
   */
  equals(other) {
    if (other === null || other === undefined) return false;
    if (other.constructor !== this.constructor) return false;
    return JSON.stringify(this) === JSON.stringify(other);
  }
}
