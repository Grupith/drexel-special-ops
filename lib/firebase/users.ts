import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db } from "./db";
import { UserProfile } from "@/types";

/**
 * Create a new user profile in Firestore
 */
export async function createUserProfile(userData: {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}) {
  try {
    const userRef = doc(db, "users", userData.uid);

    await setDoc(userRef, {
      uid: userData.uid,
      email: userData.email,
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      preferences: {
        defaultVendor: "",
        emailNotifications: true,
      },
      stats: {
        totalSplits: 0,
        completedSplits: 0,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error creating user profile:", error);
    return { success: false, error };
  }
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return {
        ...userSnap.data(),
        createdAt: userSnap.data().createdAt?.toDate(),
        lastLoginAt: userSnap.data().lastLoginAt?.toDate(),
      } as UserProfile;
    }

    return null;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
}

/**
 * Update user's last login time
 */
export async function updateLastLogin(uid: string) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      lastLoginAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error updating last login:", error);
    return { success: false, error };
  }
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(
  uid: string,
  preferences: Partial<UserProfile["preferences"]>
) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      preferences,
    });
    return { success: true };
  } catch (error) {
    console.error("Error updating preferences:", error);
    return { success: false, error };
  }
}

/**
 * Increment user stats when a split is created/completed
 */
export async function incrementUserStats(
  uid: string,
  field: "totalSplits" | "completedSplits"
) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      [`stats.${field}`]: increment(1),
    });
    return { success: true };
  } catch (error) {
    console.error("Error incrementing stats:", error);
    return { success: false, error };
  }
}

/**
 * Check if user exists in Firestore
 */
export async function userExists(uid: string): Promise<boolean> {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    return userSnap.exists();
  } catch (error) {
    console.error("Error checking user existence:", error);
    return false;
  }
}
