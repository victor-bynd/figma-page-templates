/**
 * Firestore Security Rules tests.
 *
 * Prerequisites:
 *   firebase emulators:start --only firestore
 *
 * Run:
 *   pnpm test
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  collection,
  addDoc
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

const PROJECT_ID = 'figma-page-templates-test'
const RULES_PATH = resolve(__dirname, '../firestore.rules')

let testEnv: RulesTestEnvironment

// We create two users in org_example_com and one in org_other_com.
const ALICE = { uid: 'alice', email: 'alice@example.com', orgId: 'org_example_com' }
const BOB = { uid: 'bob', email: 'bob@example.com', orgId: 'org_example_com' }
const CAROL = { uid: 'carol', email: 'carol@other.com', orgId: 'org_other_com' }

function makeTokenClaims(user: typeof ALICE) {
  return { uid: user.uid, email: user.email }
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: 'localhost',
      port: 8080
    }
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()

  // Seed user documents so belongsToOrg() can resolve during rule evaluation.
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', ALICE.uid), {
      email: ALICE.email,
      orgId: ALICE.orgId
    })
    await setDoc(doc(db, 'users', BOB.uid), {
      email: BOB.email,
      orgId: BOB.orgId
    })
    await setDoc(doc(db, 'users', CAROL.uid), {
      email: CAROL.email,
      orgId: CAROL.orgId
    })
    // Seed a template owned by Alice
    await setDoc(
      doc(db, 'orgs', ALICE.orgId, 'templates', 'tmpl_1'),
      { name: 'My Template', createdBy: ALICE.uid, pages: [] }
    )
  })
})

// ---------------------------------------------------------------------------
// Template read tests
// ---------------------------------------------------------------------------

describe('template reads', () => {
  it('allows an org member to read their org templates', async () => {
    const db = testEnv
      .authenticatedContext(ALICE.uid, makeTokenClaims(ALICE))
      .firestore()
    await assertSucceeds(
      getDoc(doc(db, 'orgs', ALICE.orgId, 'templates', 'tmpl_1'))
    )
  })

  it('denies a member of a different org from reading templates', async () => {
    const db = testEnv
      .authenticatedContext(CAROL.uid, makeTokenClaims(CAROL))
      .firestore()
    await assertFails(
      getDoc(doc(db, 'orgs', ALICE.orgId, 'templates', 'tmpl_1'))
    )
  })

  it('denies unauthenticated reads', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      getDoc(doc(db, 'orgs', ALICE.orgId, 'templates', 'tmpl_1'))
    )
  })
})

// ---------------------------------------------------------------------------
// Template create tests
// ---------------------------------------------------------------------------

describe('template creates', () => {
  it('allows an org member to create a template in their org', async () => {
    const db = testEnv
      .authenticatedContext(ALICE.uid, makeTokenClaims(ALICE))
      .firestore()
    await assertSucceeds(
      addDoc(collection(db, 'orgs', ALICE.orgId, 'templates'), {
        name: 'New Template',
        createdBy: ALICE.uid,
        pages: []
      })
    )
  })

  it('denies creating a template in a different org', async () => {
    const db = testEnv
      .authenticatedContext(CAROL.uid, makeTokenClaims(CAROL))
      .firestore()
    await assertFails(
      addDoc(collection(db, 'orgs', ALICE.orgId, 'templates'), {
        name: 'Intruder Template',
        createdBy: CAROL.uid,
        pages: []
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Template delete tests
// ---------------------------------------------------------------------------

describe('template deletes', () => {
  it('allows a template creator to delete their own template', async () => {
    const db = testEnv
      .authenticatedContext(ALICE.uid, makeTokenClaims(ALICE))
      .firestore()
    await assertSucceeds(
      deleteDoc(doc(db, 'orgs', ALICE.orgId, 'templates', 'tmpl_1'))
    )
  })

  it('denies a different org member from deleting another user\'s template', async () => {
    const db = testEnv
      .authenticatedContext(BOB.uid, makeTokenClaims(BOB))
      .firestore()
    await assertFails(
      deleteDoc(doc(db, 'orgs', ALICE.orgId, 'templates', 'tmpl_1'))
    )
  })
})

// ---------------------------------------------------------------------------
// Template update tests
// ---------------------------------------------------------------------------

describe('template updates', () => {
  it('allows an org member to update a template', async () => {
    const db = testEnv
      .authenticatedContext(BOB.uid, makeTokenClaims(BOB))
      .firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'orgs', ALICE.orgId, 'templates', 'tmpl_1'), {
        name: 'Updated by Bob'
      })
    )
  })

  it('denies changing createdBy on an existing template', async () => {
    const db = testEnv
      .authenticatedContext(BOB.uid, makeTokenClaims(BOB))
      .firestore()
    await assertFails(
      updateDoc(doc(db, 'orgs', ALICE.orgId, 'templates', 'tmpl_1'), {
        createdBy: BOB.uid
      })
    )
  })
})
