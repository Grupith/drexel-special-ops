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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FileImage,
  FileText,
  FolderUp,
  Loader2,
  NotebookPen,
  ScrollText,
  Store,
  Upload,
} from "lucide-react";

type VendorOption = { id: string; name: string };

function getFileExtension(fileName: string) {
  const parts = fileName.split(".");
  return parts.length > 1 ? (parts.pop()?.toLowerCase() ?? "") : "";
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

  const [vendorId, setVendorId] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  const [errors, setErrors] = React.useState<{
    vendorId?: string;
    file?: string;
  }>({});
  const [submitting, setSubmitting] = React.useState(false);

  function resetForm() {
    setVendorId("");
    setComment("");
    setFile(null);
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
                  Upload Image
                </Label>

                <div
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border border-dashed transition-all",
                    file
                      ? "border-primary/50 bg-primary/5 shadow-sm"
                      : "border-border/90 bg-background/70 hover:border-primary/50 hover:bg-accent/30",
                  )}
                >
                  <Input
                    id="file"
                    type="file"
                    accept="application/pdf,image/*"
                    ref={fileInputRef}
                    disabled={submitting}
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      setErrors((prev) => ({ ...prev, file: undefined }));
                    }}
                  />

                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-primary/8 to-transparent"
                  />

                  <div className="relative flex min-h-44 flex-col items-center justify-center px-5 py-8 text-center sm:min-h-48 sm:px-6">
                    <div
                      className={cn(
                        "mb-4 flex size-14 items-center justify-center rounded-2xl border shadow-sm transition-transform",
                        file
                          ? "border-primary/30 bg-background text-primary"
                          : "border-border/70 bg-background/90 text-foreground group-hover:scale-[1.03]",
                      )}
                    >
                      {file ? (
                        file.type === "application/pdf" ? (
                          <FileText className="size-6" />
                        ) : (
                          <FileImage className="size-6" />
                        )
                      ) : (
                        <Upload className="size-6" />
                      )}
                    </div>

                    {file ? (
                      <div className="space-y-2">
                        <p className="max-w-88 truncate text-sm font-semibold text-foreground sm:text-base">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground sm:text-sm">
                          File selected. Click to replace it.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground sm:text-base">
                          Upload or drag your master document here
                        </p>
                        <p className="text-xs text-muted-foreground sm:text-sm">
                          Drop a PDF or image, or click to browse files
                        </p>
                        <div className="pt-2">
                          <span className="inline-flex items-center rounded-full border border-border/70 bg-background/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-xs sm:text-xs">
                            Supports PDF, PNG, JPG, and more
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
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
