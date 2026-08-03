// src/infrastructure/synchronization/dual-invitation-repository.js
import { InvitationRepository } from '../../domain/invitations/invitation-repository.js';

export class DualInvitationRepository extends InvitationRepository {
  /**
   * @param {{
   *   remote: import('../firebase/firestore-invitation-repository.js').FirestoreInvitationRepository,
   *   local: import('../indexeddb/repositories/indexeddb-invitation-repository.js').IndexedDbInvitationRepository,
   * }} deps
   */
  constructor({ remote, local }) {
    super();
    this.remote = remote;
    this.local = local;
  }

  /** @param {import('../../domain/invitations/invitation.js').Invitation} invitation */
  async save(invitation) {
    await this.remote.save(invitation);
    await this.local.save(invitation);
  }

  async findById(id) {
    const local = await this.local.findById(id);
    if (local) return local;
    // Una invitación puede llegar por enlace sin que este dispositivo la
    // haya visto antes — en ese caso sí hace falta ir a Firestore.
    const remote = await this.remote.findById(id);
    if (remote) await this.local.save(remote);
    return remote;
  }

  async findPendingByCaseAndEmail(caseId, email) {
    return this.local.findPendingByCaseAndEmail(caseId, email);
  }

  async findByCase(caseId) {
    return this.local.findByCase(caseId);
  }
}
