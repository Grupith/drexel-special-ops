"use client";

import * as React from "react";
import Link from "next/link";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  FolderOpen,
  GalleryVerticalEnd,
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
import { useAuth } from "@/contexts/AuthContext";

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
  const functions = getFunctions(app);
  const deleteSplitCallable = httpsCallable(functions, "deleteSplit");

  const [recentSplits, setRecentSplits] = React.useState<RecentSplit[]>([]);
  const [loadingSplits, setLoadingSplits] = React.useState(true);
  const [splitToDelete, setSplitToDelete] = React.useState<RecentSplit | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deletingSplitId, setDeletingSplitId] = React.useState<string | null>(
    null,
  );

  if (!user) {
    return null;
  }

  React.useEffect(() => {
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
  }, [user.uid]);

  const handleDeleteSplit = async () => {
    if (!splitToDelete) return;

    try {
      setIsDeleting(true);
      setDeletingSplitId(splitToDelete.id);
      await deleteSplitCallable({ splitId: splitToDelete.id });
      setSplitToDelete(null);
    } catch (error) {
      console.error("Failed to delete split:", error);
      setDeletingSplitId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const navUser = {
    name: user.displayName ?? "User",
    email: user.email ?? "",
    avatar: user.photoURL ?? "/avatars/default.jpg",
  };

  React.useEffect(() => {
    if (!deletingSplitId) return;

    const splitStillExists = recentSplits.some(
      (split) => split.id === deletingSplitId,
    );

    if (!splitStillExists) {
      setDeletingSplitId(null);
    }
  }, [recentSplits, deletingSplitId]);

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
              ) : recentSplits.length > 0 ? (
                recentSplits.map((split) => (
                  <div
                    key={split.id}
                    className="group flex items-start gap-1 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    {(() => {
                      const isDeletingThisSplit = deletingSplitId === split.id;

                      return (
                        <>
                          {isDeletingThisSplit ? (
                            <div className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-sm opacity-60">
                              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0" />
                              <div className="min-w-0">
                                <div className="truncate font-medium">
                                  {split.fileName ??
                                    `Split ${split.id.slice(0, 6)}`}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span
                                    className="h-2 w-2 rounded-full bg-destructive"
                                    aria-hidden="true"
                                  />
                                  Deleting...
                                </div>
                              </div>
                            </div>
                          ) : (
                            <Link
                              href={`/splitter/${split.id}`}
                              className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-sm"
                            >
                              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0" />
                              <div className="min-w-0">
                                <div className="truncate font-medium">
                                  {split.fileName ??
                                    `Split ${split.id.slice(0, 6)}`}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                                  <span
                                    className="h-2 w-2 rounded-full bg-sky-500"
                                    aria-hidden="true"
                                  />
                                  {split.status ?? "uploaded"}
                                </div>
                              </div>
                            </Link>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="cursor-pointer mt-1 mr-1 h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-100"
                            aria-label={`Delete ${split.fileName ?? `Split ${split.id.slice(0, 6)}`}`}
                            onClick={() => setSplitToDelete(split)}
                            disabled={isDeletingThisSplit}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      );
                    })()}
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
