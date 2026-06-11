"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
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
  createAccount: (input: CreateAccountInput) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

export type CreateAccountInput = {
  name: string;
  email: string;
  password: string;
  requestedRole: "technician" | "property_manager";
  assignedProperties: string[];
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readableAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to sign in.";
  if (message.includes("auth/invalid-credential")) return "Email or password is incorrect.";
  if (message.includes("auth/user-not-found")) return "No account exists for that email.";
  if (message.includes("auth/user-disabled")) return "This account is disabled.";
  if (message.includes("auth/too-many-requests")) return "Too many attempts. Try again shortly.";
  if (message.includes("auth/email-already-in-use")) return "An account already exists for that email.";
  if (message.includes("auth/weak-password")) return "Use a stronger password with at least 6 characters.";
  return message;
}

function normalizeProfile(user: User, raw: Record<string, unknown>, id: string): AppUser {
  const legacyRole = String(raw.role ?? "").toLowerCase();
  const role =
    raw.role === "owner" || legacyRole === "owner"
      ? "owner"
      : raw.role === "property_manager" || legacyRole === "admin" || legacyRole === "manager"
      ? "property_manager"
      : raw.role === "property_admin"
        ? "property_admin"
        : "technician";

  const rawAssigned = Array.isArray(raw.assignedProperties) ? raw.assignedProperties.filter((item) => typeof item === "string") : [];
  const legacyProperty = typeof raw.propertyId === "string" ? [raw.propertyId] : [];
  const assignedProperties =
    role === "property_manager" || role === "owner"
      ? ["hampton_inn", "holiday_inn_express", "queens_court_inn"]
      : rawAssigned.length
        ? rawAssigned
        : legacyProperty;

  const accountStatus =
    raw.accountStatus === "pending_admin" ||
    raw.accountStatus === "pending_owner" ||
    raw.accountStatus === "approved" ||
    raw.accountStatus === "rejected"
      ? raw.accountStatus
      : raw.active === false
        ? "pending_admin"
        : "approved";
  const pendingPropertyIds = Array.isArray(raw.pendingPropertyIds)
    ? raw.pendingPropertyIds.filter((item) => typeof item === "string")
    : [];
  const dailyPropertyId = typeof raw.dailyPropertyId === "string" ? raw.dailyPropertyId : assignedProperties[0] ?? "";
  const propertyChangeStatus =
    raw.propertyChangeStatus === "pending" || raw.propertyChangeStatus === "approved" || raw.propertyChangeStatus === "rejected"
      ? raw.propertyChangeStatus
      : undefined;

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
    dailyPropertyId,
    pendingPropertyIds,
    propertyChangeStatus,
    propertyChangeRequestedAt: raw.propertyChangeRequestedAt as AppUser["propertyChangeRequestedAt"],
    propertyChangeRequestedBy: raw.propertyChangeRequestedBy as AppUser["propertyChangeRequestedBy"],
    propertyChangeReviewedBy: raw.propertyChangeReviewedBy as AppUser["propertyChangeReviewedBy"],
    propertyChangeReviewedByName: raw.propertyChangeReviewedByName as AppUser["propertyChangeReviewedByName"],
    propertyChangeReviewedAt: raw.propertyChangeReviewedAt as AppUser["propertyChangeReviewedAt"],
    active: raw.active !== false && accountStatus === "approved",
    accountStatus,
    requestedRole: raw.requestedRole as AppUser["requestedRole"],
    approvalRequiredBy: raw.approvalRequiredBy as AppUser["approvalRequiredBy"],
    approvedBy: raw.approvedBy as AppUser["approvedBy"],
    approvedByName: raw.approvedByName as AppUser["approvedByName"],
    approvedAt: raw.approvedAt as AppUser["approvedAt"],
    photoUrl: typeof raw.photoUrl === "string" ? raw.photoUrl : "",
    phone: typeof raw.phone === "string" ? raw.phone : "",
    jobTitle: typeof raw.jobTitle === "string" ? raw.jobTitle : "",
    department: typeof raw.department === "string" ? raw.department : "",
    bio: typeof raw.bio === "string" ? raw.bio : "",
    createdAt: raw.createdAt as AppUser["createdAt"],
    updatedAt: raw.updatedAt as AppUser["updatedAt"],
  };
}

function pendingAccountMessage(profile: AppUser) {
  if (profile.accountStatus === "rejected") {
    return "This account request was rejected. Contact a HopKeep administrator for help.";
  }
  if (profile.approvalRequiredBy === "owner" || profile.accountStatus === "pending_owner") {
    return "Your admin account request is pending owner approval.";
  }
  return "Your maintenance tech account request is pending admin approval.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isAdminPreview =
      ["localhost", "127.0.0.1"].includes(window.location.hostname) && params.get("preview") === "admin";

    if (isAdminPreview) {
      setAuthUser(null);
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!auth || !db) {
      setLoading(false);
      return;
    }

    const activeDb = db;
    const startupTimer = window.setTimeout(() => {
      setLoading(false);
      setError("Startup took too long. Check your network connection and refresh the app.");
    }, 12000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      window.clearTimeout(startupTimer);
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
          setProfile(null);
          setError("No staff profile exists for this account. Use Create account to request access.");
          setLoading(false);
          return;
        }

        const data = normalizeProfile(user, snapshot.data(), snapshot.id);
        if (data.active === false) {
          setProfile(null);
          setError(pendingAccountMessage(data));
          setLoading(false);
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
                accountStatus: data.accountStatus,
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

    return () => {
      window.clearTimeout(startupTimer);
      unsubscribe();
    };
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
      async createAccount(input) {
        if (!isFirebaseConfigured || !auth || !db) {
          throw new Error("Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* env vars.");
        }

        setError(null);
        const email = input.email.trim();
        const name = input.name.trim();
        const requestedRole = input.requestedRole;
        const accountStatus = requestedRole === "property_manager" ? "pending_owner" : "pending_admin";
        const approvalRequiredBy = requestedRole === "property_manager" ? "owner" : "admin";
        const managerProperties = ["hampton_inn", "holiday_inn_express", "queens_court_inn"];
        const requestedProperties = Array.from(new Set(input.assignedProperties)).filter(Boolean);
        const assignedProperties =
          requestedRole === "property_manager" ? managerProperties : requestedProperties.length ? requestedProperties : ["hampton_inn"];

        try {
          const credential = await createUserWithEmailAndPassword(auth, email, input.password);
          if (name) await updateProfile(credential.user, { displayName: name });
          await setDoc(doc(db, "users", credential.user.uid), {
            name: name || email.split("@")[0],
            email,
            role: requestedRole,
            requestedRole,
            assignedProperties,
            dailyPropertyId: assignedProperties[0] ?? "",
            active: false,
            accountStatus,
            approvalRequiredBy,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await signOut(auth);
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
