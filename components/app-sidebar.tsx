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
import { FolderOpen, GalleryVerticalEnd, Settings2 } from "lucide-react";

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
import { useAuth } from "@/contexts/AuthContext";

import { db } from "@/lib/firebase/db";

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

  const [recentSplits, setRecentSplits] = React.useState<RecentSplit[]>([]);
  const [loadingSplits, setLoadingSplits] = React.useState(true);

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

  const navUser = {
    name: user.displayName ?? "User",
    email: user.email ?? "",
    avatar: user.photoURL ?? "/avatars/default.jpg",
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />

        <div className="px-2 py-2">
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
                <Link
                  key={split.id}
                  href={`/splitter/${split.id}`}
                  className="flex items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <FolderOpen className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {split.fileName ?? `Split ${split.id.slice(0, 6)}`}
                    </div>
                    <div className="text-xs capitalize text-muted-foreground">
                      {split.status ?? "uploaded"}
                    </div>
                  </div>
                </Link>
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
  );
}
