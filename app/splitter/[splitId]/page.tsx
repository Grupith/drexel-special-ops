"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref } from "firebase/storage";

import { db } from "@/lib/firebase/db";

type SplitDoc = {
  vendorId: string;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  status: string;
  originalImagePath: string;
  originalImageUrl: string;
  fileName: string;
  comment?: string;
};

type SubSplitDoc = {
  poNumber?: string;
  order?: number;
  sourcePage?: number;
  rowCount?: number;
  imagePath?: string;
  generatedImagePath?: string;
  generatedImageUrl?: string;
  previewImageUrl?: string;
  status?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

function isImageFile(fileName: string) {
  const lower = fileName.toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) =>
    lower.endsWith(ext),
  );
}

function getStatusStyles(status: string) {
  switch (status) {
    case "uploaded":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "processing":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "generated":
      return "bg-green-100 text-green-700 border-green-200";
    case "completed":
      return "bg-green-100 text-green-700 border-green-200";
    case "failed":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "uploaded":
      return "Uploaded";
    case "processing":
      return "Processing";
    case "generated":
      return "Generated";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status || "Unknown";
  }
}

async function enrichSubSplitWithPreviewUrl(
  subSplit: SubSplitDoc,
): Promise<SubSplitDoc> {
  const existingUrl = subSplit.generatedImageUrl ?? subSplit.previewImageUrl;
  const storagePath = subSplit.generatedImagePath ?? subSplit.imagePath;

  if (existingUrl || !storagePath) {
    return {
      ...subSplit,
      previewImageUrl: existingUrl,
    };
  }

  try {
    const storage = getStorage();
    const previewImageUrl = await getDownloadURL(ref(storage, storagePath));

    return {
      ...subSplit,
      previewImageUrl,
    };
  } catch (error) {
    console.error("Failed to resolve sub-split image URL:", error, storagePath);

    return {
      ...subSplit,
      previewImageUrl: undefined,
    };
  }
}

