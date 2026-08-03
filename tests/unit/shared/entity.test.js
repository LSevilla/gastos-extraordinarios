import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Entity } from '../../../src/shared/entity.js';
import { Identifier } from '../../../src/shared/identifier.js';

class SampleEntity extends Entity {
  constructor(id, label) {
    super(id);
    this.label = label;
  }
}

test('dos entidades con el mismo id son iguales aunque difieran en otros campos', () => {
  const id = Identifier.generate();
  const a = new SampleEntity(id, 'A');
  const b = new SampleEntity(id, 'B');
  assert.equal(a.equals(b), true);
});

test('dos entidades con distinto id nunca son iguales aunque el resto coincida', () => {
  const a = new SampleEntity(Identifier.generate(), 'igual');
  const b = new SampleEntity(Identifier.generate(), 'igual');
  assert.equal(a.equals(b), false);
});

test('comparar contra algo que no es Entity retorna falso, no lanza', () => {
  const a = new SampleEntity(Identifier.generate(), 'A');
  assert.equal(a.equals(null), false);
  assert.equal(a.equals({}), false);
});

test('el id es inmutable tras la construcción', () => {
  const entity = new SampleEntity(Identifier.generate(), 'A');
  assert.throws(() => {
    entity.id = Identifier.generate();
  }, TypeError);
});

test('construir sin un Identifier válido lanza', () => {
  assert.throws(() => new SampleEntity('no-es-un-identifier', 'A'));
});
