"use client";

import * as React from "react";
import Link from "next/link";

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
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase/db";
import { ArrowRight, FilePlus, Package } from "lucide-react";

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
  const [mostRecentSplit, setMostRecentSplit] = React.useState<{
    id: string;
    fileName?: string | null;
    vendorId?: string | null;
    status?: string | null;
  } | null>(null);

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

  React.useEffect(() => {
    if (!user?.uid) {
      setMostRecentSplit(null);
      return;
    }

    const recentSplitQuery = query(
      collection(db, "splits"),
      where("createdBy", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(1),
    );

    const unsubscribe = onSnapshot(
      recentSplitQuery,
      (snapshot) => {
        const doc = snapshot.docs[0];

        if (!doc) {
          setMostRecentSplit(null);
          return;
        }

        const data = doc.data() as {
          fileName?: string | null;
          vendorId?: string | null;
          status?: string | null;
        };

        setMostRecentSplit({
          id: doc.id,
          fileName: data.fileName ?? null,
          vendorId: data.vendorId ?? null,
          status: data.status ?? null,
        });
      },
      (error) => {
        console.error("Failed to subscribe to most recent split:", error);
        setMostRecentSplit(null);
      },
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const totalSplits = (liveTotalSplits ?? userProfile?.stats?.totalSplits) || 0;

  const memberSinceLabel = userProfile?.createdAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(userProfile.createdAt)
    : null;

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
            </div>

            <NewSplitModal
              vendors={[
                { id: "SHAW", name: "SHAW" },
                { id: "test vendor", name: "test vendor" },
              ]}
              trigger={
                <Button
                  size="lg"
                  className="h-10 w-full cursor-pointer rounded-md shadow-sm sm:w-auto"
                >
                  <FilePlus className="mr-2 h-5 w-5" />
                  New Split
                </Button>
              }
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
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

          <Card className="overflow-hidden rounded-[calc(var(--radius)+6px)] border-border/70 bg-linear-to-br from-card via-card to-accent/40 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    Most Recent Split
                  </CardTitle>
                  <CardDescription>
                    Open your latest split and review the generated pages.
                  </CardDescription>
                </div>
                <div className="rounded-2xl border border-border/80 bg-background/80 p-2.5 text-foreground shadow-sm backdrop-blur-sm">
                  <ArrowRight className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {mostRecentSplit ? (
                <Link
                  href={`/splitter/${mostRecentSplit.id}`}
                  className="group block cursor-pointer rounded-lg border border-border/70 bg-background/70 p-4 transition-all duration-200 hover:scale-[1.02] hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-base font-semibold text-foreground">
                        {mostRecentSplit.fileName || "Untitled split"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {mostRecentSplit.vendorId || "Unknown vendor"}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Status: {mostRecentSplit.status || "unknown"}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ) : (
                <NewSplitModal
                  vendors={[
                    { id: "SHAW", name: "SHAW" },
                    { id: "test vendor", name: "test vendor" },
                  ]}
                  trigger={
                    <button
                      type="button"
                      className="group block w-full cursor-pointer rounded-lg border border-dashed border-border/70 bg-background/50 p-4 text-left text-sm text-muted-foreground transition-all duration-200 hover:scale-[1.02] hover:border-border hover:bg-accent/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p>
                          No splits yet. Create your first split to see it here.
                        </p>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
