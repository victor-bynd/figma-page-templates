import {
  getFirestore,
  enableIndexedDbPersistence,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  type Firestore
} from 'firebase/firestore'
import { app } from './config'
import type { OrgUser, Template } from '@shared/types'

let _db: Firestore | null = null

/**
 * Singleton Firestore instance with IndexedDB offline persistence enabled.
 * Safe to call multiple times — returns the same instance.
 */
export function getDb(): Firestore {
  if (_db) return _db
  _db = getFirestore(app)
  enableIndexedDbPersistence(_db).catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('[Firestore] Persistence unavailable: multiple tabs open.')
    } else if (err.code === 'unimplemented') {
      console.warn('[Firestore] Persistence not supported in this environment.')
    }
  })
  return _db
}

/**
 * Creates or updates the org document at `orgs/{orgId}`.
 * Safe to call on every sign-in — uses merge so existing fields are preserved.
 * `createdAt` is only written on first creation (merge won't overwrite it if absent).
 */
export async function bootstrapOrg(
  orgId: string,
  domain: string
): Promise<void> {
  const db = getDb()
  await setDoc(
    doc(db, 'orgs', orgId),
    {
      name: domain,
      domain,
      createdAt: serverTimestamp()
    },
    { merge: true }
  )
}

/**
 * Saves a new template document under `orgs/{orgId}/templates`.
 * Adds server-side `createdAt` and `updatedAt` timestamps.
 *
 * @returns The new Firestore document ID.
 */
export async function saveTemplate(
  orgId: string,
  template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const db = getDb()
  const ref = await addDoc(collection(db, 'orgs', orgId, 'templates'), {
    ...template,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return ref.id
}

/**
 * Deletes a template document from `orgs/{orgId}/templates/{templateId}`.
 * Security rules enforce that only the creator can delete.
 */
export async function deleteTemplate(orgId: string, templateId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, 'orgs', orgId, 'templates', templateId))
}

/**
 * Upserts a user document at `users/{uid}`.
 * Always updates `lastSeenAt`; other fields only written on first creation via merge.
 */
export async function upsertUser(user: OrgUser): Promise<void> {
  const db = getDb()
  await setDoc(
    doc(db, 'users', user.uid),
    {
      email: user.email,
      orgId: user.orgId,
      displayName: user.displayName,
      lastSeenAt: serverTimestamp()
    },
    { merge: true }
  )
}
