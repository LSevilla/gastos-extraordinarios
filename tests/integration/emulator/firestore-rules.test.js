// tests/integration/emulator/firestore-rules.test.js
//
// Pruebas reales contra el emulador de Firestore, usando la herramienta
// oficial de Google para esto (@firebase/rules-unit-testing). Cada
// aserción evalúa las reglas reales de firestore.rules, no una simulación.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const PROJECT_ID = 'demo-aporte-compartido';

async function buildEnv() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf-8'),
      host: 'localhost',
      port: 8080,
    },
  });
}

async function seed(testEnv, work) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await work(context.firestore());
  });
}

test('aislamiento entre casos: un usuario sin membresía no puede leer el caso de otro', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'cases', 'case-a'), { name: 'Caso A' });
      await setDoc(doc(db, 'caseMemberships', 'case-a_owner-uid'), {
        caseId: 'case-a',
        userId: 'owner-uid',
        role: 'owner',
        status: 'active',
      });
    });

    const strangerContext = testEnv.authenticatedContext('stranger-uid');
    await assertFails(getDoc(doc(strangerContext.firestore(), 'cases', 'case-a')));

    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertSucceeds(getDoc(doc(ownerContext.firestore(), 'cases', 'case-a')));
  } finally {
    await testEnv.cleanup();
  }
});

test('un usuario no autenticado no puede leer ningún caso', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'cases', 'case-b'), { name: 'Caso B' });
    });
    const anonContext = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anonContext.firestore(), 'cases', 'case-b')));
  } finally {
    await testEnv.cleanup();
  }
});

test('viewer puede leer pero no escribir', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'cases', 'case-c'), { name: 'Caso C' });
      await setDoc(doc(db, 'caseMemberships', 'case-c_viewer-uid'), {
        caseId: 'case-c',
        userId: 'viewer-uid',
        role: 'viewer',
        status: 'active',
      });
    });

    const viewerContext = testEnv.authenticatedContext('viewer-uid');
    await assertSucceeds(getDoc(doc(viewerContext.firestore(), 'cases', 'case-c')));
    await assertFails(
      setDoc(doc(viewerContext.firestore(), 'cases', 'case-c'), { name: 'Intento de editar' }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('editor puede leer y escribir, pero no gestionar membresías', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'cases', 'case-d'), { name: 'Caso D' });
      await setDoc(doc(db, 'caseMemberships', 'case-d_editor-uid'), {
        caseId: 'case-d',
        userId: 'editor-uid',
        role: 'editor',
        status: 'active',
      });
    });

    const editorContext = testEnv.authenticatedContext('editor-uid');
    await assertSucceeds(
      setDoc(doc(editorContext.firestore(), 'cases', 'case-d'), { name: 'Editado' }),
    );

    await assertFails(
      setDoc(doc(editorContext.firestore(), 'caseMemberships', 'case-d_alguien-uid'), {
        caseId: 'case-d',
        userId: 'alguien-uid',
        role: 'viewer',
        status: 'active',
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('una membresía revocada (status distinto de "active") pierde el acceso', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'cases', 'case-e'), { name: 'Caso E' });
      await setDoc(doc(db, 'caseMemberships', 'case-e_revoked-uid'), {
        caseId: 'case-e',
        userId: 'revoked-uid',
        role: 'editor',
        status: 'revoked',
      });
    });

    const revokedContext = testEnv.authenticatedContext('revoked-uid');
    await assertFails(getDoc(doc(revokedContext.firestore(), 'cases', 'case-e')));
  } finally {
    await testEnv.cleanup();
  }
});

