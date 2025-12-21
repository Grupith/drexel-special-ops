/**
 * Firebase Auth User
 * Basic user info from Firebase Authentication
 */
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * User Profile stored in Firestore
 * Extended user info with preferences and stats
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: Date;
  lastLoginAt: Date;
  preferences?: {
    defaultVendor?: string;
    emailNotifications?: boolean;
  };
  stats?: {
    totalSplits: number;
    completedSplits: number;
  };
}

/**
 * Individual split document (one PO)
 * Represents a single PDF created from splitting
 */
export interface SplitDocument {
  id: string;
  poNumber: string; // e.g., "F52227"
  pages: number[]; // e.g., [1, 2, 3] - page numbers from master doc
  pdfUrl: string; // Firebase Storage URL
  hasHandwrittenNotes: boolean;
  thumbnailUrl?: string;
  fileName?: string;
}

/**
 * Main Split record
 * Represents one Bill of Lading split operation
 */
export interface Split {
  id: string;
  userId: string; // Links to users collection
  userEmail?: string; // For reference/display
  vendorName: string; // e.g., "SHAW INDUSTRIES"
  masterDocumentUrl: string; // Firebase Storage URL of uploaded PDF
  masterDocumentName: string; // Original filename
  createdAt: Date;
  updatedAt?: Date;
  status: "processing" | "completed" | "error";
  splitDocuments: SplitDocument[]; // Array of individual PO documents
  error?: string; // Error message if status is 'error'
}

/**
 * PO Detection result from Vision API
 */
export interface PODetection {
  poNumber: string;
  pageNumber: number;
  rowIndex: number;
  confidence: number;
}

/**
 * PO Group for splitting
 * Groups pages that belong to the same PO
 */
export interface POGroup {
  poNumber: string;
  pages: number[];
  startRow: number;
  endRow: number;
}

/**
 * Upload progress state
 */
export interface UploadProgress {
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  state: "running" | "paused" | "success" | "error";
}