export default function SplitViewPage() {
  const params = useParams<{ splitId: string }>();
  const splitId = params?.splitId;

  const [split, setSplit] = React.useState<SplitDoc | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [subSplits, setSubSplits] = React.useState<SubSplitDoc[]>([]);
  const [hasReceivedSplitSnapshot, setHasReceivedSplitSnapshot] =
    React.useState(false);
  const [hasReceivedSubSplitsSnapshot, setHasReceivedSubSplitsSnapshot] =
    React.useState(false);

  React.useEffect(() => {
    if (!splitId) return;

    setLoading(true);
    setError(null);
    setNotFound(false);
    setSplit(null);
    setSubSplits([]);
    setHasReceivedSplitSnapshot(false);
    setHasReceivedSubSplitsSnapshot(false);

    const splitRef = doc(db, "splits", splitId);
    const subSplitsRef = collection(db, "splits", splitId, "subSplits");
    const subSplitsQuery = query(subSplitsRef, orderBy("order", "asc"));

    const unsubscribeSplit = onSnapshot(
      splitRef,
      (splitSnap) => {
        setHasReceivedSplitSnapshot(true);

        if (!splitSnap.exists()) {
          setNotFound(true);
          setSplit(null);
          setSubSplits([]);
          setHasReceivedSubSplitsSnapshot(true);
          setLoading(false);
          return;
        }

        setNotFound(false);
        setSplit(splitSnap.data() as SplitDoc);
      },
      (err) => {
        console.error("Failed to subscribe to split:", err);
        setError("Failed to load split.");
        setLoading(false);
      },
    );

    const unsubscribeSubSplits = onSnapshot(
      subSplitsQuery,
      (subSplitsSnap) => {
        setHasReceivedSubSplitsSnapshot(true);

        const subSplitsData = subSplitsSnap.docs.map(
          (subSplitDoc) => subSplitDoc.data() as SubSplitDoc,
        );

        void (async () => {
          const enrichedSubSplits = await Promise.all(
            subSplitsData.map(enrichSubSplitWithPreviewUrl),
          );

          setSubSplits(enrichedSubSplits);
        })();
      },
      (err) => {
        console.error("Failed to subscribe to sub-splits:", err);
        setError("Failed to load split previews.");
        setLoading(false);
      },
    );

    return () => {
      unsubscribeSplit();
      unsubscribeSubSplits();
    };
  }, [splitId]);

  React.useEffect(() => {
    if (!splitId) return;

    if (notFound) {
      setLoading(false);
      return;
    }

    if (hasReceivedSplitSnapshot && hasReceivedSubSplitsSnapshot) {
      setLoading(false);
    }
  }, [
    splitId,
    hasReceivedSplitSnapshot,
    hasReceivedSubSplitsSnapshot,
    notFound,
  ]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Split View</h1>
        <p className="mt-4 text-sm text-muted-foreground">Loading split...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Split View</h1>
        <p className="mt-4 text-sm text-red-500">Split not found.</p>
        <Link href="/dashboard" className="mt-4 inline-block underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (error || !split) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Split View</h1>
        <p className="mt-4 text-sm text-red-500">
          {error ?? "Something went wrong."}
        </p>
        <Link href="/dashboard" className="mt-4 inline-block underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const showImagePreview = isImageFile(split.fileName);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-muted/30 p-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Split View
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {split.fileName}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Review the original uploaded document on the left, then use the
            generated split previews on the right to inspect where finished PO
            documents will appear.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
            <span>Split ID: {splitId}</span>
            <span>Vendor: {split.vendorId}</span>
            <span>File: {split.fileName}</span>
            <span
              className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] font-medium ${getStatusStyles(
                split.status,
              )}`}
            >
              {split.status === "processing" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              <span className="capitalize">{getStatusLabel(split.status)}</span>
            </span>
          </div>
        </div>

        <Link href="/dashboard" className="text-sm underline">
          Back to dashboard
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border p-4">
            {split.comment ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Comment
                </p>
                <p className="mt-1 text-sm">{split.comment}</p>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>No comment added</span>
                <span className="text-xs">Ready for processing</span>
              </div>
            )}
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Original Upload</h2>
                <p className="text-sm text-muted-foreground">
                  Smaller reference preview of the uploaded source document.
                </p>
              </div>

              <a
                href={split.originalImageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                Open file
              </a>
            </div>

            {showImagePreview ? (
              <img
                src={split.originalImageUrl}
                alt={split.fileName}
                className="w-full rounded-md border object-contain max-h-160 bg-muted/20"
              />
            ) : (
              <div className="rounded-md border p-6 text-sm text-muted-foreground">
                <p>This file type does not have an inline image preview yet.</p>
                <p className="mt-2">Use the Open file link above to view it.</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="mb-4">
            <h2 className="font-semibold">Generated Split Previews</h2>
            <p className="text-sm text-muted-foreground">
              Real PO split previews will appear here as sub-splits are created.
            </p>
          </div>

          {split.status === "processing" && subSplits.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  Processing split previews. Generated PO pages will appear here
                  once they are ready.
                </span>
              </div>
            </div>
          ) : split.status === "failed" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              This split failed during processing. Once error handling is wired
              in, you can show more details here.
            </div>
          ) : subSplits.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No sub-splits have been generated yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {subSplits.map((subSplit, index) => (
                <div
                  key={`${subSplit.poNumber ?? "subsplit"}-${index}`}
                  className="group rounded-xl border bg-background p-3 text-left shadow-sm transition hover:-translate-y-0.5"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        PO Preview
                      </p>
                      <p className="text-sm font-medium">
                        {subSplit.poNumber
                          ? `PO ${subSplit.poNumber}`
                          : `Split ${index + 1}`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${getStatusStyles(
                        subSplit.status ?? "generated",
                      )}`}
                    >
                      {subSplit.status === "processing" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      <span className="capitalize">
                        {getStatusLabel(subSplit.status ?? "generated")}
                      </span>
                    </span>
                  </div>

                  {subSplit.previewImageUrl ? (
                    <div className="space-y-3">
                      <a
                        href={subSplit.previewImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block"
                      >
                        <img
                          src={subSplit.previewImageUrl}
                          alt={
                            subSplit.poNumber
                              ? `PO ${subSplit.poNumber} preview`
                              : `Split ${index + 1} preview`
                          }
                          className="aspect-[8.5/11] w-full rounded-lg border bg-muted/20 object-contain"
                        />
                      </a>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {typeof subSplit.sourcePage === "number"
                            ? `Source page ${subSplit.sourcePage}`
                            : "Source page pending"}
                        </span>
                        {typeof subSplit.order === "number" ? (
                          <span>Order {subSplit.order}</span>
                        ) : null}
                      </div>

                      <a
                        href={subSplit.previewImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        Open full image
                      </a>
                    </div>
                  ) : (
                    <div className="aspect-[8.5/11] rounded-lg border border-dashed bg-muted/30 p-3">
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                        {(subSplit.status ?? "") === "processing" ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : null}
                        <span>Preview image not ready yet.</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
