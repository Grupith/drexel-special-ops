"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Printer,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useParams, useSearchParams } from "next/navigation";
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
  errorMessage?: string;
};

type SubSplitDoc = {
  id: string;
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

function getStatusStyles(status: string) {
  switch (status) {
    case "uploaded":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "queued":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "processing":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "splitting":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "uploading":
      return "bg-blue-100 text-blue-700 border-blue-200";
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
    case "queued":
      return "Queued";
    case "processing":
      return "Processing";
    case "splitting":
      return "Splitting";
    case "uploading":
      return "Uploading";
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
      return 10;
    case "queued":
      return 20;
    case "processing":
      return 45;
    case "splitting":
      return 70;
    case "uploading":
      return 90;
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

function getSplitStatusDescription(status: string) {
  switch (status) {
    case "uploaded":
      return "Upload received";
    case "queued":
      return "Waiting to start";
    case "processing":
      return "Reading document";
    case "splitting":
      return "Detecting rows and POs";
    case "uploading":
      return "Saving split images";
    case "failed":
      return "Processing failed";
    case "generated":
    case "completed":
      return "Ready";
    default:
      return "Working";
  }
}

async function enrichSubSplitWithPreviewUrl(
  subSplit: SubSplitDoc,
): Promise<SubSplitDoc> {
  const existingUrl = subSplit.generatedImageUrl ?? subSplit.previewImageUrl;
  const storagePath = subSplit.generatedImagePath ?? subSplit.imagePath;

  if (!storagePath) {
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

async function resolveMasterPreviewUrl(
  split: SplitDoc,
): Promise<string | null> {
  const originalImageUrl = split.originalImageUrl?.trim();
  const originalImagePath = split.originalImagePath?.trim();

  const isPdfUrl = originalImageUrl?.toLowerCase().includes(".pdf");
  const isPdfPath = originalImagePath?.toLowerCase().endsWith(".pdf");

  if (originalImageUrl && !isPdfUrl) {
    return originalImageUrl;
  }

  const candidatePreviewPaths = [
    originalImagePath?.replace(/\.pdf$/i, ".jpg"),
    originalImagePath?.replace(/\/master\.pdf$/i, "/master.jpg"),
    originalImagePath
      ? originalImagePath.replace(/\/original\/[^/]+$/i, "/original/master.jpg")
      : undefined,
  ].filter(Boolean) as string[];

  if (!isPdfPath && originalImagePath) {
    candidatePreviewPaths.unshift(originalImagePath);
  }

  const uniqueCandidatePreviewPaths = Array.from(
    new Set(candidatePreviewPaths),
  );

  for (const previewPath of uniqueCandidatePreviewPaths) {
    try {
      const storage = getStorage();
      return await getDownloadURL(ref(storage, previewPath));
    } catch (error) {
      console.warn(
        "Failed to resolve master preview image URL:",
        previewPath,
        error,
      );
    }
  }

  return originalImageUrl ?? null;
}

function isPdfUrl(url?: string | null) {
  return Boolean(url?.toLowerCase().includes(".pdf"));
}

export default function SplitViewPage() {
  const params = useParams<{ splitId: string }>();
  const splitId = params?.splitId;
  const searchParams = useSearchParams();
  const highlightedSubSplitId = searchParams.get("highlight");

  function handlePrintSingleImage(imageUrl: string, title: string) {
    if (typeof window === "undefined") return;

    const printWindow = window.open("", "_blank", "width=900,height=1200");

    if (!printWindow) {
      toast.error("Unable to open print window.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title> drexelspecialops | PO Splitter </title>
          <style>
            @page {
              size: auto;
              margin: 0.35in;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: white;
            }

            body {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
            }

            img {
              max-width: 100%;
              max-height: 100vh;
              width: auto;
              height: auto;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>
          <img src="${imageUrl}" alt="${title}" />
          <script>
            const img = document.images[0];
            Promise.resolve(
              img && !img.complete
                ? new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve;
                  })
                : undefined
            ).then(() => {
              window.focus();
              setTimeout(() => {
                window.print();
              }, 150);
            });

            window.addEventListener("afterprint", () => {
              setTimeout(() => {
                window.close();
              }, 150);
            });
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  function handlePrintAll() {
    if (typeof window === "undefined") return;

    const printableSubSplits = subSplits.filter(
      (subSplit) => subSplit.previewImageUrl,
    );

    if (printableSubSplits.length === 0) {
      toast.error("No split images are ready to print yet.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=1200");

    if (!printWindow) {
      toast.error("Unable to open print window.");
      return;
    }

    const imageMarkup = printableSubSplits
      .map(
        (subSplit, index) => `
          <div class="print-page">
            <img
              src="${subSplit.previewImageUrl}"
              alt="${subSplit.poNumber ? `PO ${subSplit.poNumber}` : `Split ${index + 1}`}"
            />
          </div>
        `,
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title> drexelspecialops | PO Splitter </title>
          <style>
            @page {
              size: auto;
              margin: 0.35in;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: white;
            }

            body {
              font-family: Arial, sans-serif;
            }

            .print-page {
              break-after: page;
              page-break-after: always;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 0;
            }

            .print-page:last-child {
              break-after: auto;
              page-break-after: auto;
            }

            img {
              max-width: 100%;
              max-height: 100vh;
              width: auto;
              height: auto;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>
          ${imageMarkup}
          <script>
            const images = Array.from(document.images);
            Promise.all(
              images.map((img) =>
                img.complete
                  ? Promise.resolve()
                  : new Promise((resolve) => {
                      img.onload = resolve;
                      img.onerror = resolve;
                    })
              )
            ).then(() => {
              window.focus();
              setTimeout(() => {
                window.print();
              }, 150);
            });

            window.addEventListener("afterprint", () => {
              setTimeout(() => {
                window.close();
              }, 150);
            });
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  const [previewModalIndex, setPreviewModalIndex] = React.useState<
    number | null
  >(null);
  const [previewModalImageUrl, setPreviewModalImageUrl] = React.useState<
    string | null
  >(null);
  const [previewModalTitle, setPreviewModalTitle] = React.useState("");
  const [previewModalMeta, setPreviewModalMeta] = React.useState<string[]>([]);

  function openPreviewModal(
    imageUrl: string,
    title: string,
    meta: string[] = [],
    index?: number,
  ) {
    setPreviewModalImageUrl(imageUrl);
    setPreviewModalTitle(title);
    setPreviewModalMeta(meta);
    setPreviewModalIndex(typeof index === "number" ? index : null);
  }

  function closePreviewModal() {
    setPreviewModalIndex(null);
    setPreviewModalImageUrl(null);
    setPreviewModalTitle("");
    setPreviewModalMeta([]);
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
  const [masterPreviewUrl, setMasterPreviewUrl] = React.useState<string | null>(
    null,
  );

  const previewableSubSplits = React.useMemo(
    () => subSplits.filter((subSplit) => subSplit.previewImageUrl),
    [subSplits],
  );
  const canGoToPreviousPreview =
    previewModalIndex !== null && previewModalIndex > 0;
  const canGoToNextPreview =
    previewModalIndex !== null &&
    previewModalIndex < previewableSubSplits.length - 1;

  const highlightedCardRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!splitId) return;

    setLoading(true);
    setError(null);
    setNotFound(false);
    setSplit(null);
    setMasterPreviewUrl(null);
    setSubSplits([]);
    setHasReceivedSplitSnapshot(false);
    setHasReceivedSubSplitsSnapshot(false);
    setIsResolvingPreviewUrls(false);

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

        const splitData = splitSnap.data() as SplitDoc;
        setSplit(splitData);

        void (async () => {
          const resolvedMasterPreviewUrl =
            await resolveMasterPreviewUrl(splitData);
          setMasterPreviewUrl(resolvedMasterPreviewUrl);
        })();
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

        const subSplitsData = subSplitsSnap.docs.map((subSplitDoc) => ({
          id: subSplitDoc.id,
          ...(subSplitDoc.data() as Omit<SubSplitDoc, "id">),
        }));

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
    if (previewModalIndex === null) return;

    const currentPreview = previewableSubSplits[previewModalIndex];

    if (!currentPreview?.previewImageUrl) {
      closePreviewModal();
      return;
    }

    setPreviewModalImageUrl(currentPreview.previewImageUrl);
    setPreviewModalTitle(
      currentPreview.poNumber
        ? `PO: ${currentPreview.poNumber}`
        : `Split ${previewModalIndex + 1}`,
    );
    setPreviewModalMeta([
      `Status: ${getStatusLabel(currentPreview.status ?? "generated")}`,
      typeof currentPreview.order === "number"
        ? `Order: ${currentPreview.order}`
        : "Order pending",
      typeof currentPreview.rowCount === "number"
        ? `Rows: ${currentPreview.rowCount}`
        : "Rows pending",
      typeof currentPreview.sourcePage === "number"
        ? `Source page: ${currentPreview.sourcePage}`
        : "Source page pending",
    ]);
  }, [previewModalIndex, previewableSubSplits]);

  React.useEffect(() => {
    if (!highlightedSubSplitId || subSplits.length === 0) return;

    const targetCard = highlightedCardRef.current;
    if (!targetCard) return;

    const timeoutId = window.setTimeout(() => {
      targetCard.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedSubSplitId, subSplits]);

  React.useEffect(() => {
    if (!previewModalImageUrl) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePreviewModal();
      }

      if (event.key === "ArrowLeft" && canGoToPreviousPreview) {
        setPreviewModalIndex((current) =>
          current === null ? current : Math.max(current - 1, 0),
        );
      }

      if (event.key === "ArrowRight" && canGoToNextPreview) {
        setPreviewModalIndex((current) =>
          current === null
            ? current
            : Math.min(current + 1, previewableSubSplits.length - 1),
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    previewModalImageUrl,
    canGoToNextPreview,
    canGoToPreviousPreview,
    previewableSubSplits.length,
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

  const previewCount = subSplits.length;
  const hasRenderableSubSplits = subSplits.length > 0;
  const canPrintAll =
    split.status === "completed" &&
    subSplits.length > 0 &&
    subSplits.every((subSplit) => subSplit.status === "generated");
  const isActivelyLoadingPreviews =
    !hasRenderableSubSplits &&
    (loading ||
      isResolvingPreviewUrls ||
      split.status === "uploaded" ||
      split.status === "queued" ||
      split.status === "processing" ||
      split.status === "splitting" ||
      split.status === "uploading");
  const originalDocumentUrl =
    masterPreviewUrl ?? split.originalImageUrl?.trim();
  const showPdfPreview = isPdfUrl(originalDocumentUrl);
  const showImagePreview = Boolean(originalDocumentUrl) && !showPdfPreview;

  return (
    <div className="mx-auto max-w-screen-2xl p-3 md:p-4 lg:p-5">
      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card/50 px-3 py-3 shadow-sm md:flex-row md:items-center md:justify-between md:px-4">
        <div className="flex min-w-0 items-start gap-3 md:items-center">
          <Link
            href="/dashboard"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Back to dashboard"
            title="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
                    split.status === "failed" ? "bg-red-500" : "bg-sky-500"
                  } opacity-75`}
                />
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    split.status === "failed" ? "bg-red-500" : "bg-sky-500"
                  }`}
                />
              </span>
              <a
                href={split.originalImageUrl}
                target="_blank"
                rel="noreferrer"
                className="block min-w-0 cursor-pointer"
                title="Open original document"
              >
                <p className="truncate text-xl font-semibold transition hover:opacity-80 md:text-2xl">
                  {split.fileName}
                </p>
              </a>
            </div>

            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                Created{" "}
                {split.createdAt?.toDate
                  ? split.createdAt.toDate().toLocaleString()
                  : "Pending"}
              </span>
              {split.comment?.trim() ? (
                <span className="min-w-0 max-w-full truncate">
                  {split.comment}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Split Status */}

        <div className="flex shrink-0 flex-col gap-2 md:min-w-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${getStatusStyles(
                  split.status,
                )}`}
              >
                {[
                  "uploaded",
                  "queued",
                  "processing",
                  "splitting",
                  "uploading",
                ].includes(split.status) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : split.status === "failed" ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {getStatusLabel(split.status)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {getSplitStatusDescription(split.status)}
                </p>
              </div>
            </div>

            <span className="text-xs font-medium text-muted-foreground">
              {getSplitProgressValue(split.status)}%
            </span>
          </div>

          <Progress
            value={getSplitProgressValue(split.status)}
            className="h-1.5"
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)] xl:items-start">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Original Document
          </p>
          <div className="overflow-hidden rounded-xl border bg-muted/20 p-2">
            {showImagePreview && originalDocumentUrl ? (
              <button
                type="button"
                onClick={() =>
                  openPreviewModal(
                    originalDocumentUrl,
                    split.fileName,
                    [],
                    undefined,
                  )
                }
                className="group block w-full cursor-pointer"
              >
                <div className="relative aspect-[8.5/11] w-full overflow-hidden rounded-lg border bg-background">
                  <img
                    src={originalDocumentUrl}
                    alt={split.fileName}
                    className="absolute inset-0 h-full w-full object-contain transition duration-200 group-hover:scale-[1.01] group-hover:opacity-95"
                    onError={() => {
                      console.error(
                        "Original image preview failed to load:",
                        originalDocumentUrl,
                      );
                    }}
                  />
                </div>
              </button>
            ) : showPdfPreview && originalDocumentUrl ? (
              <div className="overflow-hidden rounded-lg border bg-background">
                <iframe
                  src={`${originalDocumentUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                  title={split.fileName}
                  className="aspect-[8.5/11] w-full"
                />
                <div className="border-t bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                  <a
                    href={originalDocumentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline"
                  >
                    Open PDF
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex aspect-[8.5/11] items-center justify-center rounded-lg border bg-background p-4 text-center text-sm text-muted-foreground">
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
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Split images
                  </p>
                  <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {previewCount} created
                  </span>
                </div>

                {canPrintAll ? (
                  <button
                    type="button"
                    onClick={handlePrintAll}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print all</span>
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {Array.from({
                  length: Math.max(
                    subSplits.length,
                    ["processing", "splitting", "uploading"].includes(
                      split.status,
                    )
                      ? 3
                      : 2,
                  ),
                }).map((_, index) => (
                  <div
                    key={`split-skeleton-${index}`}
                    className="overflow-hidden rounded-xl border bg-card shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3 p-3 pb-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
                        <div className="space-y-1.5">
                          <div className="h-3 w-24 animate-pulse rounded-md bg-muted" />
                          <div className="h-3 w-20 animate-pulse rounded-md bg-muted" />
                          <div className="h-3 w-16 animate-pulse rounded-md bg-muted" />
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5">
                        <div className="h-4 w-16 animate-pulse rounded-md bg-muted" />
                      </div>
                    </div>

                    <div className="w-full px-3 pb-3">
                      <div className="relative aspect-[8.5/11] w-full overflow-hidden rounded-lg border bg-background shadow-sm">
                        <div className="absolute inset-0 animate-pulse bg-muted" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {!isActivelyLoadingPreviews && split.status === "failed" ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              <p className="font-medium">
                This split failed during processing.
              </p>
              <p className="mt-2 wrap-break-word text-red-700/90">
                {split.errorMessage?.trim()
                  ? split.errorMessage
                  : "No error details were provided."}
              </p>
            </div>
          ) : !isActivelyLoadingPreviews && subSplits.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              No sub-splits have been generated yet.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Split images
                  </p>
                  <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {previewCount} created
                  </span>
                </div>

                {canPrintAll ? (
                  <button
                    type="button"
                    onClick={handlePrintAll}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print all</span>
                  </button>
                ) : null}
              </div>

              {/* Sub-splits grid */}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {subSplits.map((subSplit, index) => {
                  const isHighlighted = highlightedSubSplitId === subSplit.id;

                  return (
                    <div
                      key={subSplit.id}
                      ref={(node) => {
                        if (isHighlighted) {
                          highlightedCardRef.current = node;
                        }
                      }}
                      className={`group overflow-hidden rounded-xl border bg-card text-left shadow-sm transition duration-200 ${isHighlighted ? "border-yellow-400 ring-2 ring-yellow-300/70 shadow-[0_0_0_1px_rgba(250,204,21,0.35)] animate-pulse" : "border-border"}`}
                    >
                      <div
                        className={`flex items-start justify-between gap-2 p-3 pb-2 select-text ${isHighlighted ? "bg-yellow-50" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold wrap-break-word select-text md:text-base">
                            {subSplit.poNumber
                              ? `PO: ${subSplit.poNumber}`
                              : `Split ${index + 1}`}
                          </p>
                          {isHighlighted ? (
                            <p className="mt-1 text-xs font-semibold text-yellow-700">
                              Matched from dashboard search
                            </p>
                          ) : null}
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {typeof subSplit.sourcePage === "number" ? (
                              <p>{`Source page ${subSplit.sourcePage}`}</p>
                            ) : null}
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
                        <div className="w-full px-3 pb-3">
                          <button
                            type="button"
                            onClick={() => {
                              openPreviewModal(
                                subSplit.previewImageUrl!,
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
                                previewableSubSplits.findIndex(
                                  (previewableSubSplit) =>
                                    previewableSubSplit.id === subSplit.id,
                                ),
                              );
                            }}
                            className="block w-full cursor-pointer"
                          >
                            <div className="relative aspect-[8.5/11] w-full overflow-hidden rounded-lg border bg-background shadow-sm transition duration-200 hover:scale-[1.01] hover:shadow-md">
                              <img
                                src={subSplit.previewImageUrl}
                                alt={
                                  subSplit.poNumber
                                    ? `PO: ${subSplit.poNumber} preview`
                                    : `Split ${index + 1} preview`
                                }
                                className="absolute inset-0 h-full w-full object-contain transition duration-200 group-hover:opacity-95"
                              />
                            </div>
                          </button>
                        </div>
                      ) : (
                        <div className="px-3 pb-3">
                          <div className="flex aspect-[8.5/11] items-center justify-center rounded-lg border border-dashed bg-background p-3 text-center text-sm text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              {(subSplit.status ?? "") === "processing" ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : null}
                              <span>Preview image not ready yet.</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      {previewModalImageUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 md:p-5"
          onClick={closePreviewModal}
        >
          <div className="flex h-full w-full max-w-screen-2xl flex-col">
            <div
              className="mb-3 flex w-full flex-col gap-3 rounded-xl border border-white/10 bg-background/95 px-3 py-3 shadow-lg backdrop-blur md:flex-row md:items-center md:justify-between md:px-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                <div className="flex min-w-0 shrink-0 items-center gap-2 lg:max-w-lg">
                  <p className="truncate text-lg font-semibold md:text-xl">
                    {previewModalTitle}
                  </p>
                  {previewModalIndex !== null ? (
                    <span className="shrink-0 rounded-full border bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {previewModalIndex + 1} of {previewableSubSplits.length}
                    </span>
                  ) : null}
                </div>

                {previewModalMeta.length > 0 ? (
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {previewModalMeta.map((item) => {
                      const [label, ...valueParts] = item.split(":");
                      const value = valueParts.join(":").trim();
                      const isGeneratedStatus =
                        label === "Status" && value === "Generated";

                      return (
                        <div
                          key={item}
                          className={`inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-1 text-xs ${
                            isGeneratedStatus ? "text-sky-600" : ""
                          }`}
                        >
                          <span className="font-medium text-muted-foreground">
                            {value ? label : "Detail"}
                          </span>
                          {isGeneratedStatus ? (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          ) : null}
                          <span className="truncate font-semibold">
                            {value || item}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap md:justify-end">
                <a
                  href={previewModalImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted md:flex-none"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Open</span>
                </a>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handlePrintSingleImage(
                      previewModalImageUrl,
                      previewModalTitle || "Split image",
                    );
                  }}
                  className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 md:flex-none"
                >
                  <Printer className="h-4 w-4" />
                  <span>Print</span>
                </button>
                {canPrintAll ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handlePrintAll();
                    }}
                    className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted md:flex-none"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print all</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    closePreviewModal();
                  }}
                  className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close preview"
                  title="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 md:gap-4">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!canGoToPreviousPreview) return;
                  setPreviewModalIndex((current) =>
                    current === null ? current : Math.max(current - 1, 0),
                  );
                }}
                disabled={!canGoToPreviousPreview}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-background/95 text-foreground shadow-lg backdrop-blur transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35 md:h-11 md:w-11"
                aria-label="Previous split preview"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div
                className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2 shadow-2xl md:p-3"
                onClick={(event) => event.stopPropagation()}
              >
                <img
                  src={previewModalImageUrl}
                  alt={previewModalTitle}
                  className="block h-auto max-h-[calc(100vh-7.5rem)] w-auto max-w-full rounded-lg bg-background shadow-xl md:max-h-[calc(100vh-8.25rem)]"
                />
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!canGoToNextPreview) return;
                  setPreviewModalIndex((current) =>
                    current === null
                      ? current
                      : Math.min(current + 1, previewableSubSplits.length - 1),
                  );
                }}
                disabled={!canGoToNextPreview}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-background/95 text-foreground shadow-lg backdrop-blur transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35 md:h-11 md:w-11"
                aria-label="Next split preview"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
