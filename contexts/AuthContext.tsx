"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase/auth";
import { User, UserProfile } from "@/types";
import {
  createUserProfile,
  getUserProfile,
  updateLastLogin,
  userExists,
} from "@/lib/firebase/users";

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user profile from Firestore
  const fetchUserProfile = async (uid: string) => {
    const profile = await getUserProfile(uid);
    setUserProfile(profile);
    return profile;
  };

  // Handle new user creation
  const handleNewUser = async (firebaseUser: FirebaseUser) => {
    if (!firebaseUser.email) return;

    const exists = await userExists(firebaseUser.uid);

    if (!exists) {
      // Create new user profile in Firestore
      await createUserProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
      });

      console.log("✅ New user profile created in Firestore");
    } else {
      // Update last login for existing user
      await updateLastLogin(firebaseUser.uid);
    }

    // Fetch user profile
    await fetchUserProfile(firebaseUser.uid);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });

        // Handle user profile creation/update
        await handleNewUser(firebaseUser);
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // The onAuthStateChanged listener will handle the rest
  };

  const logout = async () => {
    await signOut(auth);
    setUserProfile(null);
  };

  const refreshUserProfile = async () => {
    if (user?.uid) {
      await fetchUserProfile(user.uid);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        signInWithGoogle,
        logout,
        refreshUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
