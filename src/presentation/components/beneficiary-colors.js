// src/presentation/components/beneficiary-colors.js
//
// Un color propio para cada hijo.
//
// POR QUÉ EXISTE. En una lista de gastos, lo primero que se quiere saber no
// es el monto sino de quién es. Con dos o tres hijos, leer el nombre en cada
// fila es trabajo que el color puede ahorrar: se reconoce antes de leer.
//
// No es decoración: es la única señal visual de la aplicación que codifica un
// dato real y no un estado del sistema. Por eso los colores son estables —
// derivados del identificador, no del orden de la lista—, así el mismo hijo
// conserva su color aunque cambie el orden, se desactive a otro o se mire
// desde otro dispositivo.
//
// La paleta evita el rosa/azul por género: sería una lectura que la
// aplicación no debe imponer sobre los hijos de nadie.

const PALETTE = Object.freeze([
  { name: 'turquesa', color: '#0f6f68', soft: '#dcefec' },
  { name: 'ámbar', color: '#a8681c', soft: '#f8ecdb' },
  { name: 'violeta', color: '#6d54a8', soft: '#eae5f6' },
  { name: 'coral', color: '#b4544a', soft: '#f8e6e3' },
  { name: 'oliva', color: '#5c7233', soft: '#e9efdd' },
  { name: 'índigo', color: '#3f5f9e', soft: '#e3e9f5' },
]);

/**
 * Hash estable y sencillo. No necesita ser criptográfico: solo repartir de
 * forma consistente y dar SIEMPRE el mismo resultado para el mismo id, en
 * cualquier dispositivo y en cualquier momento.
 *
 * @param {string} value
 * @returns {number}
 */
function stableIndex(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash % PALETTE.length;
}

/**
 * @param {{toString: () => string}|string|null|undefined} beneficiaryId
 * @returns {{name: string, color: string, soft: string}}
 */
export function beneficiaryColor(beneficiaryId) {
  if (!beneficiaryId) return PALETTE[0];
  return PALETTE[stableIndex(String(beneficiaryId))];
}

/**
 * Punto de color con la inicial del nombre. Se usa en las listas, donde hay
 * poco espacio y el nombre completo compite con el monto.
 *
 * Nunca va solo: siempre acompaña al nombre en texto. El color acelera el
 * reconocimiento, pero quien no distingue colores debe poder usar la
 * aplicación exactamente igual.
 *
 * @param {{toString: () => string}} beneficiaryId
 * @param {string} fullName
 * @returns {HTMLElement}
 */
export function createBeneficiaryDot(beneficiaryId, fullName) {
  const { color, soft } = beneficiaryColor(beneficiaryId);
  const dot = document.createElement('span');
  dot.className = 'beneficiary-dot';
  dot.style.setProperty('--dot-color', color);
  dot.style.setProperty('--dot-soft', soft);
  dot.textContent = (fullName ?? '?').trim().charAt(0).toUpperCase() || '?';
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}
