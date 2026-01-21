// Firebase initialization helper (v9 modular SDK)
// Usage: fill the firebaseConfig object with the values from your Firebase console
// Then import { auth } from './firebase' where you need to access Firebase Auth.

import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
// AsyncStorage persistence for React Native (install with `expo install @react-native-async-storage/async-storage`)
// Analytics is web-only; initialize conditionally to avoid runtime errors on native.
import { getAnalytics } from 'firebase/analytics';

// Your Firebase web config — filled from the values you pasted.
const firebaseConfig = {
  apiKey: "AIzaSyBjkuYTjHijnAS_kfA6EtihcydLIwojeaY",
  authDomain: "stride-sd.firebaseapp.com",
  projectId: "stride-sd",
  storageBucket: "stride-sd.firebasestorage.app",
  messagingSenderId: "1040557687459",
  appId: "1:1040557687459:web:bf4cd3e7b9a0b7879cb516",
  measurementId: "G-GRY4C3BZ55",
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  app = initializeApp(firebaseConfig);
  // Use default getAuth (memory persistence). We intentionally skip persistent storage
  // so users will sign in each time the app starts (simpler for now).
  auth = getAuth(app);

  // Initialize Firestore
  try {
    db = getFirestore(app);
  } catch (dbErr) {
    console.log('Failed to initialize Firestore:', dbErr);
    db = null;
  }

  // Initialize analytics only when running in a browser environment (Expo web).
  try {
    if (typeof window !== 'undefined' && (window as any).document) {
      // Safe to call web-only analytics
      getAnalytics(app);
    }
  } catch (analyticsInitError) {
    // Non-fatal: analytics is optional and may fail on native runtimes
    console.log('Firebase analytics not initialized (expected on native):', analyticsInitError);
  }

} catch (e) {
  // Initialization can fail during tests or if config is invalid. Keep app/auth nullable.
  // Avoid throwing here so the rest of the app can run in dev with placeholder behavior.
  console.log('Firebase initialization skipped or failed. Fill firebaseConfig in app/firebase.ts to enable auth.', e);
}

export default app;
export { auth, db };
