import {
  getFirestore,
  enableIndexedDbPersistence,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
  type Firestore
} from 'firebase/firestore'
import { app } from './config'
import type { OrgUser, Template, TemplateGroup } from '@shared/types'

let _db: Firestore | null = null

/**
 * Singleton Firestore instance with IndexedDB offline persistence enabled.
 * Safe to call multiple times — returns the same instance.
 */
export function getDb(): Firestore {
  if (_db) return _db
  _db = getFirestore(app)
  if (canUseIndexedDbPersistence()) {
    enableIndexedDbPersistence(_db).catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn('[Firestore] Persistence unavailable: multiple tabs open.')
      } else if (err.code === 'unimplemented') {
        console.warn('[Firestore] Persistence not supported in this environment.')
      } else {
        console.warn('[Firestore] Persistence failed:', err)
      }
    })
  } else {
    console.warn('[Firestore] Persistence disabled: storage is not available in this environment.')
  }
  return _db
}

function canUseIndexedDbPersistence(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.location?.protocol === 'data:') return false
    const testKey = '__firestore_persistence_test__'
    window.localStorage.setItem(testKey, '1')
    window.localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
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
 * Saves a new group document under `orgs/{orgId}/groups`.
 * @returns The new Firestore document ID.
 */
export async function saveTemplateGroup(
  orgId: string,
  group: Omit<TemplateGroup, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const db = getDb()
  const ref = await addDoc(collection(db, 'orgs', orgId, 'groups'), {
    ...group,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return ref.id
}

/**
 * Updates the name of a group document.
 */
export async function updateTemplateGroup(
  orgId: string,
  groupId: string,
  name: string
): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, 'orgs', orgId, 'groups', groupId), {
    name,
    updatedAt: serverTimestamp()
  })
}

/**
 * Deletes a group and nullifies groupId on all templates that reference it.
 * Uses a Firestore batch for atomicity (safe up to ~500 templates).
 */
export async function deleteTemplateGroup(orgId: string, groupId: string): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)

  const templatesSnap = await getDocs(
    query(collection(db, 'orgs', orgId, 'templates'), where('groupId', '==', groupId))
  )
  templatesSnap.docs.forEach(d => batch.update(d.ref, { groupId: null }))
  batch.delete(doc(db, 'orgs', orgId, 'groups', groupId))

  await batch.commit()
}

/**
 * Batch-updates the `order` field on all groups to reflect a new sort order.
 */
export async function reorderTemplateGroups(
  orgId: string,
  orderedGroups: Array<{ id: string; order: number }>
): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)
  orderedGroups.forEach(({ id, order }) => {
    batch.update(doc(db, 'orgs', orgId, 'groups', id), { order, updatedAt: serverTimestamp() })
  })
  await batch.commit()
}

/**
 * Sets the `groupId` field on a single template document.
 */
export async function moveTemplateToGroupFirestore(
  orgId: string,
  templateId: string,
  groupId: string | null
): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, 'orgs', orgId, 'templates', templateId), { groupId })
}

/**
 * Updates all mutable fields of a template document.
 */
export async function updateTemplate(
  orgId: string,
  templateId: string,
  data: Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'createdByEmail'>
): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, 'orgs', orgId, 'templates', templateId), {
    ...data,
    updatedAt: serverTimestamp()
  })
}

/**
 * Updates the name of a template document.
 */
export async function updateTemplateName(
  orgId: string,
  templateId: string,
  name: string
): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, 'orgs', orgId, 'templates', templateId), {
    name,
    updatedAt: serverTimestamp()
  })
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
      displayName: user.displayName,
      lastSeenAt: serverTimestamp()
    },
    { merge: true }
  )
}
