"use client";

import * as React from "react";
import Image from "next/image";
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
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CircleHelp,
  FileImage,
  FileText,
  FolderUp,
  Loader2,
  ScrollText,
  Store,
  UserRound,
} from "lucide-react";

type VendorOption = { id: string; name: string; disabled?: boolean };

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

function getOrdinalSuffix(day: number) {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatStampPreviewDate(date: Date) {
  const month = date.toLocaleString("en-US", { month: "long" });
  const day = date.getDate();
  return `${month} ${day}${getOrdinalSuffix(day)}, ${date.getFullYear()}`;
}

export function NewSplitModal({
  receiverNames,
  vendors,
  trigger,
}: {
  receiverNames: string[];
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
  const [receivedByName, setReceivedByName] = React.useState("");
  const [includeStamp, setIncludeStamp] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<{
    receivedByName?: string;
    vendorId?: string;
    file?: string;
  }>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const includeStampSwitchRef = React.useRef<HTMLButtonElement | null>(null);
  const includeStampClickDelegatedRef = React.useRef(false);
  const stampPreviewDate = React.useMemo(
    () => formatStampPreviewDate(new Date()),
    [],
  );

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
    setReceivedByName("");
    setIncludeStamp(false);
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
    if (!receivedByName) next.receivedByName = "Select who received it";
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
        includeStamp,
        receivedByName,
        dateReceived: serverTimestamp(),
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
        className="border-border/80 bg-card p-0 shadow-xl sm:max-w-142"
        onPointerDownOutside={(e) => {
          if (submitting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 gap-2 border-b border-border/70 px-4 py-4 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg border border-border/80 bg-background text-muted-foreground">
              <ScrollText className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-lg leading-tight font-semibold">
                New split
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Choose the basics, then upload the document.
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
          <div className="space-y-5 px-4 py-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="vendor"
                  className="flex items-center gap-2 text-sm font-medium"
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
                    className="h-11 w-full cursor-pointer rounded-lg border-border/80 bg-background px-3 text-sm shadow-xs"
                  >
                    <SelectValue placeholder="Select a vendor" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border-border/80 bg-popover/95 shadow-lg backdrop-blur-md">
                    {vendors.map((v) => (
                      <SelectItem
                        key={v.id}
                        value={v.id}
                        disabled={v.disabled}
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

              <div className="space-y-2">
                <Label
                  htmlFor="received-by"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <UserRound className="size-4 text-muted-foreground" />
                  Received by
                </Label>
                <Select
                  value={receivedByName}
                  disabled={submitting}
                  onValueChange={(v) => {
                    setReceivedByName(v);
                    setErrors((prev) => ({
                      ...prev,
                      receivedByName: undefined,
                    }));
                  }}
                >
                  <SelectTrigger
                    id="received-by"
                    className="h-11 w-full cursor-pointer rounded-lg border-border/80 bg-background px-3 text-sm shadow-xs"
                  >
                    <SelectValue placeholder="Select a receiver" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border-border/80 bg-popover/95 shadow-lg backdrop-blur-md">
                    {receiverNames.map((name) => (
                      <SelectItem
                        key={name}
                        value={name}
                        className="cursor-pointer rounded-lg"
                      >
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.receivedByName ? (
                  <p className="text-sm text-destructive">
                    {errors.receivedByName}
                  </p>
                ) : null}
              </div>
            </div>

            <div
              className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border/80 bg-background px-3 py-3 text-sm font-medium leading-5 transition-colors hover:bg-muted/35"
              onClick={(event) => {
                if (submitting) return;

                if (includeStampClickDelegatedRef.current) {
                  includeStampClickDelegatedRef.current = false;
                  return;
                }

                const target = event.target as HTMLElement;
                if (
                  target.closest("[data-slot='switch']") ||
                  target.closest("input[type='checkbox']") ||
                  target.closest("[data-stamp-help]")
                ) {
                  return;
                }

                includeStampClickDelegatedRef.current = true;
                includeStampSwitchRef.current?.click();
              }}
            >
              <Label className="flex cursor-pointer items-center gap-2 text-sm font-medium leading-5">
                Include Stamp
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      aria-label="Include stamp details"
                      data-stamp-help
                      className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      tabIndex={0}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <CircleHelp className="size-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-80 border border-border/80 bg-popover p-2.5 text-popover-foreground shadow-lg"
                  >
                    <div className="space-y-2">
                      <div className="space-y-1 text-xs leading-5">
                        <p className="font-semibold">
                          Places a "Received" stamp on each subsplit document
                          with the following:
                        </p>
                        <div className="rounded-md border border-border/70 bg-background px-2 py-1.5 font-mono text-[11px] leading-5 text-foreground">
                          <p>
                            Received by:{" "}
                            <span className="font-semibold text-red-600">
                              {receivedByName || "selected receiver"}
                            </span>
                          </p>
                          <p>
                            Date received:{" "}
                            <span className="font-semibold">
                              {stampPreviewDate}
                            </span>
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">Example</p>
                      <Image
                        src="/images/stamp-example.png"
                        alt="Example of the received stamp added to a split document"
                        width={1128}
                        height={872}
                        className="h-36 w-72 max-w-full rounded-md border border-border/70 bg-background object-cover object-top-left"
                      />
                    </div>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                ref={includeStampSwitchRef}
                id="include-stamp"
                checked={includeStamp}
                disabled={submitting}
                onCheckedChange={setIncludeStamp}
                aria-label="Include Stamp"
                className="cursor-pointer"
              />
            </div>

            <div className="space-y-2.5">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <FolderUp className="size-4 text-muted-foreground" />
                Document
              </Label>

              <div
                className={`relative overflow-hidden rounded-lg border border-dashed transition-colors ${
                  isDragActive
                    ? "border-primary/70 bg-primary/5"
                    : file
                      ? "border-primary/40 bg-background"
                      : "border-border/80 bg-background hover:border-muted-foreground/45"
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
                  <div className="flex items-center gap-3 p-3">
                    {imagePreviewUrl ? (
                      <img
                        src={imagePreviewUrl}
                        alt="Selected file preview"
                        className="size-14 shrink-0 rounded-md border border-border/70 object-cover"
                      />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/35">
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
                        Click or drop a file here to replace it.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-34 flex-col items-center justify-center px-4 py-5 text-center sm:min-h-36">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground">
                      <FolderUp className="size-5" />
                    </div>

                    <p className="text-sm font-medium text-foreground">
                      Drop a file here or click to browse
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      JPG, PNG, or PDF
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>Only one file can be uploaded.</span>
                <span>One page is processed per split.</span>
              </div>
              {errors.file ? (
                <p className="text-sm text-destructive">{errors.file}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-3 border-t border-border/70 bg-background/45 px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="min-h-11 w-full cursor-pointer rounded-lg px-4 text-sm shadow-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="min-h-11 w-full cursor-pointer rounded-lg px-4 text-sm shadow-sm"
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
