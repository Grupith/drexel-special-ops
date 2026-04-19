"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
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
import { FolderUp, NotebookPen, ScrollText, Store, Upload } from "lucide-react";

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

      await uploadBytes(storageRef, file);
      const originalImageUrl = await getDownloadURL(storageRef);

      await setDoc(doc(db, "splits", splitId), {
        vendorId,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: "uploaded",
        originalImagePath,
        originalImageUrl,
        fileName: file.name,
        comment: comment.trim(),
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
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? <Button>New Split</Button>}
      </DialogTrigger>

      <DialogContent className="border-border/70 bg-linear-to-br from-background via-card to-secondary/50 p-0 shadow-xl sm:max-w-160">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-accent/70 to-transparent"
        />

        <DialogHeader className="relative shrink-0 gap-3 border-b border-border/60 bg-secondary/75 px-4 pt-4 pb-3 text-left sm:px-6 sm:pt-5 sm:pb-4">
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
          <div className="space-y-4 px-4 pt-4 pb-6 sm:px-6 sm:pt-5 sm:pb-8">
            <div className="space-y-2.5 sm:space-y-3">
              {/* Vendor Selection */}

              <div className="space-y-2.5 rounded-[calc(var(--radius)+6px)] bg-card/20 p-3 sm:space-y-3 sm:p-4">
                <Label
                  htmlFor="vendor"
                  className="flex items-center gap-2 text-[13px] font-medium sm:text-sm"
                >
                  <Store className="size-4 text-muted-foreground" />
                  Vendor
                </Label>
                <Select
                  value={vendorId}
                  onValueChange={(v) => {
                    setVendorId(v);
                    setErrors((prev) => ({ ...prev, vendorId: undefined }));
                  }}
                >
                  <SelectTrigger
                    id="vendor"
                    className="h-12 w-full rounded-lg border-border/80 bg-background/80 text-sm shadow-xs backdrop-blur-sm"
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

              <div className="space-y-2.5 rounded-[calc(var(--radius)+6px)] p-3 sm:space-y-3 sm:p-4">
                <Label
                  htmlFor="comment"
                  className="flex items-center gap-2 text-[13px] font-medium sm:text-sm"
                >
                  <NotebookPen className="size-4 text-muted-foreground" />
                  Comment (optional)
                </Label>
                <Textarea
                  id="comment"
                  placeholder="Any notes..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="min-h-24 rounded-lg border-border/80 bg-background/70 px-3.5 py-3 text-sm shadow-xs backdrop-blur-sm sm:min-h-28"
                />
              </div>

              {/* Master Document */}

              <div className="space-y-2.5 rounded-[calc(var(--radius)+6px)] p-3 sm:space-y-3 sm:p-4">
                <Label
                  htmlFor="file"
                  className="flex items-center gap-2 text-[13px] font-medium sm:text-sm"
                >
                  <FolderUp className="size-4 text-muted-foreground" />
                  Master document
                </Label>

                <div
                  className={cn(
                    "relative rounded-xl border border-border/70 bg-background/75 transition-colors",
                    file
                      ? "border-primary/30 bg-primary/5"
                      : "hover:bg-accent/30",
                  )}
                >
                  <Input
                    id="file"
                    type="file"
                    accept="application/pdf,image/*"
                    ref={fileInputRef}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      setErrors((prev) => ({ ...prev, file: undefined }));
                    }}
                  />

                  <div className="flex min-h-32 items-center justify-center px-4 py-6 text-center">
                    {file ? (
                      <div className="space-y-1">
                        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border border-border/70 bg-background/80 text-foreground shadow-sm">
                          <Upload className="size-4" />
                        </div>
                        <p className="truncate text-sm font-medium text-foreground">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Tap to replace
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border border-border/70 bg-background/80 text-foreground shadow-sm">
                          <Upload className="size-4" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          Upload file
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PDF or image
                        </p>
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
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="min-h-12 w-full rounded-lg px-4 text-sm shadow-sm cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="min-h-12 w-full rounded-lg px-4 text-sm shadow-sm cursor-pointer"
            >
              {submitting ? "Creating..." : "Create Split"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
