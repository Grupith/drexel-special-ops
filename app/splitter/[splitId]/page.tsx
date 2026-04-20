"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  Printer,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
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

import { Progress } from "@/components/ui/progress";
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

function getSplitProgressValue(status: string) {
  switch (status) {
    case "uploaded":
      return 20;
    case "processing":
      return 65;
    case "generated":
      return 100;
    case "completed":
      return 100;
    case "failed":
      return 100;
    default:
      return 0;
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

  function handlePrintAll() {
    if (typeof window === "undefined") return;
    window.print();
  }

  const [previewModalImageUrl, setPreviewModalImageUrl] = React.useState<
    string | null
  >(null);
  const [previewModalTitle, setPreviewModalTitle] = React.useState("");
  const [previewModalMeta, setPreviewModalMeta] = React.useState<string[]>([]);

  function openPreviewModal(
    imageUrl: string,
    title: string,
    meta: string[] = [],
  ) {
    setPreviewModalImageUrl(imageUrl);
    setPreviewModalTitle(title);
    setPreviewModalMeta(meta);
  }

  const [split, setSplit] = React.useState<SplitDoc | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [subSplits, setSubSplits] = React.useState<SubSplitDoc[]>([]);
  const [hasReceivedSplitSnapshot, setHasReceivedSplitSnapshot] =
    React.useState(false);
  const [hasReceivedSubSplitsSnapshot, setHasReceivedSubSplitsSnapshot] =
    React.useState(false);
  const [isResolvingPreviewUrls, setIsResolvingPreviewUrls] =
    React.useState(false);
  const hasShownCompletedToastRef = React.useRef(false);

  React.useEffect(() => {
    if (!splitId) return;

    setLoading(true);
    setError(null);
    setNotFound(false);
    setSplit(null);
    setSubSplits([]);
    setHasReceivedSplitSnapshot(false);
    setHasReceivedSubSplitsSnapshot(false);
    setIsResolvingPreviewUrls(false);
    hasShownCompletedToastRef.current = false;

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

        setIsResolvingPreviewUrls(true);

        void (async () => {
          try {
            const enrichedSubSplits = await Promise.all(
              subSplitsData.map(enrichSubSplitWithPreviewUrl),
            );

            setSubSplits(enrichedSubSplits);
          } finally {
            setIsResolvingPreviewUrls(false);
          }
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

  React.useEffect(() => {
    if (!splitId || !split) return;

    if (split.status === "completed" && !hasShownCompletedToastRef.current) {
      toast.success("Split complete!");
      hasShownCompletedToastRef.current = true;
    }
  }, [splitId, split, subSplits.length]);

  React.useEffect(() => {
    if (!previewModalImageUrl) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewModalImageUrl(null);
        setPreviewModalTitle("");
        setPreviewModalMeta([]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewModalImageUrl]);

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

  const previewCount = subSplits.length;
  const isActivelyLoadingPreviews =
    loading ||
    isResolvingPreviewUrls ||
    split.status === "uploaded" ||
    split.status === "processing";
  const showImagePreview = isImageFile(split.fileName);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border bg-muted/40 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <p className="truncate text-3xl font-semibold tracking-tight md:text-4xl">
              {split.fileName}
            </p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                Created at:{" "}
                {split.createdAt?.toDate
                  ? split.createdAt.toDate().toLocaleString()
                  : "Pending"}
              </p>
              <p>Comments: {split.comment?.trim() ? split.comment : "None"}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-3 md:min-w-[320px] md:items-end">
          <div className="w-full rounded-3xl  bg-muted/20 p-4 md:max-w-90">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Split status
                </p>
                <p className="mt-1 text-base font-semibold md:text-lg">
                  {getStatusLabel(split.status)}
                </p>
              </div>

              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${getStatusStyles(
                  split.status,
                )}`}
              >
                {split.status === "uploaded" ||
                split.status === "processing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : split.status === "failed" ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </div>
            </div>

            <Progress
              value={getSplitProgressValue(split.status)}
              className="h-2.5"
            />

            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {split.status === "uploaded"
                  ? "Queued"
                  : split.status === "processing"
                    ? "Generating previews"
                    : split.status === "failed"
                      ? "Processing failed"
                      : "Ready"}
              </span>
              <span>{getSplitProgressValue(split.status)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Original image
          </p>
          <div className="overflow-hidden rounded-[28px] border bg-muted/20 p-3">
            {showImagePreview ? (
              <button
                type="button"
                onClick={() =>
                  openPreviewModal(split.originalImageUrl, split.fileName, [])
                }
                className="group block w-full cursor-pointer"
              >
                <img
                  src={split.originalImageUrl}
                  alt={split.fileName}
                  className="aspect-[8.5/11] w-full rounded-[22px] border bg-background object-contain transition duration-200 group-hover:scale-[1.01] group-hover:opacity-95"
                />
              </button>
            ) : (
              <div className="flex aspect-[8.5/11] items-center justify-center rounded-[22px] border bg-background p-6 text-center text-sm text-muted-foreground">
                <div>
                  <p>This file type does not have an inline preview yet.</p>
                  <a
                    href={split.originalImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block underline"
                  >
                    Open file
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {isActivelyLoadingPreviews ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {previewCount > 0
                  ? `${previewCount} preview${previewCount === 1 ? "" : "s"} ready`
                  : split.status === "uploaded"
                    ? "Upload received. Waiting for processing to begin."
                    : split.status === "processing"
                      ? "Generating split previews..."
                      : "Loading previews..."}
              </span>
            </div>
          ) : null}

          {split.status === "failed" ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              This split failed during processing. Once error handling is wired
              in, you can show more details here.
            </div>
          ) : subSplits.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              No sub-splits have been generated yet.
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-muted-foreground">
                Split images
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {subSplits.map((subSplit, index) => (
                  <button
                    key={`${subSplit.poNumber ?? "subsplit"}-${index}`}
                    type="button"
                    onClick={() => {
                      if (!subSplit.previewImageUrl) return;

                      openPreviewModal(
                        subSplit.previewImageUrl,
                        subSplit.poNumber
                          ? `PO: ${subSplit.poNumber}`
                          : `Split ${index + 1}`,
                        [
                          `Status: ${getStatusLabel(subSplit.status ?? "generated")}`,
                          typeof subSplit.order === "number"
                            ? `Order: ${subSplit.order}`
                            : "Order pending",
                          typeof subSplit.rowCount === "number"
                            ? `Rows: ${subSplit.rowCount}`
                            : "Rows pending",
                          typeof subSplit.sourcePage === "number"
                            ? `Source page: ${subSplit.sourcePage}`
                            : "Source page pending",
                        ],
                      );
                    }}
                    className={`group overflow-hidden rounded-3xl border bg-card text-left shadow-sm transition duration-200 ${subSplit.previewImageUrl ? "cursor-pointer hover:scale-[1.02] hover:shadow-md" : "cursor-default"}`}
                  >
                    <div className="flex items-start justify-between gap-3 p-4 pb-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold md:text-base">
                          {subSplit.poNumber
                            ? `PO: ${subSplit.poNumber}`
                            : `Split ${index + 1}`}
                        </p>
                        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                          <p>
                            {typeof subSplit.sourcePage === "number"
                              ? `Source page ${subSplit.sourcePage}`
                              : "Source page pending"}
                          </p>
                          {typeof subSplit.order === "number" ? (
                            <p>Order {subSplit.order}</p>
                          ) : null}
                          {typeof subSplit.rowCount === "number" ? (
                            <p>Rows {subSplit.rowCount}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
                        {subSplit.status === "processing" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>
                              {getStatusLabel(subSplit.status ?? "generated")}
                            </span>
                          </span>
                        ) : (subSplit.status ?? "generated") === "failed" ? (
                          <span className="inline-flex items-center gap-1.5 text-red-600">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>
                              {getStatusLabel(subSplit.status ?? "generated")}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sky-600">
                            <Check className="h-3.5 w-3.5" />
                            <span>
                              {getStatusLabel(subSplit.status ?? "generated")}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {subSplit.previewImageUrl ? (
                      <div className="w-full px-4 pb-4">
                        <img
                          src={subSplit.previewImageUrl}
                          alt={
                            subSplit.poNumber
                              ? `PO: ${subSplit.poNumber} preview`
                              : `Split ${index + 1} preview`
                          }
                          className="aspect-[8.5/11] w-full rounded-[20px] border bg-background object-contain shadow-sm transition duration-200 group-hover:opacity-95"
                        />
                      </div>
                    ) : (
                      <div className="px-4 pb-4">
                        <div className="flex aspect-[8.5/11] items-center justify-center rounded-[20px] border border-dashed bg-background p-3 text-center text-sm text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            {(subSplit.status ?? "") === "processing" ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : null}
                            <span>Preview image not ready yet.</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex justify-center pt-2 xl:justify-end">
                <button
                  type="button"
                  onClick={handlePrintAll}
                  className="inline-flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-sm font-medium transition hover:bg-muted"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print all</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {previewModalImageUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 md:p-6"
          onClick={() => {
            setPreviewModalImageUrl(null);
            setPreviewModalTitle("");
            setPreviewModalMeta([]);
          }}
        >
          <div className="flex w-full max-w-6xl flex-col items-center">
            <div
              className="mb-4 flex w-full max-w-5xl items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium md:text-base">
                  {previewModalTitle}
                </p>
                {previewModalMeta.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {previewModalMeta.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewModalImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewModalImageUrl(null);
                    setPreviewModalTitle("");
                    setPreviewModalMeta([]);
                  }}
                  className="rounded-lg cursor-pointer border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex w-full max-w-5xl items-center justify-center overflow-hidden rounded-[28px] bg-transparent p-2 md:p-4">
              <img
                src={previewModalImageUrl}
                alt={previewModalTitle}
                onClick={(event) => event.stopPropagation()}
                className="block h-auto max-h-[calc(100vh-8.5rem)] w-auto max-w-full rounded-[20px] shadow-2xl md:max-h-[calc(100vh-10rem)]"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
