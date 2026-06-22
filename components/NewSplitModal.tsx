"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { db } from "@/lib/firebase/db";
import { storage } from "@/lib/firebase/storage";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileImage,
  FileText,
  FolderUp,
  Loader2,
  NotebookPen,
  ScrollText,
  Store,
} from "lucide-react";

type VendorOption = { id: string; name: string };

const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const ALLOWED_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "pdf"];
const ACCEPTED_FILE_TYPES =
  ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

function getFileExtension(fileName: string) {
  const parts = fileName.split(".");
  return parts.length > 1 ? (parts.pop()?.toLowerCase() ?? "") : "";
}

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || getFileExtension(file.name) === "pdf"
  );
}

export function NewSplitModal({
  vendors,
  trigger,
}: {
  vendors: VendorOption[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const defaultVendorId = React.useMemo(
    () =>
      vendors.find(
        (vendor) =>
          vendor.id.toLowerCase() === "shaw" ||
          vendor.name.toLowerCase() === "shaw",
      )?.id ?? "",
    [vendors],
  );

  const [vendorId, setVendorId] = React.useState(defaultVendorId);
  const [comment, setComment] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<{
    vendorId?: string;
    file?: string;
  }>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [isDragActive, setIsDragActive] = React.useState(false);

  const handleSelectedFile = React.useCallback((nextFile: File | null) => {
    setFile(nextFile);
    setErrors((prev) => ({ ...prev, file: undefined }));
    setIsDragActive(false);
  }, []);

  const handleDragOver = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (submitting) return;
      setIsDragActive(true);
    },
    [submitting],
  );

  const handleDragLeave = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const nextTarget = e.relatedTarget as Node | null;
      if (nextTarget && e.currentTarget.contains(nextTarget)) return;
      setIsDragActive(false);
    },
    [],
  );

  const handleDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (submitting) return;
      const droppedFile = e.dataTransfer.files?.[0] ?? null;
      handleSelectedFile(droppedFile);
    },
    [handleSelectedFile, submitting],
  );

  const imagePreviewUrl = React.useMemo(() => {
    if (!file || !file.type.startsWith("image/")) return null;
    return URL.createObjectURL(file);
  }, [file]);

  React.useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  React.useEffect(() => {
    if (!vendorId && defaultVendorId) {
      setVendorId(defaultVendorId);
    }
  }, [defaultVendorId, vendorId]);

  function resetForm() {
    setVendorId(defaultVendorId);
    setComment("");
    setFile(null);
    setIsDragActive(false);
    setErrors({});

    // Clear the native file input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function validate() {
    const next: typeof errors = {};
    if (!vendorId) next.vendorId = "Select a vendor";
    if (!file) next.file = "Please upload a file";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (!file) {
        setErrors((prev) => ({ ...prev, file: "Please upload a file" }));
        return;
      }
      const fileExtension = getFileExtension(file.name);

      if (
        !ALLOWED_FILE_TYPES.includes(file.type) ||
        !ALLOWED_FILE_EXTENSIONS.includes(fileExtension)
      ) {
        setErrors((prev) => ({
          ...prev,
          file: "Only JPG, PNG, and PDF files are allowed.",
        }));
        setSubmitting(false);
        return;
      }

      const splitId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now());

      const auth = getAuth();
      const currentUser = auth.currentUser;

      console.log("currentUser before upload:", currentUser);

      if (!currentUser) {
        setErrors((prev) => ({
          ...prev,
          file: "You must be signed in before creating a split.",
        }));
        return;
      }

      const extension = getFileExtension(file.name);
      const storageFileName = extension ? `master.${extension}` : "master";
      const originalImagePath = `splits/${splitId}/original/${storageFileName}`;
      const storageRef = ref(storage, originalImagePath);
      const splitRef = doc(db, "splits", splitId);

      await setDoc(splitRef, {
        vendorId,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: "uploading",
        originalImagePath,
        originalImageUrl: "",
        fileName: file.name,
        comment: comment.trim(),
      });

      await uploadBytes(storageRef, file);
      const originalImageUrl = await getDownloadURL(storageRef);

      await updateDoc(splitRef, {
        originalImageUrl,
        status: "uploaded",
        updatedAt: serverTimestamp(),
      });

      setOpen(false);
      resetForm();
      router.push(`/splitter/${splitId}`);
    } catch (error) {
      console.error("Failed to create split:", error);
      setErrors((prev) => ({
        ...prev,
        file: "Failed to create split. Please try again.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (submitting) return;
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? <Button>New Split</Button>}
      </DialogTrigger>

      <DialogContent
        className="border-border/70 bg-linear-to-br from-background via-card to-secondary/50 p-0 shadow-xl sm:max-w-160"
        onPointerDownOutside={(e) => {
          if (submitting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-accent/70 to-transparent"
        />

        <DialogHeader className="relative shrink-0 gap-2 border-b border-border/60 bg-secondary/75 px-4 pt-4 pb-2 text-left sm:px-6 sm:pt-5 sm:pb-3">
          <div className="flex items-align gap-3 sm:gap-4">
            <div className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/85 text-foreground shadow-sm backdrop-blur-sm sm:size-12 sm:rounded-2xl">
              <ScrollText className="size-4 sm:size-5" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="font-serif text-xl tracking-tight sm:text-xl">
                New split
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
                Upload a file and choose a vendor.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
          onSubmit={handleSubmit}
        >
          {submitting ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/55 backdrop-blur-[2px]">
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/95 px-4 py-3 shadow-lg">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span className="text-sm font-medium text-foreground">
                  Creating split...
                </span>
              </div>
            </div>
          ) : null}
          <div className="space-y-3 px-4 pt-2 pb-6 sm:px-6 sm:pt-3 sm:pb-4">
            <div className="space-y-2 sm:space-y-2.5">
              {/* Vendor Selection */}

              <div className="space-y-2 sm:space-y-2.5 rounded-[calc(var(--radius)+6px)] bg-card/20 p-3 sm:p-4">
                <Label
                  htmlFor="vendor"
                  className="flex items-center gap-2 text-[13px] font-medium sm:text-sm"
                >
                  <Store className="size-4 text-muted-foreground" />
                  Vendor
                </Label>
                <Select
                  value={vendorId}
                  disabled={submitting}
                  onValueChange={(v) => {
                    setVendorId(v);
                    setErrors((prev) => ({ ...prev, vendorId: undefined }));
                  }}
                >
                  <SelectTrigger
                    id="vendor"
                    className="h-12 w-full cursor-pointer rounded-lg border-border/80 bg-background/80 px-3.5 text-sm shadow-xs backdrop-blur-sm"
                  >
                    <SelectValue placeholder="Select a vendor" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border-border/80 bg-popover/95 shadow-lg backdrop-blur-md">
                    {vendors.map((v) => (
                      <SelectItem
                        key={v.id}
                        value={v.id}
                        className="cursor-pointer rounded-lg"
                      >
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.vendorId ? (
                  <p className="text-sm text-destructive">{errors.vendorId}</p>
                ) : null}
              </div>

              {/* Comment */}

              <div className="space-y-2 sm:space-y-2.5 rounded-[calc(var(--radius)+6px)] p-3 sm:p-4">
                <Label
                  htmlFor="comment"
                  className="flex items-center gap-2 text-[13px] font-medium sm:text-sm"
                >
                  <NotebookPen className="size-4 text-muted-foreground" />
                  Comment (optional)
                </Label>
                <Input
                  id="comment"
                  placeholder="Any notes..."
                  value={comment}
                  disabled={submitting}
                  onChange={(e) => setComment(e.target.value)}
                  className="h-12 w-full rounded-lg border-border/80 bg-background/80 px-3.5 text-sm shadow-xs backdrop-blur-sm"
                />
              </div>

              {/* Master Document */}

              <div className="space-y-2 sm:space-y-2.5 rounded-[calc(var(--radius)+6px)] p-3 sm:p-4">
                <Label className="flex items-center gap-2 text-[13px] font-medium sm:text-sm">
                  <FolderUp className="size-4 text-muted-foreground" />
                  Upload Document
                </Label>

                <div
                  className={`relative overflow-hidden rounded-2xl border border-dashed transition-colors ${
                    isDragActive
                      ? "border-primary/70 bg-primary/5"
                      : file
                        ? "border-primary/30 bg-card/40"
                        : "border-border/70 bg-card/20 hover:border-border"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Input
                    id="file"
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    ref={fileInputRef}
                    disabled={submitting}
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      handleSelectedFile(f);
                    }}
                  />

                  {file ? (
                    <div className="flex items-center gap-3 p-3 sm:p-4">
                      {imagePreviewUrl ? (
                        <img
                          src={imagePreviewUrl}
                          alt="Selected file preview"
                          className="h-16 w-16 shrink-0 rounded-lg border border-border/70 object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
                          {isPdfFile(file) ? (
                            <FileText className="size-5 text-muted-foreground" />
                          ) : (
                            <FileImage className="size-5 text-muted-foreground" />
                          )}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {file.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isPdfFile(file)
                            ? "PDF selected. Click or drop to replace."
                            : "Image selected. Click or drop to replace."}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          *Only one page is processed for now. For multiple
                          pages, create a new split.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-37 flex-col items-center justify-center px-4 py-5 text-center sm:min-h-40 sm:px-5 sm:py-6">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-background/85 text-muted-foreground shadow-xs">
                        <FolderUp className="size-5" />
                      </div>

                      <p className="text-sm font-semibold text-foreground sm:text-base">
                        Drag and drop your file here
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
                        Or click inside this box to browse
                      </p>
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        JPG, PNG, or PDF only
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        *Only one page is processed for now. For multiple pages,
                        create a new split.
                      </p>
                    </div>
                  )}
                </div>
                {errors.file ? (
                  <p className="text-sm text-destructive">{errors.file}</p>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-3 border-t border-border/60 px-4 py-4 sm:px-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="min-h-12 w-full cursor-pointer rounded-lg px-4 text-sm shadow-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="min-h-12 w-full cursor-pointer rounded-lg px-4 text-sm shadow-sm"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create Split"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
