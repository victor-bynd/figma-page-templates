/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at
 * https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions/v2";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

const BRIDGE_COLLECTION = "authBridge";
const BRIDGE_TTL_MS = 5 * 60 * 1000;
const REGION = "us-central1";

// Allowed CORS origins — restrict to Firebase Hosting domain.
const ALLOWED_ORIGINS = [
  /^https:\/\/[a-z0-9-]+\.web\.app$/,
  /^https:\/\/[a-z0-9-]+\.firebaseapp\.com$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
  "outlook.com", "live.com", "aol.com", "icloud.com", "me.com", "mac.com",
  "mail.com", "protonmail.com", "proton.me", "zoho.com", "yandex.com",
  "gmx.com", "fastmail.com", "tutanota.com", "hey.com",
]);

/**
 * Derives an orgId from user email. Free-email users get a personal org.
 * @param {string} email User email.
 * @param {string} uid Firebase Auth UID.
 * @return {string} Derived orgId.
 */
function deriveOrgId(email: string, uid: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) {
    return `personal_${uid}`;
  }
  return "org_" + domain.replace(/\./g, "_");
}

type CreateBridgeBody = {
  idToken?: string;
  state?: string;
};

type ConsumeBridgeBody = {
  state?: string;
};

type BridgeDoc = {
  customToken?: string;
  expiresAt?: admin.firestore.Timestamp | Date;
};

type JsonResponder = {
  status: (code: number) => {
    json: (body: Record<string, unknown>) => void;
  };
};

/**
 * Validates the auth bridge state token.
 * @param {string | undefined} state State nonce from the UI.
 * @return {boolean} True if the state is acceptable.
 */
function isValidState(state: string | undefined): state is string {
  if (!state) return false;
  if (state.length < 16 || state.length > 128) return false;
  return true;
}

/**
 * Returns current time in milliseconds.
 * @return {number} Epoch millis.
 */
function nowMillis(): number {
  return Date.now();
}

/**
 * Sends a JSON response with a status code.
 * @param {JsonResponder} res HTTP response wrapper.
 * @param {number} status HTTP status code.
 * @param {Record<string, unknown>} payload JSON body.
 */
function respondJson(
  res: JsonResponder,
  status: number,
  payload: Record<string, unknown>
): void {
  res.status(status).json(payload);
}

/**
 * Creates a one-time custom token tied to a state nonce.
 */
export const createAuthBridge = onRequest(
  {region: REGION, cors: ALLOWED_ORIGINS},
  async (req, res) => {
    if (req.method !== "POST") {
      return respondJson(res, 405, {error: "METHOD_NOT_ALLOWED"});
    }

    const {idToken, state} = (req.body ?? {}) as CreateBridgeBody;
    if (!idToken || !isValidState(state)) {
      return respondJson(res, 400, {error: "INVALID_REQUEST"});
    }

    try {
      const decoded = await auth.verifyIdToken(idToken);
      const email = decoded.email ?? "";
      const orgId = deriveOrgId(email, decoded.uid);

      // Pass orgId as a developer claim — embedded in the custom token and
      // available in request.auth.token.orgId in Firestore rules immediately.
      const customToken = await auth.createCustomToken(decoded.uid, {orgId});

      // Also persist as a custom claim so it survives token refreshes.
      // Non-fatal: the developer claim above covers the initial session.
      try {
        await auth.setCustomUserClaims(decoded.uid, {orgId});
      } catch (claimsErr) {
        logger.warn("setCustomUserClaims failed (non-critical)", claimsErr);
      }

      const expiresAt = new Date(nowMillis() + BRIDGE_TTL_MS);
      const docRef = db.collection(BRIDGE_COLLECTION).doc(state);

      await docRef.set({
        customToken,
        uid: decoded.uid,
        email: email || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
      });

      return respondJson(res, 200, {ok: true});
    } catch (err) {
      logger.error("createAuthBridge failed", err);
      return respondJson(res, 500, {error: "INTERNAL_ERROR"});
    }
  }
);

/**
 * Exchanges a state nonce for a single-use custom token.
 */
export const consumeAuthBridge = onRequest(
  {region: REGION, cors: true},
  async (req, res) => {
    if (req.method !== "POST") {
      return respondJson(res, 405, {error: "METHOD_NOT_ALLOWED"});
    }

    const {state} = (req.body ?? {}) as ConsumeBridgeBody;
    if (!isValidState(state)) {
      return respondJson(res, 400, {error: "INVALID_REQUEST"});
    }

    try {
      const docRef = db.collection(BRIDGE_COLLECTION).doc(state);
      const snap = await docRef.get();
      if (!snap.exists) {
        return respondJson(res, 404, {error: "NOT_READY"});
      }

      const data = snap.data() as BridgeDoc | undefined;
      const customToken = data?.customToken;
      if (!customToken) {
        await docRef.delete();
        return respondJson(res, 410, {error: "MISSING_TOKEN"});
      }

      const expiresAt = data?.expiresAt;
      let expiresAtMs: number | null = null;
      if (expiresAt instanceof admin.firestore.Timestamp) {
        expiresAtMs = expiresAt.toMillis();
      } else if (expiresAt instanceof Date) {
        expiresAtMs = expiresAt.getTime();
      }

      if (expiresAtMs !== null && nowMillis() > expiresAtMs) {
        await docRef.delete();
        return respondJson(res, 410, {error: "EXPIRED"});
      }

      await docRef.delete();
      return respondJson(res, 200, {customToken});
    } catch (err) {
      logger.error("consumeAuthBridge failed", err);
      return respondJson(res, 500, {error: "INTERNAL_ERROR"});
    }
  }
);

/**
 * Exchanges a valid Firebase ID token for a fresh custom token.
 * Used by the Figma plugin to restore auth sessions across reopens.
 * The plugin caches the user's refresh token in figma.clientStorage,
 * exchanges it for a fresh ID token via the REST API, then calls this
 * endpoint to get a custom token for signInWithCustomToken.
 */
export const refreshSession = onRequest(
  {region: REGION, cors: true},
  async (req, res) => {
    if (req.method !== "POST") {
      return respondJson(res, 405, {error: "METHOD_NOT_ALLOWED"});
    }

    const {idToken} = (req.body ?? {}) as { idToken?: string };
    if (!idToken) {
      return respondJson(res, 400, {error: "INVALID_REQUEST"});
    }

    try {
      const decoded = await auth.verifyIdToken(idToken);
      const email = decoded.email ?? "";
      const orgId = deriveOrgId(email, decoded.uid);

      const customToken = await auth.createCustomToken(decoded.uid, {orgId});

      // Refresh the custom claim in case it was missing or stale.
      try {
        await auth.setCustomUserClaims(decoded.uid, {orgId});
      } catch (claimsErr) {
        logger.warn("refreshSession: setCustomUserClaims failed", claimsErr);
      }

      return respondJson(res, 200, {customToken});
    } catch (err) {
      logger.error("refreshSession failed", err);
      return respondJson(res, 401, {error: "INVALID_TOKEN"});
    }
  }
);

/**
 * Hourly cleanup of expired auth bridge documents.
 */
export const cleanupExpiredBridges = onSchedule(
  {schedule: "every 1 hours", region: REGION},
  async () => {
    const now = new Date();
    const snap = await db
      .collection(BRIDGE_COLLECTION)
      .where("expiresAt", "<", now)
      .limit(500)
      .get();

    if (snap.empty) {
      logger.info("cleanupExpiredBridges: no expired docs");
      return;
    }

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    logger.info(`cleanupExpiredBridges: deleted ${snap.size} docs`);
  }
);
