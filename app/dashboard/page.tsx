"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { NewSplitModal } from "@/components/NewSplitModal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase/db";
import {
  Award,
  FilePlus,
  House,
  Package,
  Search,
  Smile,
  Zap,
} from "lucide-react";

type PoSearchResult = {
  id: string;
  splitId: string;
  poNumber: string;
  poNumberNormalized: string;
  order: number | null;
  rowCount: number | null;
  status: string | null;
  createdAtLabel: string | null;
  createdAtMs: number | null;
};

type DailyLeaderboard = {
  dateKey: string;
  topReceiverToday: string;
  fastestScanner: string;
  inAGreatMood: string;
  wantsToGoHome: string;
};

const RECEIVING_TEAM_NAMES = [
  "Ashley Helgerson",
  "Dylan Koss",
  "Mike Santacroche",
  "AJ Klotz",
  "Chris Roeske",
  "Bryce Vogt",
  "Brad Drobka",
  "Bob Kurtz",
];

const DAILY_LEADERBOARD_STORAGE_KEY = "dashboard-daily-receiving-leaderboard";

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

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildDailyLeaderboard(dateKey: string): DailyLeaderboard {
  const names = [...RECEIVING_TEAM_NAMES];

  for (let i = names.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [names[i], names[randomIndex]] = [names[randomIndex], names[i]];
  }

  return {
    dateKey,
    topReceiverToday: names[0] ?? "Receiving Legend",
    fastestScanner: names[1] ?? names[0] ?? "Speed Demon",
    inAGreatMood: names[2] ?? names[0] ?? "Sunshine",
    wantsToGoHome: names[3] ?? names[0] ?? "Clock Watcher",
  };
}

