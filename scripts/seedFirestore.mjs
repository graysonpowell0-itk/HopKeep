import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

const seedProperties = [
  {
    id: "hampton_inn",
    name: "Hampton Inn",
    address: "Saint Simons Island, GA",
    totalRooms: 79,
    roomStartNumber: 109,
    active: true,
  },
  {
    id: "holiday_inn_express",
    name: "Holiday Inn Express",
    address: "Brunswick, GA",
    totalRooms: 60,
    roomStartNumber: 101,
    active: true,
  },
  {
    id: "queens_court_inn",
    name: "Queens Court Inn",
    address: "Brunswick, GA",
    totalRooms: 23,
    roomStartNumber: 101,
    active: true,
  },
];

const required = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);

await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const now = serverTimestamp();

for (const property of seedProperties) {
  await setDoc(
    doc(db, "properties", property.id),
    {
      ...property,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  console.log(`Seeded property ${property.id}`);
}

console.log("Seed complete.");
