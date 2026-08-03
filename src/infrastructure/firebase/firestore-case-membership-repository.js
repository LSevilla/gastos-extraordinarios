// src/infrastructure/firebase/firestore-case-membership-repository.js
//
// Implementación real con Firestore — CaseMembership es un concepto
// colaborativo (ADR-017, Principio 4: requiere conexión), así que este
// repositorio habla directo con Firestore, sin pasar por OperationQueue
// (a diferencia de Expense/Case, que sí van por la cola).
import { CaseMembershipRepository } from '../../domain/case-memberships/case-membership-repository.js';
import { CaseMembership } from '../../domain/case-memberships/case-membership.js';

const COLLECTION = 'caseMemberships';

/** @param {CaseMembership} membership */
function toDocument(membership) {
  return {
    caseId: membership.caseId,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    invitedByUserId: membership.invitedByUserId,
    invitedAt: membership.invitedAt.toISOString(),
    acceptedAt: membership.acceptedAt ? membership.acceptedAt.toISOString() : null,
    revokedAt: membership.revokedAt ? membership.revokedAt.toISOString() : null,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}

/**
 * @param {string} id
 * @param {object} data
 */
function fromDocument(id, data) {
  return new CaseMembership(
    id,
    data.caseId,
    data.userId,
    data.role,
    data.status,
    data.invitedByUserId,
    new Date(data.invitedAt),
    data.acceptedAt ? new Date(data.acceptedAt) : null,
    data.revokedAt ? new Date(data.revokedAt) : null,
    new Date(data.createdAt),
    new Date(data.updatedAt),
  );
}

export class FirestoreCaseMembershipRepository extends CaseMembershipRepository {
  /**
   * @param {import('firebase/firestore').Firestore} firestore
   * @param {object} firestoreModule
   */
  constructor(firestore, firestoreModule) {
    super();
    this.firestore = firestore;
    this.fs = firestoreModule;
  }

  /** @param {CaseMembership} membership */
  async save(membership) {
    const ref = this.fs.doc(this.firestore, COLLECTION, membership.id);
    await this.fs.setDoc(ref, toDocument(membership));
  }

  async findByCaseAndUser(caseId, userId) {
    const q = this.fs.query(
      this.fs.collection(this.firestore, COLLECTION),
      this.fs.where('caseId', '==', caseId),
      this.fs.where('userId', '==', userId),
    );
    const snapshot = await this.fs.getDocs(q);
    if (snapshot.empty) return null;
    const docSnap = snapshot.docs[0];
    return fromDocument(docSnap.id, docSnap.data());
  }

  async findByCase(caseId) {
    const q = this.fs.query(
      this.fs.collection(this.firestore, COLLECTION),
      this.fs.where('caseId', '==', caseId),
    );
    const snapshot = await this.fs.getDocs(q);
    return snapshot.docs.map((docSnap) => fromDocument(docSnap.id, docSnap.data()));
  }

  async findByUser(userId) {
    const q = this.fs.query(
      this.fs.collection(this.firestore, COLLECTION),
      this.fs.where('userId', '==', userId),
    );
    const snapshot = await this.fs.getDocs(q);
    return snapshot.docs.map((docSnap) => fromDocument(docSnap.id, docSnap.data()));
  }
}
