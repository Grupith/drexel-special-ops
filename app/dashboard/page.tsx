"use client";

import * as React from "react";

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
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase/db";

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
  const [liveTotalSplits, setLiveTotalSplits] = React.useState<number | null>(
    null,
  );

  React.useEffect(() => {
    if (!user?.uid) {
      setLiveTotalSplits(null);
      return;
    }

    const splitsQuery = query(
      collection(db, "splits"),
      where("createdBy", "==", user.uid),
    );

    const unsubscribe = onSnapshot(
      splitsQuery,
      (snapshot) => {
        setLiveTotalSplits(snapshot.size);
      },
      (error) => {
        console.error("Failed to subscribe to total splits:", error);
        setLiveTotalSplits(null);
      },
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const totalSplits = (liveTotalSplits ?? userProfile?.stats?.totalSplits) || 0;
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
      ? "border-primary/20 bg-primary text-primary-foreground shadow-sm"
      : statusTone === "processing"
        ? "border-border/80 bg-secondary text-secondary-foreground"
        : "border-border/80 bg-muted text-muted-foreground";

  const statusBadgeClassName = cn(
    "inline-flex items-center gap-2 rounded-md border px-3 py-1 font-medium",
    statusToneClassName,
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
        <div className="relative overflow-hidden rounded-[calc(var(--radius)+8px)] border border-border/70 bg-linear-to-br from-background via-card to-secondary/60 p-5 shadow-sm sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-accent/60 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 top-8 h-40 w-40 rounded-full bg-primary/8 blur-3xl"
          />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div>
                <h1 className="mb-2 font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
                  {getGreeting()},{" "}
                  {getFirstName(userProfile?.displayName || user?.displayName)}!
                </h1>
                {memberSinceLabel ? (
                  <p className="pl-1 text-xs text-muted-foreground sm:text-sm">
                    Member since {memberSinceLabel}
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
                  size="sm"
                  className="h-10 w-full cursor-pointer rounded-md shadow-sm sm:w-auto"
                >
                  <FilePlus className="mr-2 h-5 w-5" />
                  New Split
                </Button>
              }
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="overflow-hidden rounded-[calc(var(--radius)+6px)] border-border/70 bg-linear-to-br from-card via-card to-accent/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    Total Splits
                  </CardTitle>
                  <CardDescription>
                    Every document batch you&apos;ve submitted.
                  </CardDescription>
                </div>
                <div className="rounded-2xl border border-border/80 bg-background/80 p-2.5 text-foreground shadow-sm backdrop-blur-sm">
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
