"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  FolderOpen,
  GalleryVerticalEnd,
  MessageSquareWarning,
  Settings2,
  Trash2,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import { db } from "@/lib/firebase/db";
import { app } from "@/lib/firebase/config";

// Sidebar data
const data = {
  teams: [
    {
      name: "P.O Splitter",
      logo: GalleryVerticalEnd,
      plan: "Drexel Special Ops",
    },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: GalleryVerticalEnd,
    },
    {
      title: "How to Use",
      url: "/dashboard/onboarding",
      icon: FolderOpen,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
    },
  ],
};

type RecentSplit = {
  id: string;
  fileName?: string;
  status?: string;
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  const pathname = usePathname();
  const functions = getFunctions(app);
  const deleteSplitCallable = httpsCallable(functions, "deleteSplit");

  const [recentSplits, setRecentSplits] = React.useState<RecentSplit[]>([]);
  const [loadingSplits, setLoadingSplits] = React.useState(true);
  const [splitToDelete, setSplitToDelete] = React.useState<RecentSplit | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [hiddenSplitIds, setHiddenSplitIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [feedbackType, setFeedbackType] = React.useState<
    "bug" | "suggestion" | "general"
  >("bug");
  const [feedbackMessage, setFeedbackMessage] = React.useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = React.useState(false);

  React.useEffect(() => {
    if (!user) {
      setRecentSplits([]);
      setLoadingSplits(false);
      return;
    }

    const splitsQuery = query(
      collection(db, "splits"),
      where("createdBy", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(8),
    );

    const unsubscribe = onSnapshot(
      splitsQuery,
      (snapshot) => {
        const nextSplits = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<RecentSplit, "id">;

          return {
            id: docSnap.id,
            fileName: data.fileName,
            status: data.status,
          };
        });

        setRecentSplits(nextSplits);
        setLoadingSplits(false);
      },
      (error) => {
        console.error("Failed to load recent splits:", error);
        setRecentSplits([]);
        setLoadingSplits(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const handleDeleteSplit = async () => {
    if (!splitToDelete) return;

    const splitId = splitToDelete.id;

    try {
      setIsDeleting(true);
      setHiddenSplitIds((currentHiddenSplitIds) => {
        const nextHiddenSplitIds = new Set(currentHiddenSplitIds);
        nextHiddenSplitIds.add(splitId);
        return nextHiddenSplitIds;
      });
      setSplitToDelete(null);
      await deleteSplitCallable({ splitId });
    } catch (error) {
      console.error("Failed to delete split:", error);
      setHiddenSplitIds((currentHiddenSplitIds) => {
        const nextHiddenSplitIds = new Set(currentHiddenSplitIds);
        nextHiddenSplitIds.delete(splitId);
        return nextHiddenSplitIds;
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!user) return;

    const trimmedMessage = feedbackMessage.trim();

    if (!trimmedMessage) {
      toast.error("Please enter your feedback before sending.");
      return;
    }

    try {
      setIsSubmittingFeedback(true);

      await addDoc(collection(db, "feedback"), {
        type: feedbackType,
        message: trimmedMessage,
        route: pathname,
        createdBy: user.uid,
        userEmail: user.email ?? null,
        userName: user.displayName ?? null,
        status: "new",
        createdAt: serverTimestamp(),
      });

      setFeedbackMessage("");
      setFeedbackType("bug");
      setFeedbackOpen(false);
      toast.success("Feedback sent.");
    } catch (error) {
      console.error("Failed to send feedback:", error);
      toast.error("Failed to send feedback.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const navUser = {
    name: user?.displayName ?? "User",
    email: user?.email ?? "",
    avatar: user?.photoURL ?? "/avatars/default.jpg",
  };

  const visibleRecentSplits = React.useMemo(
    () => recentSplits.filter((split) => !hiddenSplitIds.has(split.id)),
    [recentSplits, hiddenSplitIds],
  );

  React.useEffect(() => {
    if (hiddenSplitIds.size === 0) return;

    const recentSplitIds = new Set(recentSplits.map((split) => split.id));

    setHiddenSplitIds((currentHiddenSplitIds) => {
      let changed = false;
      const nextHiddenSplitIds = new Set(currentHiddenSplitIds);

      currentHiddenSplitIds.forEach((splitId) => {
        if (!recentSplitIds.has(splitId)) {
          nextHiddenSplitIds.delete(splitId);
          changed = true;
        }
      });

      return changed ? nextHiddenSplitIds : currentHiddenSplitIds;
    });
  }, [recentSplits, hiddenSplitIds.size]);

  if (!user) {
    return null;
  }

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          <TeamSwitcher teams={data.teams} />
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={data.navMain} />

          <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
            <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent Splits
            </div>

            <div className="space-y-1">
              {loadingSplits ? (
                <div className="rounded-md px-2 py-2 text-sm text-muted-foreground">
                  Loading splits...
                </div>
              ) : visibleRecentSplits.length > 0 ? (
                visibleRecentSplits.map((split) => (
                  <div
                    key={split.id}
                    className="group flex items-start gap-1 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <Link
                      href={`/splitter/${split.id}`}
                      className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-sm"
                    >
                      <FolderOpen className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {split.fileName ?? `Split ${split.id.slice(0, 6)}`}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              split.status === "failed"
                                ? "bg-destructive"
                                : "bg-sky-500"
                            }`}
                            aria-hidden="true"
                          />
                          {split.status ?? "uploaded"}
                        </div>
                      </div>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="cursor-pointer mt-1 mr-1 h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-100"
                      aria-label={`Delete ${split.fileName ?? `Split ${split.id.slice(0, 6)}`}`}
                      onClick={() => setSplitToDelete(split)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="rounded-md px-2 py-2 text-sm text-muted-foreground">
                  No splits yet.
                </div>
              )}
            </div>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
            <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-full rounded-xl cursor-pointer justify-start gap-2 px-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <MessageSquareWarning className="h-4 w-4 shrink-0" />
                  <span>Give Feedback</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="p-4 sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Let us know!</DialogTitle>
                  <DialogDescription>
                    Report a problem, share an idea, or leave general feedback.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-1">
                  <div className="space-y-2">
                    <Label htmlFor="feedback-type">Type</Label>
                    <Select
                      value={feedbackType}
                      onValueChange={(value) =>
                        setFeedbackType(
                          value as "bug" | "suggestion" | "general",
                        )
                      }
                      disabled={isSubmittingFeedback}
                    >
                      <SelectTrigger
                        id="feedback-type"
                        className="cursor-pointer"
                      >
                        <SelectValue placeholder="Select feedback type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bug">Bug report</SelectItem>
                        <SelectItem value="suggestion">
                          Idea or suggestion
                        </SelectItem>
                        <SelectItem value="general">
                          General feedback
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="feedback-route">Page</Label>
                    <Input
                      id="feedback-route"
                      value={pathname}
                      disabled
                      readOnly
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="feedback-message">Message</Label>
                    <Textarea
                      id="feedback-message"
                      placeholder="What happened, or what would you like to see improved?"
                      value={feedbackMessage}
                      onChange={(event) =>
                        setFeedbackMessage(event.target.value)
                      }
                      disabled={isSubmittingFeedback}
                      className="min-h-28"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => setFeedbackOpen(false)}
                    disabled={isSubmittingFeedback}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="cursor-pointer"
                    onClick={handleSubmitFeedback}
                    disabled={isSubmittingFeedback}
                  >
                    {isSubmittingFeedback ? "Sending..." : "Send feedback"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <NavUser user={navUser} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <AlertDialog
        open={Boolean(splitToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setSplitToDelete(null);
          }
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (isDeleting) {
              event.preventDefault();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete split?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">
                {splitToDelete?.fileName ?? "this split"}
              </span>{" "}
              and permanently delete its generated files. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSplit}
              disabled={isDeleting}
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete split"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
