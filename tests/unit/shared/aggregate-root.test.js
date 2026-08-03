import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AggregateRoot } from '../../../src/shared/aggregate-root.js';
import { Identifier } from '../../../src/shared/identifier.js';
import { DomainEvent } from '../../../src/shared/domain-event.js';
import { Clock } from '../../../src/shared/clock.js';

class SampleAggregate extends AggregateRoot {
  doSomething() {
    this.addEvent(DomainEvent.create('SomethingHappened', this.getId(), {}, Clock.system()));
  }
}

test('un agregado recién creado no tiene eventos pendientes', () => {
  const aggregate = new SampleAggregate(Identifier.generate());
  assert.equal(aggregate.hasEvents(), false);
  assert.deepEqual(aggregate.pullEvents(), []);
});

test('una acción de negocio acumula un evento', () => {
  const aggregate = new SampleAggregate(Identifier.generate());
  aggregate.doSomething();
  assert.equal(aggregate.hasEvents(), true);
});

test('pullEvents() retorna los eventos acumulados y los vacía', () => {
  const aggregate = new SampleAggregate(Identifier.generate());
  aggregate.doSomething();
  aggregate.doSomething();
  const events = aggregate.pullEvents();
  assert.equal(events.length, 2);
  assert.equal(aggregate.hasEvents(), false);
});

test('una segunda llamada a pullEvents() sin nueva actividad retorna vacío', () => {
  const aggregate = new SampleAggregate(Identifier.generate());
  aggregate.doSomething();
  aggregate.pullEvents();
  assert.deepEqual(aggregate.pullEvents(), []);
});

test('clearEvents() descarta los eventos pendientes sin publicarlos', () => {
  const aggregate = new SampleAggregate(Identifier.generate());
  aggregate.doSomething();
  aggregate.clearEvents();
  assert.equal(aggregate.hasEvents(), false);
  assert.deepEqual(aggregate.pullEvents(), []);
});