export default function DashboardPage() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const [liveTotalSplits, setLiveTotalSplits] = React.useState<number | null>(
    null,
  );
  const [mostRecentSplit, setMostRecentSplit] = React.useState<{
    id: string;
    fileName?: string | null;
    vendorId?: string | null;
    status?: string | null;
  } | null>(null);
  const [poSearch, setPoSearch] = React.useState("");
  const [poResults, setPoResults] = React.useState<PoSearchResult[]>([]);
  const [isSearchingPo, setIsSearchingPo] = React.useState(false);
  const [isPoSearchOpen, setIsPoSearchOpen] = React.useState(false);
  const [activePoResultIndex, setActivePoResultIndex] = React.useState(0);
  const [dailyLeaderboard, setDailyLeaderboard] =
    React.useState<DailyLeaderboard | null>(null);

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

  const poSearchInputRef = React.useRef<HTMLInputElement | null>(null);
  const poSearchContainerRef = React.useRef<HTMLDivElement | null>(null);

  const normalizedPoSearch = poSearch.trim().toUpperCase();
  const [debouncedPoSearch, setDebouncedPoSearch] = React.useState("");

  const formatPoSearchDate = React.useCallback((value?: Date | null) => {
    if (!value) return null;

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(value);
  }, []);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedPoSearch(normalizedPoSearch);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [normalizedPoSearch]);

  const mapSubSplitResult = React.useCallback(
    (
      splitId: string,
      doc: import("firebase/firestore").QueryDocumentSnapshot,
      fallbackPoNumber: string,
    ) => {
      const data = doc.data() as {
        poNumber?: string | null;
        poNumberNormalized?: string | null;
        order?: number | null;
        rowCount?: number | null;
        status?: string | null;
        createdAt?: { toDate?: () => Date } | null;
      };

      const createdAtDate = data.createdAt?.toDate?.() ?? null;

      return {
        id: doc.id,
        splitId,
        poNumber: data.poNumber ?? fallbackPoNumber,
        poNumberNormalized:
          data.poNumberNormalized ??
          data.poNumber?.trim().toUpperCase() ??
          fallbackPoNumber,
        order: typeof data.order === "number" ? data.order : null,
        rowCount: typeof data.rowCount === "number" ? data.rowCount : null,
        status: data.status ?? null,
        createdAtLabel: formatPoSearchDate(createdAtDate),
        createdAtMs: createdAtDate?.getTime() ?? null,
      } satisfies PoSearchResult;
    },
    [formatPoSearchDate],
  );

  React.useEffect(() => {
    const userId = user?.uid;

    if (!userId || debouncedPoSearch.length < 3) {
      setPoResults([]);
      setIsSearchingPo(false);
      setActivePoResultIndex(0);
      return;
    }

    let isCancelled = false;

    async function runPoSearch() {
      setIsSearchingPo(true);

      try {
        const prefixQuery = query(
          collectionGroup(db, "subSplits"),
          where("splitCreatedBy", "==", userId),
          where("poNumberNormalized", ">=", debouncedPoSearch),
          where("poNumberNormalized", "<=", `${debouncedPoSearch}\uf8ff`),
          orderBy("poNumberNormalized"),
          limit(8),
        );

        const snapshot = await getDocs(prefixQuery);

        if (isCancelled) return;

        const dedupedPrefixResults = Array.from(
          new Map(
            snapshot.docs
              .map((doc) => {
                const splitId = doc.ref.parent.parent?.id;
                if (!splitId) return null;
                return mapSubSplitResult(splitId, doc, debouncedPoSearch);
              })
              .filter((result): result is PoSearchResult => Boolean(result))
              .map((result) => [`${result.splitId}:${result.id}`, result]),
          ).values(),
        )
          .sort((a, b) => {
            const poCompare = a.poNumberNormalized.localeCompare(
              b.poNumberNormalized,
            );
            if (poCompare !== 0) return poCompare;
            return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
          })
          .slice(0, 6);

        setPoResults(dedupedPrefixResults);
        setActivePoResultIndex(0);
        setIsSearchingPo(false);
      } catch (error) {
        console.error("Failed to search PO subSplits:", error);
        if (!isCancelled) {
          setPoResults([]);
          setActivePoResultIndex(0);
          setIsSearchingPo(false);
        }
      }
    }

    void runPoSearch();

    return () => {
      isCancelled = true;
    };
  }, [debouncedPoSearch, mapSubSplitResult, user?.uid]);

  React.useEffect(() => {
    if (poResults.length === 0) {
      setActivePoResultIndex(0);
      return;
    }

    setActivePoResultIndex((currentIndex) =>
      Math.min(currentIndex, poResults.length - 1),
    );
  }, [poResults]);

  React.useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!poSearchContainerRef.current) return;
      if (poSearchContainerRef.current.contains(event.target as Node)) return;
      setIsPoSearchOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  React.useEffect(() => {
    const dateKey = getTodayDateKey();

    if (typeof window === "undefined") return;

    try {
      const storedValue = window.localStorage.getItem(
        DAILY_LEADERBOARD_STORAGE_KEY,
      );

      if (storedValue) {
        const parsedValue = JSON.parse(storedValue) as DailyLeaderboard;

        if (parsedValue.dateKey === dateKey) {
          setDailyLeaderboard(parsedValue);
          return;
        }
      }
    } catch (error) {
      console.warn(
        "Failed to read daily leaderboard from localStorage:",
        error,
      );
    }

    const nextLeaderboard = buildDailyLeaderboard(dateKey);
    setDailyLeaderboard(nextLeaderboard);

    try {
      window.localStorage.setItem(
        DAILY_LEADERBOARD_STORAGE_KEY,
        JSON.stringify(nextLeaderboard),
      );
    } catch (error) {
      console.warn("Failed to save daily leaderboard to localStorage:", error);
    }
  }, []);

  const totalSplits = (liveTotalSplits ?? userProfile?.stats?.totalSplits) || 0;

  const memberSinceLabel = userProfile?.createdAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(userProfile.createdAt)
    : null;

  function handlePoSearchSubmit(index = activePoResultIndex) {
    const result = poResults[index] ?? poResults[0];
    if (!result) return;

    setIsPoSearchOpen(false);
    router.push(
      `/splitter/${result.splitId}?highlight=${encodeURIComponent(result.id)}`,
    );
  }

  return (
    <div className="min-w-0 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl min-w-0 space-y-6 sm:space-y-8">
        <div className="relative z-50 min-w-0 overflow-visible">
          <div className="relative min-w-0 space-y-4 overflow-visible">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="mb-2 font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
                    {getGreeting()},{" "}
                    {getFirstName(
                      userProfile?.displayName || user?.displayName,
                    )}
                    !
                  </h1>
                  {memberSinceLabel ? (
                    <p className="pl-1 text-xs text-muted-foreground sm:text-sm">
                      Make it a great day!
                    </p>
                  ) : null}
                </div>

                <div className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/80 bg-card/80 px-4 py-3 shadow-sm sm:w-auto sm:min-w-64">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Total Splits
                    </p>
                    <p className="text-2xl font-semibold leading-none text-foreground">
                      {totalSplits}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/80 bg-accent text-accent-foreground">
                    <Package className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-30 mt-8 mb-6 flex flex-col gap-3 overflow-visible sm:flex-row sm:items-center">
              <NewSplitModal
                receiverNames={RECEIVING_TEAM_NAMES}
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
                    Create Split
                  </Button>
                }
              />

              {/* PO Search */}
              <div
                ref={poSearchContainerRef}
                className="relative z-40 min-w-0 w-full sm:max-w-md lg:max-w-xl"
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    ref={poSearchInputRef}
                    value={poSearch}
                    onChange={(event) => {
                      const nextValue = event.target.value.toUpperCase();
                      setPoSearch(nextValue);
                      setActivePoResultIndex(0);
                      setIsPoSearchOpen(nextValue.trim().length >= 3);
                    }}
                    onFocus={() => {
                      if (normalizedPoSearch.length >= 3) {
                        setIsPoSearchOpen(true);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        if (!isPoSearchOpen && poResults.length > 0) {
                          setIsPoSearchOpen(true);
                          return;
                        }
                        if (poResults.length === 0) return;
                        setActivePoResultIndex((currentIndex) =>
                          currentIndex >= poResults.length - 1
                            ? 0
                            : currentIndex + 1,
                        );
                      }

                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        if (poResults.length === 0) return;
                        setActivePoResultIndex((currentIndex) =>
                          currentIndex <= 0
                            ? poResults.length - 1
                            : currentIndex - 1,
                        );
                      }

                      if (event.key === "Enter") {
                        event.preventDefault();
                        handlePoSearchSubmit(activePoResultIndex);
                      }

                      if (event.key === "Escape") {
                        setIsPoSearchOpen(false);
                        poSearchInputRef.current?.blur();
                      }
                    }}
                    placeholder="Search recent PO numbers..."
                    className="h-11 w-full rounded-lg border border-border/80 bg-white/50 pl-10 pr-4 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                {normalizedPoSearch && isPoSearchOpen ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                    {isSearchingPo ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Searching PO numbers...
                      </div>
                    ) : poResults.length > 0 ? (
                      <div className="py-1">
                        {poResults.map((result, index) => (
                          <button
                            key={result.id}
                            type="button"
                            onMouseEnter={() => setActivePoResultIndex(index)}
                            onClick={() => {
                              setActivePoResultIndex(index);
                              handlePoSearchSubmit(index);
                            }}
                            className={`flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-3 text-left transition-colors ${
                              index === activePoResultIndex
                                ? "bg-accent/60"
                                : "hover:bg-accent/50"
                            }`}
                          >
                            <div className="min-w-0 space-y-1">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {result.poNumber}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Order {result.order ?? "—"} •{" "}
                                {result.rowCount ?? "—"} rows
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                {result.status ?? "unknown"}
                              </p>
                              {result.createdAtLabel ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {result.createdAtLabel}
                                </p>
                              ) : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : normalizedPoSearch.length < 3 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Type at least 3 characters to search.
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        No matching PO found. Try a broader prefix like F54.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Daily Leaderboard */}

        <section className="relative z-0 space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Daily Leaderboard
              </h2>
              <p className="text-sm text-muted-foreground">
                Today&apos;s totally official receiving team awards.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <div className="min-h-36 overflow-hidden rounded-lg border border-yellow-500/50 bg-card p-4 shadow-[0_0_0_1px_rgb(234_179_8/0.10),0_10px_30px_-18px_rgb(234_179_8)]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-yellow-600/20 bg-yellow-400/20 text-yellow-700 dark:border-yellow-300/20 dark:text-yellow-300">
                  <Award className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-border/70 bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                  Steady lead
                </span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Top Receiver Today
              </p>
              <p className="mt-2 text-lg font-semibold leading-tight text-foreground">
                {dailyLeaderboard?.topReceiverToday ?? "Loading..."}
              </p>
            </div>

            <div className="min-h-36 overflow-hidden rounded-lg border border-border/80 bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/70 bg-secondary text-secondary-foreground">
                  <Zap className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-border/70 bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                  Quick hands
                </span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Fastest Scanner
              </p>
              <p className="mt-2 text-lg font-semibold leading-tight text-foreground">
                {dailyLeaderboard?.fastestScanner ?? "Loading..."}
              </p>
            </div>

            <div className="min-h-36 overflow-hidden rounded-lg border border-border/80 bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted text-foreground">
                  <Smile className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-border/70 bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                  Good energy
                </span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                In a Great Mood!
              </p>
              <p className="mt-2 text-lg font-semibold leading-tight text-foreground">
                {dailyLeaderboard?.inAGreatMood ?? "Loading..."}
              </p>
            </div>

            <div className="min-h-36 overflow-hidden rounded-lg border border-border/80 bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/70 bg-primary text-primary-foreground">
                  <House className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-border/70 bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                  Lunch hero
                </span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Wants to Buy Lunch!
              </p>
              <p className="mt-2 text-lg font-semibold leading-tight text-foreground">
                {dailyLeaderboard?.wantsToGoHome ?? "Loading..."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
