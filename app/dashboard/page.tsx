"use client";

import { NewSplitModal } from "@/components/NewSplitModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock3,
  FilePlus,
  Package,
  Sparkles,
} from "lucide-react";

function getFirstName(name?: string | null) {
  if (!name) return "User";
  return name.trim().split(" ")[0];
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user, userProfile } = useAuth();

  const totalSplits = userProfile?.stats?.totalSplits || 0;
  const completedSplits = userProfile?.stats?.completedSplits || 0;
  const pendingSplits = Math.max(totalSplits - completedSplits, 0);

  const memberSinceLabel = userProfile?.createdAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(userProfile.createdAt)
    : null;

  const statusLabel =
    totalSplits === 0
      ? "Ready for your first upload"
      : pendingSplits > 0
        ? `${pendingSplits} split${pendingSplits === 1 ? "" : "s"} still processing`
        : "All splits completed";

  const statusTone =
    totalSplits === 0
      ? "neutral"
      : pendingSplits > 0
        ? "processing"
        : "complete";

  const statusToneClassName =
    statusTone === "complete"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : statusTone === "processing"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-100 text-slate-700";

  const statusBadgeClassName = cn(
    "inline-flex items-center gap-2 rounded-md border px-3 py-1 font-medium",
    statusToneClassName,
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-linear-to-br from-white via-gray-50 to-gray-100/80 p-5 shadow-sm sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div>
              <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {getGreeting()},{" "}
                {getFirstName(userProfile?.displayName || user?.displayName)}!
              </h1>
              {memberSinceLabel ? (
                <p className="text-xs pl-1 text-muted-foreground sm:text-sm">
                  - Member since {memberSinceLabel}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
              <span className={statusBadgeClassName}>
                {statusLabel}
                {statusTone === "processing" ? (
                  <Clock3 className="h-3.5 w-3.5" />
                ) : statusTone === "complete" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
              </span>
            </div>
          </div>

          <NewSplitModal
            vendors={[
              { id: "SHAW", name: "SHAW" },
              { id: "test vendor", name: "test vendor" },
            ]}
            trigger={
              <Button
                size="lg"
                className="h-11 w-full cursor-pointer rounded-md sm:w-auto"
              >
                <FilePlus className="mr-2 h-5 w-5" />
                New Split
              </Button>
            }
          />
        </div>

        <div className="grid gap-4">
          <Card className="overflow-hidden sm:w-1/3 rounded-xl border-border/70 bg-linear-to-br from-white via-gray-50 to-gray-100 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Splits
                  </CardTitle>
                  <CardDescription>
                    Every document batch you&apos;ve submitted.
                  </CardDescription>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-slate-700 shadow-sm">
                  <Package className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {totalSplits}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