test('owner puede crear una membresía nueva; nadie puede borrar una membresía directamente', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-f_owner-uid'), {
        caseId: 'case-f',
        userId: 'owner-uid',
        role: 'owner',
        status: 'active',
      });
    });

    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertSucceeds(
      setDoc(doc(ownerContext.firestore(), 'caseMemberships', 'case-f_nuevo-uid'), {
        caseId: 'case-f',
        userId: 'nuevo-uid',
        role: 'viewer',
        status: 'active',
      }),
    );
    await assertFails(
      deleteDoc(doc(ownerContext.firestore(), 'caseMemberships', 'case-f_owner-uid')),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('ADR-018: nadie puede crear una membresía con role "owner" directamente (ni el propio owner del caso)', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-g_owner-uid'), {
        caseId: 'case-g',
        userId: 'owner-uid',
        role: 'owner',
        status: 'active',
      });
    });

    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertFails(
      setDoc(doc(ownerContext.firestore(), 'caseMemberships', 'case-g_otro-uid'), {
        caseId: 'case-g',
        userId: 'otro-uid',
        role: 'owner',
        status: 'active',
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('ADR-018: una membresía owner no puede modificarse (ni revocarse ni cambiar de rol) mediante una escritura normal', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-h_owner-uid'), {
        caseId: 'case-h',
        userId: 'owner-uid',
        role: 'owner',
        status: 'active',
      });
    });

    const ownerContext = testEnv.authenticatedContext('owner-uid');
    // Intento de revocarse a sí mismo.
    await assertFails(
      setDoc(doc(ownerContext.firestore(), 'caseMemberships', 'case-h_owner-uid'), {
        caseId: 'case-h',
        userId: 'owner-uid',
        role: 'owner',
        status: 'revoked',
      }),
    );
    // Intento de degradarse a editor (mismo problema: deja el caso sin owner).
    await assertFails(
      setDoc(doc(ownerContext.firestore(), 'caseMemberships', 'case-h_owner-uid'), {
        caseId: 'case-h',
        userId: 'owner-uid',
        role: 'editor',
        status: 'active',
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('deny by default: una colección no contemplada explícitamente queda bloqueada', async () => {
  const testEnv = await buildEnv();
  try {
    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertFails(
      setDoc(doc(ownerContext.firestore(), 'algunaColeccionNoContemplada', 'x'), { a: 1 }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('crear una invitación exige ser owner del caso', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-g_owner-uid'), {
        caseId: 'case-g',
        userId: 'owner-uid',
        role: 'owner',
        status: 'active',
      });
      await setDoc(doc(db, 'caseMemberships', 'case-g_editor-uid'), {
        caseId: 'case-g',
        userId: 'editor-uid',
        role: 'editor',
        status: 'active',
      });
    });

    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertSucceeds(
      setDoc(doc(ownerContext.firestore(), 'invitations', 'inv-1'), {
        caseId: 'case-g',
        email: 'nuevo@ejemplo.cl',
        role: 'viewer',
        status: 'pending',
      }),
    );

    const editorContext = testEnv.authenticatedContext('editor-uid');
    await assertFails(
      setDoc(doc(editorContext.firestore(), 'invitations', 'inv-2'), {
        caseId: 'case-g',
        email: 'otro@ejemplo.cl',
        role: 'viewer',
        status: 'pending',
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('listar la colección de invitaciones está prohibido para cualquiera (evita enumerarlas)', async () => {
  const testEnv = await buildEnv();
  try {
    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertFails(getDocs(collection(ownerContext.firestore(), 'invitations')));
  } finally {
    await testEnv.cleanup();
  }
});

// ---- Build 1.4: gastos (expenses/{expenseId}) ----

test('owner puede crear un gasto atribuido a sí mismo', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-i_owner-uid'), {
        caseId: 'case-i',
        userId: 'owner-uid',
        role: 'owner',
        status: 'active',
      });
    });
    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertSucceeds(
      setDoc(doc(ownerContext.firestore(), 'expenses', 'expense-1'), {
        caseId: 'case-i',
        category: 'Salud',
        amount: 10000,
        createdByUserId: 'owner-uid',
        updatedByUserId: 'owner-uid',
        createdAt: new Date().toISOString(),
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('editor puede crear un gasto', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-j_editor-uid'), {
        caseId: 'case-j',
        userId: 'editor-uid',
        role: 'editor',
        status: 'active',
      });
    });
    const editorContext = testEnv.authenticatedContext('editor-uid');
    await assertSucceeds(
      setDoc(doc(editorContext.firestore(), 'expenses', 'expense-2'), {
        caseId: 'case-j',
        category: 'Educación',
        amount: 5000,
        createdByUserId: 'editor-uid',
        updatedByUserId: 'editor-uid',
        createdAt: new Date().toISOString(),
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('viewer NO puede crear un gasto', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-k_viewer-uid'), {
        caseId: 'case-k',
        userId: 'viewer-uid',
        role: 'viewer',
        status: 'active',
      });
    });
    const viewerContext = testEnv.authenticatedContext('viewer-uid');
    await assertFails(
      setDoc(doc(viewerContext.firestore(), 'expenses', 'expense-3'), {
        caseId: 'case-k',
        category: 'Salud',
        amount: 1000,
        createdByUserId: 'viewer-uid',
        updatedByUserId: 'viewer-uid',
        createdAt: new Date().toISOString(),
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('un usuario externo (sin membresía) NO puede leer los gastos del caso', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'expenses', 'expense-4'), {
        caseId: 'case-l',
        category: 'Salud',
        amount: 1000,
        createdByUserId: 'owner-uid',
      });
    });
    const externalContext = testEnv.authenticatedContext('externo-uid');
    await assertFails(getDoc(doc(externalContext.firestore(), 'expenses', 'expense-4')));
  } finally {
    await testEnv.cleanup();
  }
});

test('nadie puede cambiar el caseId de un gasto existente', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-m_owner-uid'), {
        caseId: 'case-m',
        userId: 'owner-uid',
        role: 'owner',
        status: 'active',
      });
      await setDoc(doc(db, 'expenses', 'expense-5'), {
        caseId: 'case-m',
        category: 'Salud',
        amount: 1000,
        createdByUserId: 'owner-uid',
        updatedByUserId: 'owner-uid',
        createdAt: new Date().toISOString(),
      });
    });
    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertFails(
      setDoc(doc(ownerContext.firestore(), 'expenses', 'expense-5'), {
        caseId: 'case-otro', // intento de mover el gasto a otro caso
        category: 'Salud',
        amount: 1000,
        createdByUserId: 'owner-uid',
        updatedByUserId: 'owner-uid',
        createdAt: new Date().toISOString(),
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('nadie puede cambiar el createdByUserId original de un gasto', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-n_owner-uid'), {
        caseId: 'case-n',
        userId: 'owner-uid',
        role: 'owner',
        status: 'active',
      });
      await setDoc(doc(db, 'expenses', 'expense-6'), {
        caseId: 'case-n',
        category: 'Salud',
        amount: 1000,
        createdByUserId: 'owner-uid',
        updatedByUserId: 'owner-uid',
        createdAt: new Date().toISOString(),
      });
    });
    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertFails(
      setDoc(doc(ownerContext.firestore(), 'expenses', 'expense-6'), {
        caseId: 'case-n',
        category: 'Salud',
        amount: 2000,
        createdByUserId: 'otro-uid', // intento de reescribir el autor original
        updatedByUserId: 'owner-uid',
        createdAt: new Date().toISOString(),
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('un editor puede anular (actualizar) un gasto creado por el owner', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-o_editor-uid'), {
        caseId: 'case-o',
        userId: 'editor-uid',
        role: 'editor',
        status: 'active',
      });
      await setDoc(doc(db, 'expenses', 'expense-7'), {
        caseId: 'case-o',
        category: 'Salud',
        amount: 1000,
        createdByUserId: 'owner-uid',
        updatedByUserId: 'owner-uid',
        createdAt: new Date().toISOString(),
        deletedAt: null,
      });
    });
    const editorContext = testEnv.authenticatedContext('editor-uid');
    await assertSucceeds(
      setDoc(doc(editorContext.firestore(), 'expenses', 'expense-7'), {
        caseId: 'case-o',
        category: 'Salud',
        amount: 1000,
        createdByUserId: 'owner-uid',
        updatedByUserId: 'editor-uid',
        createdAt: new Date().toISOString(),
        deletedAt: new Date().toISOString(),
        cancelledByUserId: 'editor-uid',
        cancellationReason: 'gasto duplicado',
      }),
    );
  } finally {
    await testEnv.cleanup();
  }
});

