import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDatabase } from '../../../src/infrastructure/indexeddb/database.js';
import { IndexedDbCaseMembershipRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-case-membership-repository.js';
import { IndexedDbInvitationRepository } from '../../../src/infrastructure/indexeddb/repositories/indexeddb-invitation-repository.js';
import { FirestoreCaseMembershipRepository } from '../../../src/infrastructure/firebase/firestore-case-membership-repository.js';
import { FirestoreInvitationRepository } from '../../../src/infrastructure/firebase/firestore-invitation-repository.js';
import { DualCaseMembershipRepository } from '../../../src/infrastructure/synchronization/dual-case-membership-repository.js';
import { DualInvitationRepository } from '../../../src/infrastructure/synchronization/dual-invitation-repository.js';
import { CaseMembership } from '../../../src/domain/case-memberships/case-membership.js';
import { Invitation } from '../../../src/domain/invitations/invitation.js';
import { Clock } from '../../../src/shared/clock.js';
import { createFakeFirestoreModule } from './helpers/fake-firestore.js';

const clock = Clock.fixed(new Date('2026-01-01T00:00:00.000Z'));
let counter = 0;

async function buildMembershipContext() {
  counter += 1;
  const db = await openDatabase(`dual-membership-test-${Date.now()}-${counter}`);
  const local = new IndexedDbCaseMembershipRepository(db);
  const { firestore, firestoreModule } = createFakeFirestoreModule();
  const remote = new FirestoreCaseMembershipRepository(firestore, firestoreModule);
  return {
    dual: new DualCaseMembershipRepository({ remote, local }),
    local,
    remote,
    firestoreModule,
  };
}

async function buildInvitationContext() {
  counter += 1;
  const db = await openDatabase(`dual-invitation-test-${Date.now()}-${counter}`);
  const local = new IndexedDbInvitationRepository(db);
  const { firestore, firestoreModule } = createFakeFirestoreModule();
  const remote = new FirestoreInvitationRepository(firestore, firestoreModule);
  return { dual: new DualInvitationRepository({ remote, local }), local, remote, firestoreModule };
}

function buildMembership() {
  const now = clock.utcNow();
  return new CaseMembership(
    'case-1_user-1',
    'case-1',
    'user-1',
    'owner',
    'active',
    'user-1',
    now,
    now,
    null,
    now,
    now,
  );
}

test('DualCaseMembershipRepository.save() escribe en Firestore y espeja en IndexedDB', async () => {
  const { dual, local, firestoreModule } = await buildMembershipContext();
  const membership = buildMembership();

  await dual.save(membership);

  const remoteDoc = firestoreModule.__debugGetRaw('caseMemberships', 'case-1_user-1');
  assert.ok(remoteDoc, 'Debe existir en Firestore.');
  const localCopy = await local.findByCaseAndUser('case-1', 'user-1');
  assert.ok(localCopy, 'Debe existir también en la copia local.');
  assert.equal(localCopy.role, 'owner');
});

test('DualCaseMembershipRepository lee siempre de la copia local (Principio 1)', async () => {
  const { dual, local } = await buildMembershipContext();
  const membership = buildMembership();
  // Guardar solo en local, sin pasar por Firestore — simula estar offline
  // con datos ya sincronizados antes.
  await local.save(membership);

  const found = await dual.findByCaseAndUser('case-1', 'user-1');
  assert.ok(found, 'Debe poder leerse sin haber tocado Firestore en esta prueba.');
});

test('DualCaseMembershipRepository.refreshFromRemote() trae cambios de otros dispositivos a la copia local', async () => {
  const { dual, local, remote } = await buildMembershipContext();
  // Otro dispositivo/usuario escribió directo en Firestore.
  const membershipFromOtherDevice = buildMembership();
  await remote.save(membershipFromOtherDevice);

  const beforeRefresh = await local.findByCaseAndUser('case-1', 'user-1');
  assert.equal(beforeRefresh, null, 'Todavía no debería estar en la copia local.');

  await dual.refreshFromRemote('case-1');

  const afterRefresh = await local.findByCaseAndUser('case-1', 'user-1');
  assert.ok(afterRefresh, 'Debe aparecer en la copia local tras refrescar.');
});

test('DualInvitationRepository.findById() consulta Firestore si no está en la copia local, y la espeja localmente', async () => {
  const { dual, remote, local } = await buildInvitationContext();
  const now = clock.utcNow();
  const invitation = new Invitation(
    'inv-1',
    'case-1',
    'invitado@ejemplo.cl',
    'editor',
    'hash-x',
    'pending',
    new Date('2030-01-01'),
    'user-1',
    null,
    now,
    null,
    null,
  );
  await remote.save(invitation); // solo remoto, como si otro dispositivo la creó

  const localBefore = await local.findById('inv-1');
  assert.equal(localBefore, null, 'Todavía no debería estar en la copia local.');

  const found = await dual.findById('inv-1');
  assert.ok(found, 'Debe poder resolverse yendo a buscar a Firestore.');
  assert.equal(found.email, 'invitado@ejemplo.cl');

  const localAfter = await local.findById('inv-1');
  assert.ok(localAfter, 'Debe quedar espejada localmente después de la primera lectura.');
});

test('DualInvitationRepository.findById() de una invitación inexistente retorna null sin lanzar', async () => {
  const { dual } = await buildInvitationContext();
  const result = await dual.findById('no-existe');
  assert.equal(result, null);
});
