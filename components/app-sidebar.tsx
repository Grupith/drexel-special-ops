"use client";

import * as React from "react";
import { GalleryVerticalEnd, Settings2, SquareTerminal } from "lucide-react";

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
      title: "New Split",
      url: "/new-split",
      icon: SquareTerminal,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

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
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={navUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
