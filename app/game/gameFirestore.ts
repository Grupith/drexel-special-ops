"use client";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase/config";

export const COMBI_CONTROL_GAME_ID = "combi-control";

export type GamePlayer = {
  id: string;
  name: string;
  normalizedName: string;
};

export type LeaderboardEntry = {
  id: string;
  playerId: string;
  playerName: string;
  score: number;
};

type ScoreDoc = QueryDocumentSnapshot<DocumentData>;

export function normalizePlayerName(name: string) {
  return name.trim().toLowerCase();
}

export function getTodayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export async function searchGamePlayers(searchTerm: string) {
  const normalizedSearch = normalizePlayerName(searchTerm);

  if (!normalizedSearch) {
    return [];
  }

  const playersQuery = query(
    collection(db, "gamePlayers"),
    orderBy("normalizedName"),
    where("normalizedName", ">=", normalizedSearch),
    where("normalizedName", "<=", `${normalizedSearch}\uf8ff`),
    limit(8)
  );

  const snapshot = await getDocs(playersQuery);

  return snapshot.docs.map((playerDoc) => {
    const data = playerDoc.data();

    return {
      id: playerDoc.id,
      name: String(data.name ?? ""),
      normalizedName: String(data.normalizedName ?? ""),
    };
  });
}

export async function getOrCreateGamePlayer(name: string) {
  const trimmedName = name.trim();
  const normalizedName = normalizePlayerName(trimmedName);

  if (!trimmedName || !normalizedName) {
    throw new Error("Enter a player name.");
  }

  const playerRef = doc(db, "gamePlayers", normalizedName);
  const existingPlayer = await getDoc(playerRef);

  if (existingPlayer.exists()) {
    const existingData = existingPlayer.data();

    await updateDoc(playerRef, {
      lastPlayedAt: serverTimestamp(),
    });

    return {
      id: existingPlayer.id,
      name: String(existingData.name ?? trimmedName),
      normalizedName: String(existingData.normalizedName ?? normalizedName),
    };
  }

  const player = {
    name: trimmedName,
    normalizedName,
    createdAt: serverTimestamp(),
    lastPlayedAt: serverTimestamp(),
  };

  await setDoc(playerRef, player);

  return {
    id: playerRef.id,
    name: trimmedName,
    normalizedName,
  };
}

export async function saveCombiControlScore(player: GamePlayer, score: number) {
  if (score <= 0) {
    return;
  }

  await addDoc(collection(db, "gameScores"), {
    game: COMBI_CONTROL_GAME_ID,
    playerId: player.id,
    playerName: player.name,
    score,
    dateKey: getTodayDateKey(),
    createdAt: serverTimestamp(),
  });
}

function mapScoreDoc(scoreDoc: ScoreDoc): LeaderboardEntry {
  const data = scoreDoc.data();

  return {
    id: scoreDoc.id,
    playerId: String(data.playerId ?? ""),
    playerName: String(data.playerName ?? "Unknown"),
    score: Number(data.score ?? 0),
  };
}

function getLeaderboardPlayerKey(entry: LeaderboardEntry) {
  return entry.playerId || entry.playerName.trim().toLowerCase();
}

function topUniquePlayerScores(entries: LeaderboardEntry[]) {
  const bestByPlayer = new Map<string, LeaderboardEntry>();

  entries.forEach((entry) => {
    const playerKey = getLeaderboardPlayerKey(entry);
    const currentBest = bestByPlayer.get(playerKey);

    if (!currentBest || entry.score > currentBest.score) {
      bestByPlayer.set(playerKey, entry);
    }
  });

  return Array.from(bestByPlayer.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function isIndexBuildingError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "failed-precondition"
  );
}

async function getFallbackLeaderboards(dateKey: string) {
  const scoresRef = collection(db, "gameScores");
  const dailyFallbackQuery = query(
    scoresRef,
    where("dateKey", "==", dateKey),
    limit(100)
  );
  const allTimeFallbackQuery = query(
    scoresRef,
    where("game", "==", COMBI_CONTROL_GAME_ID),
    limit(100)
  );

  const [dailySnapshot, allTimeSnapshot] = await Promise.all([
    getDocs(dailyFallbackQuery),
    getDocs(allTimeFallbackQuery),
  ]);

  return {
    daily: topUniquePlayerScores(
      dailySnapshot.docs
        .filter((scoreDoc) => scoreDoc.data().game === COMBI_CONTROL_GAME_ID)
        .map(mapScoreDoc)
        .filter((entry) => entry.playerId && entry.playerName)
    ),
    allTime: topUniquePlayerScores(allTimeSnapshot.docs.map(mapScoreDoc)),
  };
}

export async function getCombiControlLeaderboards() {
  const dateKey = getTodayDateKey();
  const scoresRef = collection(db, "gameScores");
  const dailyQuery = query(
    scoresRef,
    where("game", "==", COMBI_CONTROL_GAME_ID),
    where("dateKey", "==", dateKey),
    orderBy("score", "desc"),
    limit(100)
  );
  const allTimeQuery = query(
    scoresRef,
    where("game", "==", COMBI_CONTROL_GAME_ID),
    orderBy("score", "desc"),
    limit(100)
  );

  try {
    const [dailySnapshot, allTimeSnapshot] = await Promise.all([
      getDocs(dailyQuery),
      getDocs(allTimeQuery),
    ]);

    return {
      daily: topUniquePlayerScores(dailySnapshot.docs.map(mapScoreDoc)),
      allTime: topUniquePlayerScores(allTimeSnapshot.docs.map(mapScoreDoc)),
    };
  } catch (error) {
    if (isIndexBuildingError(error)) {
      return getFallbackLeaderboards(dateKey);
    }

    throw error;
  }
}
