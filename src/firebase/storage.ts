import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  type FirebaseStorage
} from 'firebase/storage'
import { app } from './config'

const storage: FirebaseStorage = getStorage(app)

export class StorageUploadError extends Error {
  constructor(
    public readonly orgId: string,
    public readonly templateId: string,
    public readonly cause: unknown
  ) {
    super(
      `Failed to upload cover image for org "${orgId}" / template "${templateId}"`
    )
    this.name = 'StorageUploadError'
  }
}

/**
 * Uploads a cover image to Firebase Storage.
 *
 * @param orgId      - The organisation ID (used as a path segment).
 * @param templateId - The template ID (used as a path segment).
 * @param bytes      - Raw image bytes to upload.
 * @returns The public download URL of the uploaded image.
 * @throws {StorageUploadError} on any upload failure.
 */
export async function uploadCoverImage(
  orgId: string,
  templateId: string,
  bytes: Uint8Array
): Promise<string> {
  const storagePath = `covers/${orgId}/${templateId}`
  const imageRef = ref(storage, storagePath)
  try {
    const snapshot = await uploadBytes(imageRef, bytes, {
      contentType: 'image/png'
    })
    return await getDownloadURL(snapshot.ref)
  } catch (err) {
    throw new StorageUploadError(orgId, templateId, err)
  }
}