test('nadie puede eliminar físicamente un gasto', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-p_owner-uid'), {
        caseId: 'case-p',
        userId: 'owner-uid',
        role: 'owner',
        status: 'active',
      });
      await setDoc(doc(db, 'expenses', 'expense-8'), {
        caseId: 'case-p',
        category: 'Salud',
        amount: 1000,
        createdByUserId: 'owner-uid',
      });
    });
    const ownerContext = testEnv.authenticatedContext('owner-uid');
    await assertFails(deleteDoc(doc(ownerContext.firestore(), 'expenses', 'expense-8')));
  } finally {
    await testEnv.cleanup();
  }
});

test('un miembro revocado pierde acceso a los gastos del caso', async () => {
  const testEnv = await buildEnv();
  try {
    await seed(testEnv, async (db) => {
      await setDoc(doc(db, 'caseMemberships', 'case-q_revoked-uid'), {
        caseId: 'case-q',
        userId: 'revoked-uid',
        role: 'editor',
        status: 'revoked',
      });
      await setDoc(doc(db, 'expenses', 'expense-9'), {
        caseId: 'case-q',
        category: 'Salud',
        amount: 1000,
        createdByUserId: 'owner-uid',
      });
    });
    const revokedContext = testEnv.authenticatedContext('revoked-uid');
    await assertFails(getDoc(doc(revokedContext.firestore(), 'expenses', 'expense-9')));
  } finally {
    await testEnv.cleanup();
  }
});
