import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hopKeepFirebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyBE2_l_9nsDJBYCxV4SoOazx4MQlwrTM0E",
  authDomain: "hopkeep-f71ca.firebaseapp.com",
  projectId: "hopkeep-f71ca",
  storageBucket: "hopkeep-f71ca.firebasestorage.app",
  messagingSenderId: "28654125289",
  appId: "1:28654125289:web:42e433920c1f6ab4073078",
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

function hasEnvFirebaseConfig(config: FirebaseOptions) {
  return Boolean(
    config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.storageBucket &&
      config.messagingSenderId &&
      config.appId,
  );
}

function hasInitializedFirebaseConfig(activeApp: FirebaseApp | null) {
  return Boolean(activeApp?.options.apiKey && activeApp.options.projectId && activeApp.options.appId);
}

try {
  app = getApps().length
    ? getApps()[0]
    : initializeApp(hasEnvFirebaseConfig(firebaseConfig) ? firebaseConfig : hopKeepFirebaseConfig);
} catch {
  app = null;
}

export const isFirebaseConfigured = hasInitializedFirebaseConfig(app);

if (app && isFirebaseConfigured) {
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { app, auth, db, storage };
