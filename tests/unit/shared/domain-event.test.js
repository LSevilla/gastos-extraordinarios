import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DomainEvent } from '../../../src/shared/domain-event.js';
import { EventMetadata } from '../../../src/shared/event-metadata.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { Clock } from '../../../src/shared/clock.js';

test('dos eventos del mismo tipo tienen eventId distintos aunque ocurran en el mismo instante', () => {
  const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));
  const aggregateId = Identifier.generate();
  const a = DomainEvent.create('ExpenseAccepted', aggregateId, {}, clock);
  const b = DomainEvent.create('ExpenseAccepted', aggregateId, {}, clock);
  assert.equal(a.metadata.eventId.equals(b.metadata.eventId), false);
});

test('occurredAt proviene de Clock, no del reloj real, cuando se usa Clock.fixed', () => {
  const fixedDate = new Date('2020-05-05T00:00:00.000Z');
  const event = DomainEvent.create(
    'ExpenseCreated',
    Identifier.generate(),
    {},
    Clock.fixed(fixedDate),
  );
  assert.equal(event.metadata.occurredAt.getTime(), fixedDate.getTime());
});

test('el payload es inmutable', () => {
  const event = DomainEvent.create('X', Identifier.generate(), { a: 1 }, Clock.system());
  assert.throws(() => {
    event.payload.a = 2;
  }, TypeError);
});

test('construir DomainEvent sin un EventMetadata válido lanza', () => {
  assert.throws(() => new DomainEvent('X', Identifier.generate(), {}, {}));
});

test('construir DomainEvent sin un Identifier válido como aggregateId lanza', () => {
  const metadata = new EventMetadata(Identifier.generate(), new Date(), 1);
  assert.throws(() => new DomainEvent('X', 'no-es-identifier', {}, metadata));
});

test('EventMetadata requiere un Identifier como eventId', () => {
  assert.throws(() => new EventMetadata('no-es-identifier', new Date(), 1));
});

test('schemaVersion se asigna correctamente y es 1 por defecto vía DomainEvent.create', () => {
  const event = DomainEvent.create('X', Identifier.generate(), {}, Clock.system());
  assert.equal(event.metadata.schemaVersion, 1);
});
