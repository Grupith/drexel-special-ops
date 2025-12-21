// lib/firebase/db.ts
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "./db";

import { incrementUserStats } from "./users";
import { SplitDocument } from "@/types";

// UPDATE createSplit function:
export async function createSplit(data: {
  userId: string;
  vendorName: string;
  masterDocumentName: string;
  masterDocumentUrl?: string;
  userEmail?: string; // Add email for reference
}) {
  try {
    const docRef = await addDoc(collection(db, "splits"), {
      ...data,
      status: "processing",
      splitDocuments: [],
      createdAt: serverTimestamp(),
    });

    // Increment user's total splits count
    await incrementUserStats(data.userId, "totalSplits");

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error creating split:", error);
    return { success: false, error };
  }
}

// UPDATE updateSplit function to increment completed count:
export async function updateSplit(
  splitId: string,
  data: Partial<{
    status: "processing" | "completed" | "error";
    masterDocumentUrl: string;
    splitDocuments: SplitDocument[];
    error: string;
  }>
) {
  try {
    const docRef = doc(db, "splits", splitId);

    // Get current split to check status change
    const splitSnap = await getDoc(docRef);
    const currentStatus = splitSnap.data()?.status;

    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });

    // If status changed to 'completed', increment user's completed splits
    if (data.status === "completed" && currentStatus !== "completed") {
      const userId = splitSnap.data()?.userId;
      if (userId) {
        await incrementUserStats(userId, "completedSplits");
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating split:", error);
    return { success: false, error };
  }
}
