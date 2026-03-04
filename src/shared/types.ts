/**
 * A section within a template page, corresponding to a top-level frame.
 */
export interface TemplateSection {
  /** Display name of the section frame. */
  name: string
  /** Horizontal position of the frame on the page canvas. */
  x: number
  /** Vertical position of the frame on the page canvas. */
  y: number
  /** Width of the frame in pixels. */
  width: number
  /** Height of the frame in pixels. */
  height: number
}

/**
 * A single page captured from a Figma file.
 */
export interface TemplatePage {
  /** Display name of the page. */
  name: string
  /** Top-level frame sections on this page. */
  sections: TemplateSection[]
}

/**
 * Reference to a Figma library file used for cover components.
 */
export interface CoverLibrary {
  /** Full Figma file URL (e.g. https://figma.com/design/:key/...). */
  fileUrl: string
  /** Extracted Figma file key from the URL. */
  fileKey: string
}

/**
 * Configuration for the Cover page component placement.
 */
export interface CoverConfig {
  /** Figma component key for the cover component instance. */
  componentKey: string
  /** The linked library file this component belongs to. */
  library: CoverLibrary
}

/**
 * A text layer within a cover component that can be overridden.
 */
export interface TextLayerOverride {
  /** Figma node ID of the text node. */
  nodeId: string
  /** Human-readable name of the layer in the Figma hierarchy. */
  layerName: string
  /** Current text content of the layer. */
  currentValue: string
}

/**
 * A user record, created on first sign-in and stored in Firestore.
 */
export interface OrgUser {
  /** Firebase Auth UID. */
  uid: string
  /** User's email address. */
  email: string
  /** Derived org ID: "org_" + email domain with dots replaced by underscores. */
  orgId: string
  /** User's display name from Google profile. */
  displayName: string | null
}

/**
 * A full template document stored in Firestore under orgs/{orgId}/templates.
 */
export interface Template {
  /** Optional schema version for exported/imported templates. */
  schemaVersion?: number
  /** Firestore document ID (omitted when creating). */
  id: string
  /** Human-readable name of the template. */
  name: string
  /** Optional description of what this template is for. */
  description: string
  /** List of pages and their sections. */
  pages: TemplatePage[]
  /** Optional cover page component configuration. */
  coverConfig: CoverConfig | null
  /** UID of the user who created this template. */
  createdBy: string
  /** Email of the creator (denormalized for display). */
  createdByEmail: string
  /** Firestore server timestamp of creation. */
  createdAt: Date | null
  /** Firestore server timestamp of last update. */
  updatedAt: Date | null
}
