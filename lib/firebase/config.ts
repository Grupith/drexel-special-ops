import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  getStorage,
  connectStorageEmulator,
  type FirebaseStorage,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

declare global {
  // eslint-disable-next-line no-var
  var __FIRESTORE_EMULATOR_CONNECTED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __AUTH_EMULATOR_CONNECTED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __STORAGE_EMULATOR_CONNECTED__: boolean | undefined;
}

const useEmulators =
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

function connectFirestoreIfNeeded(db: Firestore) {
  if (!useEmulators) return;
  if (globalThis.__FIRESTORE_EMULATOR_CONNECTED__) return;

  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  globalThis.__FIRESTORE_EMULATOR_CONNECTED__ = true;
}

function connectAuthIfNeeded(auth: Auth) {
  if (!useEmulators) return;
  if (globalThis.__AUTH_EMULATOR_CONNECTED__) return;

  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  globalThis.__AUTH_EMULATOR_CONNECTED__ = true;
}

function connectStorageIfNeeded(storage: FirebaseStorage) {
  if (!useEmulators) return;
  if (globalThis.__STORAGE_EMULATOR_CONNECTED__) return;

  connectStorageEmulator(storage, "127.0.0.1", 9199);
  globalThis.__STORAGE_EMULATOR_CONNECTED__ = true;
}

// Initialize Firebase once (safe for Next.js HMR)
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Storage
export const storage = getStorage(app);

// Connect to Firestore emulator in local development
connectFirestoreIfNeeded(db);
connectAuthIfNeeded(auth);
connectStorageIfNeeded(storage);
