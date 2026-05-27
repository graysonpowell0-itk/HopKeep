import { readFileSync, existsSync } from "node:fs";
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

function loadDotEnv(path = ".env.local") {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    process.env[key] ||= valueParts.join("=");
  }
}

loadDotEnv();

const required = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const password = process.env.TEST_USER_PASSWORD;
if (!password) {
  console.error("Set TEST_USER_PASSWORD to create or reuse smoke-test users.");
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
const storage = getStorage(app);

const runId = new Date().toISOString().replace(/\D/g, "");
const today = new Date().toISOString().slice(0, 10);
const testUsers = [
  { name: "Avery Technician", email: `hopkeep.tech.avery+${runId}@example.com`, propertyId: "hampton_inn" },
  { name: "Blake Technician", email: `hopkeep.tech.blake+${runId}@example.com`, propertyId: "hampton_inn" },
  { name: "Casey Technician", email: `hopkeep.tech.casey+${runId}@example.com`, propertyId: "hampton_inn" },
];

const tinyPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axn3j8AAAAASUVORK5CYII=";

async function signInOrCreateUser(email, displayName) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    return { user: credential.user, created: true };
  } catch (error) {
    if (!String(error?.message ?? "").includes("auth/email-already-in-use")) throw error;
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { user: credential.user, created: false };
  }
}

async function runUserFlow(testUser) {
  const result = {
    email: testUser.email,
    uid: "",
    created: false,
    auth: false,
    profileSaved: false,
    storageSaved: false,
    reportSaved: false,
    reportRetrieved: false,
    logId: "",
    error: "",
  };

  const { user, created } = await signInOrCreateUser(testUser.email, testUser.name);
  result.uid = user.uid;
  result.created = created;
  result.auth = Boolean(user.uid);
  const userRef = doc(db, "users", user.uid);

  await setDoc(
    userRef,
    {
      name: testUser.name,
      email: testUser.email,
      role: "technician",
      assignedProperties: [testUser.propertyId],
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  const savedProfile = await getDoc(userRef);
  if (!savedProfile.exists()) {
    throw new Error(`Profile was not readable after save for ${testUser.email}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
  result.profileSaved = true;
  await user.getIdToken(true);

  const logRef = doc(collection(db, "repairLogs"));
  result.logId = logRef.id;
  let beforePhotoUrls = [];

  try {
    const imageRef = ref(storage, `repairLogs/${testUser.propertyId}/${user.uid}/${logRef.id}/before/${Date.now()}-smoke.png`);
    await uploadBytes(imageRef, Buffer.from(tinyPng, "base64"), { contentType: "image/png" });
    const imageUrl = await getDownloadURL(imageRef);
    const imageResponse = await fetch(imageUrl);
    beforePhotoUrls = [imageUrl];
    result.storageSaved = imageResponse.ok;
  } catch (error) {
    result.error = String(error?.message ?? error);
  }

  await setDoc(logRef, {
    propertyId: testUser.propertyId,
    roomOrLocation: `Smoke Test ${runId}`,
    locationType: "room",
    category: "Other",
    issueDescription: "Automated smoke test image upload and report submission.",
    repairExplanation: "Automated smoke test verified Firebase Auth, Storage, Firestore write, and dashboard retrieval shape.",
    partsUsed: "None",
    technicianId: user.uid,
    technicianName: testUser.name,
    technicianEmail: testUser.email,
    startTime: `${today}T09:00`,
    endTime: `${today}T09:15`,
    totalMinutes: 15,
    beforePhotoUrls,
    afterPhotoUrls: [],
    statusAfterRepair: "fixed",
    approvalStatus: "pending",
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  result.reportSaved = true;

  const latestLogs = await getDocs(
    query(
      collection(db, "repairLogs"),
      where("technicianId", "==", user.uid),
      limit(5),
    ),
  );
  result.reportRetrieved = latestLogs.docs.some((entry) => entry.id === logRef.id);

  return result;
}

const results = [];
for (const testUser of testUsers) {
  try {
    results.push(await runUserFlow(testUser));
  } catch (error) {
    results.push({
      email: testUser.email,
      uid: "",
      created: false,
      auth: false,
      profileSaved: false,
      storageSaved: false,
      reportSaved: false,
      reportRetrieved: false,
      logId: "",
      error: String(error?.message ?? error),
    });
  }
}

console.table(results);

const failed = results.filter((result) => !result.auth || !result.profileSaved || !result.storageSaved || !result.reportSaved || !result.reportRetrieved);
if (failed.length) {
  console.error("Firebase smoke test failed.", failed);
  if (failed.some((result) => result.error.includes("storage/unknown") || result.error.includes("404"))) {
    console.error(
      `Storage returned 404. In Firebase console, open project ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID} > Storage and click Get Started to initialize the default bucket, then deploy storage.rules.`,
    );
  }
  process.exit(1);
}

console.log("Firebase smoke test passed.");
process.exit(0);
