import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { app } from './config';
var _db = null;
/**
 * Singleton Firestore instance with IndexedDB offline persistence enabled.
 * Safe to call multiple times — returns the same instance.
 */
export function getDb() {
    if (_db)
        return _db;
    _db = getFirestore(app);
    enableIndexedDbPersistence(_db).catch(function (err) {
        if (err.code === 'failed-precondition') {
            // Multiple tabs open — persistence available in only one tab at a time.
            console.warn('[Firestore] Persistence unavailable: multiple tabs open.');
        }
        else if (err.code === 'unimplemented') {
            // Browser doesn't support IndexedDB persistence.
            console.warn('[Firestore] Persistence not supported in this environment.');
        }
    });
    return _db;
}
