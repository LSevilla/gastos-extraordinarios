// src/infrastructure/firebase/firestore-invitation-repository.js
import { InvitationRepository } from '../../domain/invitations/invitation-repository.js';
import { Invitation } from '../../domain/invitations/invitation.js';

const COLLECTION = 'invitations';

/** @param {Invitation} invitation */
function toDocument(invitation) {
  return {
    caseId: invitation.caseId,
    email: invitation.email,
    role: invitation.role,
    tokenHash: invitation.tokenHash,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    invitedByUserId: invitation.invitedByUserId,
    acceptedByUserId: invitation.acceptedByUserId,
    createdAt: invitation.createdAt.toISOString(),
    acceptedAt: invitation.acceptedAt ? invitation.acceptedAt.toISOString() : null,
    revokedAt: invitation.revokedAt ? invitation.revokedAt.toISOString() : null,
  };
}

/**
 * @param {string} id
 * @param {object} data
 */
function fromDocument(id, data) {
  return new Invitation(
    id,
    data.caseId,
    data.email,
    data.role,
    data.tokenHash,
    data.status,
    new Date(data.expiresAt),
    data.invitedByUserId,
    data.acceptedByUserId,
    new Date(data.createdAt),
    data.acceptedAt ? new Date(data.acceptedAt) : null,
    data.revokedAt ? new Date(data.revokedAt) : null,
  );
}

export class FirestoreInvitationRepository extends InvitationRepository {
  /**
   * @param {import('firebase/firestore').Firestore} firestore
   * @param {object} firestoreModule
   */
  constructor(firestore, firestoreModule) {
    super();
    this.firestore = firestore;
    this.fs = firestoreModule;
  }

  /** @param {Invitation} invitation */
  async save(invitation) {
    const ref = this.fs.doc(this.firestore, COLLECTION, invitation.id);
    await this.fs.setDoc(ref, toDocument(invitation));
  }

  async findById(id) {
    const ref = this.fs.doc(this.firestore, COLLECTION, id);
    const docSnap = await this.fs.getDoc(ref);
    return docSnap.exists() ? fromDocument(docSnap.id, docSnap.data()) : null;
  }

  async findPendingByCaseAndEmail(caseId, email) {
    const q = this.fs.query(
      this.fs.collection(this.firestore, COLLECTION),
      this.fs.where('caseId', '==', caseId),
      this.fs.where('email', '==', email),
      this.fs.where('status', '==', 'pending'),
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
}
