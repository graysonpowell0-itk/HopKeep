"use client";

import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import type { AppUser } from "@/lib/models";

type AuthContextValue = {
  authUser: User | null;
  profile: AppUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readableAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to sign in.";
  if (message.includes("auth/invalid-credential")) return "Email or password is incorrect.";
  if (message.includes("auth/user-not-found")) return "No account exists for that email.";
  if (message.includes("auth/user-disabled")) return "This account is disabled.";
  if (message.includes("auth/too-many-requests")) return "Too many attempts. Try again shortly.";
  return message;
}

function normalizeProfile(user: User, raw: Record<string, unknown>, id: string): AppUser {
  const legacyRole = String(raw.role ?? "").toLowerCase();
  const role =
    raw.role === "property_manager" || legacyRole === "admin" || legacyRole === "manager"
      ? "property_manager"
      : raw.role === "property_admin"
        ? "property_admin"
        : "technician";

  const rawAssigned = Array.isArray(raw.assignedProperties) ? raw.assignedProperties.filter((item) => typeof item === "string") : [];
  const legacyProperty = typeof raw.propertyId === "string" ? [raw.propertyId] : [];
  const assignedProperties =
    role === "property_manager"
      ? ["hampton_inn", "holiday_inn_express", "queens_court_inn"]
      : rawAssigned.length
        ? rawAssigned
        : legacyProperty;

  return {
    id,
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name
        : typeof raw.displayName === "string" && raw.displayName.trim()
          ? raw.displayName
          : user.displayName || user.email?.split("@")[0] || "User",
    email: typeof raw.email === "string" && raw.email ? raw.email : user.email || "",
    role,
    assignedProperties,
    active: raw.active !== false && raw.accountStatus !== "rejected",
    createdAt: raw.createdAt as AppUser["createdAt"],
    updatedAt: raw.updatedAt as AppUser["updatedAt"],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      return;
    }

    const activeDb = db;

    return onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setError(null);
      setAuthUser(user);

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(activeDb, "users", user.uid));
        if (!snapshot.exists()) {
          const fallbackProfile: AppUser = {
            id: user.uid,
            name: user.displayName || user.email?.split("@")[0] || "User",
            email: user.email || "",
            role: "technician",
            assignedProperties: ["hampton_inn"],
            active: true,
          };

          await setDoc(
            doc(activeDb, "users", user.uid),
            {
              ...fallbackProfile,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
          setProfile(fallbackProfile);
          return;
        }

        const data = normalizeProfile(user, snapshot.data(), snapshot.id);
        if (data.active === false) {
          setProfile(null);
          setError("This user profile is inactive.");
          return;
        }

        const needsProfilePatch =
          snapshot.data().active !== data.active ||
          snapshot.data().role !== data.role ||
          !Array.isArray(snapshot.data().assignedProperties) ||
          snapshot.data().name !== data.name;

        if (needsProfilePatch) {
          try {
            await setDoc(
              doc(activeDb, "users", user.uid),
              {
                name: data.name,
                email: data.email,
                role: data.role,
                assignedProperties: data.assignedProperties,
                active: data.active,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
          } catch (patchError) {
            console.warn("Profile migration patch skipped.", patchError);
          }
        }

        setProfile(data);
      } catch (err) {
        setError(readableAuthError(err));
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authUser,
      profile,
      loading,
      error,
      async login(email, password) {
        if (!isFirebaseConfigured || !auth) {
          throw new Error("Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* env vars.");
        }
        setError(null);
        try {
          await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (err) {
          const message = readableAuthError(err);
          setError(message);
          throw new Error(message);
        }
      },
      async resetPassword(email) {
        if (!isFirebaseConfigured || !auth) {
          throw new Error("Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* env vars.");
        }
        setError(null);
        try {
          await sendPasswordResetEmail(auth, email.trim());
        } catch (err) {
          const message = readableAuthError(err);
          setError(message);
          throw new Error(message);
        }
      },
      async logout() {
        if (auth) await signOut(auth);
      },
    }),
    [authUser, profile, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
