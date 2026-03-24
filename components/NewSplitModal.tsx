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
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    // Only preview images
    if (!file || !file.type.startsWith("image/")) {
      setImagePreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setImagePreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const [errors, setErrors] = React.useState<{
    vendorId?: string;
    file?: string;
  }>({});
  const [submitting, setSubmitting] = React.useState(false);

  function resetForm() {
    setVendorId("");
    setComment("");
    setFile(null);
    setImagePreviewUrl(null);
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

      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New Split</DialogTitle>
          <DialogDescription>
            Upload the master document, choose a vendor, and add an optional
            note.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* Vendor */}
          <div className="space-y-2">
            <Label>Vendor</Label>
            <Select
              value={vendorId}
              onValueChange={(v) => {
                setVendorId(v);
                setErrors((prev) => ({ ...prev, vendorId: undefined }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem
                    key={v.id}
                    value={v.id}
                    className="cursor-pointer"
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

          {/* File */}
          <div className="space-y-2">
            <Label htmlFor="file">Master document</Label>
            <Input
              id="file"
              type="file"
              accept="application/pdf,image/*"
              ref={fileInputRef}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setErrors((prev) => ({ ...prev, file: undefined }));
              }}
            />
            {file ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Selected: <span className="font-medium">{file.name}</span>
                </p>

                {imagePreviewUrl ? (
                  <div className="inline-flex items-center gap-3">
                    <div className="h-16 w-16 overflow-hidden rounded-md border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreviewUrl}
                        alt="Upload preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(file.size / 1024)} KB
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {file.type || "File"} • {Math.round(file.size / 1024)} KB
                  </p>
                )}
              </div>
            ) : null}
            {errors.file ? (
              <p className="text-sm text-destructive">{errors.file}</p>
            ) : null}
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="comment">Comment (optional)</Label>
            <Input
              id="comment"
              placeholder="Anything receiving should know…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Split"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
