import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { app } from './config';
/**
 * Singleton Firebase Auth instance.
 */
export var auth = getAuth(app);
/**
 * Configured Google OAuth provider.
 * Requests profile and email scopes by default.
 */
export var googleProvider = new GoogleAuthProvider();
