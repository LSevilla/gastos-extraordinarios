// src/shared/clock.js
//
// Abstrae la obtención de la hora actual para que el dominio nunca llame a
// `new Date()`/`Date.now()` directamente — necesario para pruebas
// deterministas (Development Handbook, Capítulo 9). Se inyecta, no se importa
// directo, en cualquier Domain Service que necesite "ahora".
//
// Nota sobre utcNow() (Anexo A, punto 8): un objeto Date de JavaScript siempre
// almacena internamente un instante UTC (milisegundos desde epoch); now() y
// utcNow() retornan el mismo instante. La distinción existe para claridad de
// intención en el punto de llamada — utcNow() marca "este timestamp se va a
// guardar/comparar", now() se usa para lo demás — no porque el objeto Date
// difiera.

export class Clock {
  #fixedDate;

  /** @param {Date|null} fixedDate */
  constructor(fixedDate) {
    this.#fixedDate = fixedDate;
    Object.freeze(this);
  }

  /** @returns {Clock} reloj real del entorno (navegador o Node) */
  static system() {
    return new Clock(null);
  }

  /**
   * Reloj de pruebas: siempre responde la misma fecha, sin importar cuánto
   * tiempo real transcurra entre llamadas.
   * @param {Date} date
   * @returns {Clock}
   */
  static fixed(date) {
    return new Clock(date);
  }

  /** @returns {Date} */
  now() {
    return this.#fixedDate ? new Date(this.#fixedDate.getTime()) : new Date();
  }

  /** @returns {Date} la fecha actual sin componente de hora (medianoche local) */
  today() {
    const current = this.now();
    return new Date(current.getFullYear(), current.getMonth(), current.getDate());
  }

  /**
   * @returns {Date} el instante actual, para almacenamiento (ver nota de
   * archivo sobre por qué es equivalente a now() en JS, pero se mantiene
   * como método propio por claridad de intención).
   */
  utcNow() {
    return this.now();
  }
}
