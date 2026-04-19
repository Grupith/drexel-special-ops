"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";

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
  generatedImagePath?: string;
  generatedImageUrl?: string;
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
    case "completed":
      return "bg-green-100 text-green-700 border-green-200";
    case "failed":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
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

  React.useEffect(() => {
    async function loadSplit() {
      if (!splitId) return;

      setLoading(true);
      setError(null);
      setNotFound(false);

      try {
        const splitRef = doc(db, "splits", splitId);
        const splitSnap = await getDoc(splitRef);

        if (!splitSnap.exists()) {
          setNotFound(true);
          setSplit(null);
          setSubSplits([]);
          return;
        }

        setSplit(splitSnap.data() as SplitDoc);

        const subSplitsRef = collection(db, "splits", splitId, "subSplits");
        const subSplitsQuery = query(subSplitsRef, orderBy("order", "asc"));
        const subSplitsSnap = await getDocs(subSplitsQuery);

        const subSplitsData = subSplitsSnap.docs.map(
          (subSplitDoc) => subSplitDoc.data() as SubSplitDoc,
        );

        setSubSplits(subSplitsData);
      } catch (err) {
        console.error("Failed to load split:", err);
        setError("Failed to load split.");
        setSubSplits([]);
      } finally {
        setLoading(false);
      }
    }

    loadSplit();
  }, [splitId]);

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
              className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-medium capitalize ${getStatusStyles(
                split.status,
              )}`}
            >
              {split.status}
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
                className="w-full rounded-md border object-contain max-h-[640px] bg-muted/20"
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
              Processing split previews. Generated PO pages will appear here
              once they are ready.
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
                    <span className="rounded-md border px-2 py-1 text-[11px] capitalize text-muted-foreground">
                      {subSplit.status ?? "pending"}
                    </span>
                  </div>

                  {subSplit.generatedImageUrl ? (
                    <div className="space-y-3">
                      <img
                        src={subSplit.generatedImageUrl}
                        alt={
                          subSplit.poNumber
                            ? `PO ${subSplit.poNumber} preview`
                            : `Split ${index + 1} preview`
                        }
                        className="aspect-[8.5/11] w-full rounded-lg border bg-muted/20 object-contain"
                      />

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
                    </div>
                  ) : (
                    <div className="aspect-[8.5/11] rounded-lg border border-dashed bg-muted/30 p-3">
                      <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                        Preview image not ready yet.
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
