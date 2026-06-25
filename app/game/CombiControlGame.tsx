"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Crown,
  Keyboard,
  Loader2,
  MousePointerClick,
  Play,
  RotateCcw,
  Search,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCombiControlLeaderboards,
  getOrCreateGamePlayer,
  saveCombiControlScore,
  searchGamePlayers,
  type GamePlayer,
  type LeaderboardEntry,
} from "./gameFirestore";

type GameScreen = "start" | "countdown" | "playing" | "gameOver";

type Forklift = {
  x: number;
  y: number;
  width: number;
  height: number;
  velocity: number;
};

type Obstacle = {
  x: number;
  width: number;
  gapY: number;
  gapHeight: number;
  passed: boolean;
  kind: ObstacleKind;
};

type ObstacleKind = "palletRacking" | "doorRack" | "millworkBunk";
type CountdownStep = "2" | "1" | "Go";
type AsyncStatus = "idle" | "loading" | "error";
type GameSize = {
  width: number;
  height: number;
};

const DEFAULT_GAME_SIZE: GameSize = {
  width: 960,
  height: 540,
};
const FLOOR_HEIGHT = 34;
const FORKLIFT_START_X = 174;
const GRAVITY = 1700;
const LIFT_FORCE = -560;
const OBSTACLE_SPEED = 285;
const OBSTACLE_WIDTH = 72;
const OBSTACLE_GAP = 168;
const OBSTACLE_SPACING = 320;
const FIRST_OBSTACLE_MAX_X = 760;
const MAX_SPEED_BONUS = 135;
const COLLISION_INSET = 7;
const OBSTACLE_KINDS: ObstacleKind[] = [
  "palletRacking",
  "doorRack",
  "millworkBunk",
];
const GAME_OVER_MESSAGES = [
  "You clipped the door rack. But no one saw it ;)",
  "You bent the pallet racking. Opies Mad! ",
  'You probably "forgot" to do a forklift inspection again.',
  "Your being pelted with addons! You need to slow down.",
  "Joel saw you chillen on your phone when he was walking by. He is not happy.",
  "You hit a pole, JLO would be proud of you.",
  "Tanner already knew about it.",
];

function createForklift(size: GameSize = DEFAULT_GAME_SIZE): Forklift {
  return {
    x: Math.min(FORKLIFT_START_X, size.width * 0.28),
    y: size.height / 2 - 28,
    width: 72,
    height: 42,
    velocity: 0,
  };
}

function createObstacle(
  x: number,
  size: GameSize = DEFAULT_GAME_SIZE,
): Obstacle {
  const minimumGapY = 82;
  const maximumGapY = Math.max(
    minimumGapY,
    size.height - FLOOR_HEIGHT - OBSTACLE_GAP - 58,
  );

  return {
    x,
    width: OBSTACLE_WIDTH,
    gapY: minimumGapY + Math.random() * (maximumGapY - minimumGapY),
    gapHeight: OBSTACLE_GAP,
    passed: false,
    kind: OBSTACLE_KINDS[Math.floor(Math.random() * OBSTACLE_KINDS.length)],
  };
}

function getScaledObstacleSpeed(score: number) {
  return OBSTACLE_SPEED + Math.min(score * 9, MAX_SPEED_BONUS);
}

function getRandomGameOverMessage() {
  return GAME_OVER_MESSAGES[
    Math.floor(Math.random() * GAME_OVER_MESSAGES.length)
  ];
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function getForkliftHitbox(forklift: Forklift) {
  return {
    x: forklift.x + COLLISION_INSET,
    y: forklift.y + COLLISION_INSET,
    width: forklift.width - COLLISION_INSET * 2,
    height: forklift.height - COLLISION_INSET * 2,
  };
}

function hasCollision(
  forklift: Forklift,
  obstacles: Obstacle[],
  size: GameSize,
) {
  const forkliftHitbox = getForkliftHitbox(forklift);
  const hitCeiling = forkliftHitbox.y <= 0;
  const hitFloor =
    forkliftHitbox.y + forkliftHitbox.height >= size.height - FLOOR_HEIGHT;

  if (hitCeiling || hitFloor) {
    return true;
  }

  return obstacles.some((obstacle) => {
    const topObstacle = {
      x: obstacle.x,
      y: 0,
      width: obstacle.width,
      height: obstacle.gapY,
    };
    const bottomObstacle = {
      x: obstacle.x,
      y: obstacle.gapY + obstacle.gapHeight,
      width: obstacle.width,
      height: size.height - FLOOR_HEIGHT - (obstacle.gapY + obstacle.gapHeight),
    };

    return (
      rectsOverlap(forkliftHitbox, topObstacle) ||
      rectsOverlap(forkliftHitbox, bottomObstacle)
    );
  });
}

function drawWarehouseBackground(
  context: CanvasRenderingContext2D,
  size: GameSize,
) {
  const { width, height } = size;
  const wallGradient = context.createLinearGradient(0, 0, 0, height);
  wallGradient.addColorStop(0, "#f2eadb");
  wallGradient.addColorStop(0.42, "#d8cdbb");
  wallGradient.addColorStop(1, "#a89576");
  context.fillStyle = wallGradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255, 249, 226, 0.48)";
  for (let x = 120; x < width; x += 240) {
    context.beginPath();
    context.ellipse(x, 42, 74, 15, 0, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(47, 41, 33, 0.1)";
  context.beginPath();
  context.moveTo(0, 116);
  context.lineTo(270, 180);
  context.lineTo(270, height - FLOOR_HEIGHT);
  context.lineTo(0, height - FLOOR_HEIGHT);
  context.closePath();
  context.fill();

  context.beginPath();
  context.moveTo(width, 116);
  context.lineTo(width - 270, 180);
  context.lineTo(width - 270, height - FLOOR_HEIGHT);
  context.lineTo(width, height - FLOOR_HEIGHT);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(83, 63, 36, 0.45)";
  context.lineWidth = 7;
  for (let x = -30; x < 238; x += 70) {
    context.beginPath();
    context.moveTo(x, height - FLOOR_HEIGHT);
    context.lineTo(x + 150, 122);
    context.stroke();
  }
  for (let x = width + 30; x > width - 238; x -= 70) {
    context.beginPath();
    context.moveTo(x, height - FLOOR_HEIGHT);
    context.lineTo(x - 150, 122);
    context.stroke();
  }

  context.strokeStyle = "rgba(210, 151, 55, 0.72)";
  context.lineWidth = 5;
  for (let y = 166; y < height - 70; y += 64) {
    context.beginPath();
    context.moveTo(0, y + 30);
    context.lineTo(232, y);
    context.stroke();
    context.beginPath();
    context.moveTo(width, y + 30);
    context.lineTo(width - 232, y);
    context.stroke();
  }

  context.fillStyle = "rgba(46, 41, 34, 0.1)";
  for (let x = 54; x < width; x += 138) {
    context.fillRect(x, 0, 7, height - FLOOR_HEIGHT);
  }

  context.strokeStyle = "rgba(74, 66, 54, 0.16)";
  context.lineWidth = 2;
  for (let y = 76; y < height - FLOOR_HEIGHT; y += 82) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const floorGradient = context.createLinearGradient(
    0,
    height - 152,
    0,
    height,
  );
  floorGradient.addColorStop(0, "#8f8069");
  floorGradient.addColorStop(1, "#443c31");
  context.fillStyle = floorGradient;
  context.fillRect(0, height - 154, width, 154);

  context.fillStyle = "rgba(255, 232, 157, 0.68)";
  for (let x = -24; x < width; x += 92) {
    context.fillRect(x, height - 21, 42, 4);
  }

  context.strokeStyle = "rgba(27, 25, 21, 0.2)";
  context.lineWidth = 1;
  for (let x = -width; x < width * 2; x += 72) {
    context.beginPath();
    context.moveTo(x, height - FLOOR_HEIGHT);
    context.lineTo(x + 180, height);
    context.stroke();
  }

  context.strokeStyle = "rgba(245, 216, 139, 0.42)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(width / 2 - 92, height - FLOOR_HEIGHT);
  context.lineTo(width / 2 - 188, height);
  context.stroke();
  context.beginPath();
  context.moveTo(width / 2 + 92, height - FLOOR_HEIGHT);
  context.lineTo(width / 2 + 188, height);
  context.stroke();
}

function drawRackSideBars(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  context.fillStyle = color;
  context.fillRect(x, y, width, 10);
  context.fillRect(x, y + height - 10, width, 10);
  context.fillRect(x, y, 10, height);
  context.fillRect(x + width - 10, y, 10, height);
}

function drawPalletRacking(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  drawRackSideBars(context, x, y, width, height, "#805f35");
  context.fillStyle = "#bf8f3f";
  for (let shelf = y + 38; shelf < y + height - 20; shelf += 48) {
    context.fillRect(x + 8, shelf, width - 16, 7);
  }
  context.fillStyle = "rgba(55, 41, 27, 0.42)";
  for (let boxY = y + 16; boxY < y + height - 40; boxY += 50) {
    context.fillRect(x + 17, boxY, width - 34, 24);
  }
}

function drawDoorRack(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  drawRackSideBars(context, x, y, width, height, "#56514a");
  context.strokeStyle = "#d7c6a8";
  context.lineWidth = 5;
  for (let doorY = y + 20; doorY < y + height - 24; doorY += 46) {
    context.strokeRect(x + 16, doorY, width - 32, 28);
  }
  context.fillStyle = "rgba(39, 36, 31, 0.38)";
  context.fillRect(x + width - 18, y + 8, 6, height - 16);
}

function drawMillworkBunk(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.fillStyle = "#7a5a37";
  context.fillRect(x + 8, y, width - 16, height);
  context.fillStyle = "#c49a5a";
  for (let railY = y + 18; railY < y + height - 8; railY += 20) {
    context.fillRect(x + 12, railY, width - 24, 8);
  }
  context.fillStyle = "rgba(42, 31, 21, 0.3)";
  context.fillRect(x, y, width, 8);
  context.fillRect(x, y + height - 8, width, 8);
}

function drawObstacleSegment(
  context: CanvasRenderingContext2D,
  obstacle: Obstacle,
  y: number,
  height: number,
) {
  if (height <= 0) {
    return;
  }

  if (obstacle.kind === "doorRack") {
    drawDoorRack(context, obstacle.x, y, obstacle.width, height);
    return;
  }

  if (obstacle.kind === "millworkBunk") {
    drawMillworkBunk(context, obstacle.x, y, obstacle.width, height);
    return;
  }

  drawPalletRacking(context, obstacle.x, y, obstacle.width, height);
}

function drawForklift(context: CanvasRenderingContext2D, forklift: Forklift) {
  const { x, y, width, height } = forklift;

  context.fillStyle = "rgba(22, 20, 16, 0.22)";
  context.fillRect(x + 3, y + height + 8, width + 32, 5);

  context.fillStyle = "#1f7a4d";
  context.fillRect(x + 7, y + 15, width - 8, height - 14);
  context.fillStyle = "#2faa68";
  context.fillRect(x + 13, y + 4, 32, 20);
  context.fillStyle = "#14583a";
  context.fillRect(x + 48, y + 7, 22, height - 2);

  context.fillStyle = "#191714";
  context.fillRect(x + width - 4, y - 9, 8, height + 16);
  context.fillRect(x + width + 4, y + 30, 30, 5);
  context.fillRect(x + width + 29, y + 24, 5, 13);

  context.fillStyle = "#dbf1df";
  context.fillRect(x + 18, y + 8, 17, 10);
  context.fillStyle = "#f0c766";
  context.fillRect(x + 9, y + 26, 11, 8);

  context.fillStyle = "#151310";
  context.beginPath();
  context.arc(x + 17, y + height + 2, 8, 0, Math.PI * 2);
  context.arc(x + 57, y + height + 2, 8, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#4b453a";
  context.beginPath();
  context.arc(x + 17, y + height + 2, 3, 0, Math.PI * 2);
  context.arc(x + 57, y + height + 2, 3, 0, Math.PI * 2);
  context.fill();
}

function drawGame(
  context: CanvasRenderingContext2D,
  forklift: Forklift,
  obstacles: Obstacle[],
  size: GameSize,
) {
  context.clearRect(0, 0, size.width, size.height);
  drawWarehouseBackground(context, size);

  obstacles.forEach((obstacle) => {
    drawObstacleSegment(context, obstacle, 0, obstacle.gapY);
    drawObstacleSegment(
      context,
      obstacle,
      obstacle.gapY + obstacle.gapHeight,
      size.height - FLOOR_HEIGHT - (obstacle.gapY + obstacle.gapHeight),
    );
  });

  drawForklift(context, forklift);
}

function getLeaderboardRowClass(index: number) {
  if (index === 0) {
    return "border-amber-400 bg-gradient-to-br from-amber-50 via-yellow-50 to-background shadow-[0_14px_34px_rgba(217,119,6,0.18)]";
  }

  if (index === 1) {
    return "border-slate-300 bg-gradient-to-br from-slate-50 via-zinc-50 to-background shadow-[0_10px_24px_rgba(71,85,105,0.14)]";
  }

  if (index === 2) {
    return "border-orange-300 bg-gradient-to-br from-orange-50 via-amber-50/70 to-background shadow-[0_10px_24px_rgba(194,65,12,0.13)]";
  }

  return "border-border/70 bg-background";
}

function getLeaderboardRankClass(index: number) {
  if (index === 0) {
    return "border-amber-300 bg-amber-100 text-amber-950";
  }

  if (index === 1) {
    return "border-slate-300 bg-slate-100 text-slate-800 shadow-sm";
  }

  if (index === 2) {
    return "border-orange-300 bg-orange-100 text-orange-950 shadow-sm";
  }

  return "border-border bg-muted/60 text-muted-foreground";
}

function getLeaderboardLabel(index: number) {
  if (index === 0) {
    return "Current top spot";
  }

  if (index === 1) {
    return "Second place";
  }

  if (index === 2) {
    return "Third place";
  }

  return null;
}

function getLeaderboardLabelClass(index: number) {
  if (index === 0) {
    return "text-amber-700";
  }

  if (index === 1) {
    return "text-slate-600";
  }

  if (index === 2) {
    return "text-orange-700";
  }

  return "";
}

function getLeaderboardScoreClass(index: number) {
  if (index === 0) {
    return "border border-amber-300 bg-amber-100 px-2.5 py-1 text-base shadow-sm";
  }

  if (index === 1) {
    return "border border-slate-300 bg-slate-100 px-2.5 py-1 text-sm shadow-sm";
  }

  if (index === 2) {
    return "border border-orange-300 bg-orange-100 px-2.5 py-1 text-sm shadow-sm";
  }

  return "bg-muted/70 px-2 py-0.5";
}

function LeaderboardList({
  entries,
  status,
  error,
  fillHeight = false,
}: {
  entries: LeaderboardEntry[];
  status: AsyncStatus;
  error: string | null;
  fillHeight?: boolean;
}) {
  if (status === "loading") {
    return (
      <div
        className={`flex items-center justify-center rounded-md border border-border bg-background/70 text-sm text-muted-foreground ${
          fillHeight ? "min-h-0 flex-1" : "h-24"
        }`}
      >
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className={`rounded-md border border-destructive/25 bg-destructive/10 px-3 py-3 text-sm text-destructive ${
          fillHeight ? "min-h-0 flex-1" : ""
        }`}
      >
        {error ?? "Unable to load leaderboard."}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className={`rounded-md border border-border bg-background/70 px-3 py-3 text-sm text-muted-foreground ${
          fillHeight ? "min-h-0 flex-1" : ""
        }`}
      >
        No scores yet.
      </div>
    );
  }

  return (
    <ol
      className={`space-y-1 overflow-auto pr-1 ${
        fillHeight ? "min-h-0 flex-1" : "max-h-80"
      }`}
    >
      {entries.map((entry, index) => {
        const isChampion = index === 0;
        const isPodium = index < 3;
        const leaderboardLabel = getLeaderboardLabel(index);

        return (
          <li
            key={entry.id}
            className={`grid items-center gap-2 rounded-md border text-sm ${getLeaderboardRowClass(
              index,
            )} ${
              isChampion
                ? "grid-cols-[2.75rem_minmax(0,1fr)_auto] px-3 py-3"
                : isPodium
                  ? "grid-cols-[2.5rem_minmax(0,1fr)_auto] px-3 py-2.5"
                  : "grid-cols-[2rem_minmax(0,1fr)_auto] px-2.5 py-1.5"
            }`}
          >
            <span
              className={`flex items-center justify-center rounded-full border font-bold ${getLeaderboardRankClass(
                index,
              )} ${isChampion ? "size-9 text-base" : isPodium ? "size-8 text-sm" : "size-6 text-xs"}`}
            >
              {isChampion ? <Crown className="size-4" /> : index + 1}
            </span>
            <span className="min-w-0">
              {leaderboardLabel ? (
                <span
                  className={`mb-0.5 block text-[0.65rem] font-black uppercase tracking-[0.16em] ${getLeaderboardLabelClass(
                    index,
                  )}`}
                >
                  {leaderboardLabel}
                </span>
              ) : null}
              <span
                className={`block truncate text-foreground ${
                  isChampion
                    ? "text-base font-black"
                    : isPodium
                      ? "font-bold"
                      : "font-medium"
                }`}
              >
                {entry.playerName}
              </span>
            </span>
            <span
              className={`rounded-md font-bold tabular-nums text-foreground ${getLeaderboardScoreClass(
                index,
              )}`}
            >
              {entry.score}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ControlsCard() {
  return (
    <section className="relative overflow-hidden rounded-md border border-border bg-card/95 px-4 py-3 shadow-2xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-sky-300" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
            Controls
          </p>
          <h3 className="text-base font-black tracking-normal text-foreground">
            Jump
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
          <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 shadow-sm">
            <Keyboard className="size-4 text-muted-foreground" />
            <span className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-black uppercase tracking-wide">
              Space
            </span>
          </span>
          <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">
            or
          </span>
          <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 shadow-sm">
            <MousePointerClick className="size-4 text-muted-foreground" />
            Tap / Click
          </span>
        </div>
      </div>
    </section>
  );
}

export function CombiControlGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const forkliftRef = useRef<Forklift>(createForklift());
  const obstaclesRef = useRef<Obstacle[]>([]);
  const scoreRef = useRef(0);
  const screenRef = useRef<GameScreen>("start");
  const animateRef = useRef<(timestamp: number) => void>(() => {});
  const scoreSavedRef = useRef(false);
  const gameSizeRef = useRef<GameSize>(DEFAULT_GAME_SIZE);

  const [screen, setScreen] = useState<GameScreen>("start");
  const [selectedPlayer, setSelectedPlayer] = useState<GamePlayer | null>(null);
  const [playerSearchTerm, setPlayerSearchTerm] = useState("");
  const [playerMatches, setPlayerMatches] = useState<GamePlayer[]>([]);
  const [playerSearchStatus, setPlayerSearchStatus] =
    useState<AsyncStatus>("idle");
  const [playerActionStatus, setPlayerActionStatus] =
    useState<AsyncStatus>("idle");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [countdown, setCountdown] = useState<CountdownStep>("2");
  const [gameOverMessage, setGameOverMessage] = useState(GAME_OVER_MESSAGES[0]);
  const [leaderboardStatus, setLeaderboardStatus] =
    useState<AsyncStatus>("idle");
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [allTimeLeaderboard, setAllTimeLeaderboard] = useState<
    LeaderboardEntry[]
  >([]);
  const [scoreSaveStatus, setScoreSaveStatus] = useState<AsyncStatus>("idle");
  const [scoreSaveError, setScoreSaveError] = useState<string | null>(null);

  const syncScreen = useCallback((nextScreen: GameScreen) => {
    screenRef.current = nextScreen;
    setScreen(nextScreen);
  }, []);

  const flap = useCallback(() => {
    if (screenRef.current !== "playing") {
      return;
    }

    forkliftRef.current.velocity = LIFT_FORCE;
  }, []);

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    lastFrameTimeRef.current = null;
  }, []);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const loadLeaderboards = useCallback(async () => {
    setLeaderboardStatus("loading");
    setLeaderboardError(null);

    try {
      const leaderboards = await getCombiControlLeaderboards();

      setAllTimeLeaderboard(leaderboards.allTime);
      setLeaderboardStatus("idle");
    } catch (error) {
      console.error("Failed to load Combi Control leaderboards", error);
      setLeaderboardError("Unable to load leaderboards.");
      setLeaderboardStatus("error");
    }
  }, []);

  const selectPlayer = useCallback((player: GamePlayer) => {
    setSelectedPlayer(player);
    setPlayerSearchTerm(player.name);
    setPlayerMatches([]);
    setPlayerError(null);
  }, []);

  const createOrSelectPlayer = useCallback(async () => {
    setPlayerActionStatus("loading");
    setPlayerError(null);

    try {
      const player = await getOrCreateGamePlayer(playerSearchTerm);
      selectPlayer(player);
      setPlayerActionStatus("idle");

      return player;
    } catch (error) {
      console.error("Failed to select Combi Control player", error);
      setPlayerError(
        error instanceof Error ? error.message : "Unable to select player.",
      );
      setPlayerActionStatus("error");

      return null;
    }
  }, [playerSearchTerm, selectPlayer]);

  const persistGameOverScore = useCallback(
    async (scoreToSave: number) => {
      const player = selectedPlayer;

      if (!player || scoreToSave < 0 || scoreSavedRef.current) {
        await loadLeaderboards();
        return;
      }

      scoreSavedRef.current = true;
      setScoreSaveStatus("loading");
      setScoreSaveError(null);

      try {
        await saveCombiControlScore(player, scoreToSave);
        setScoreSaveStatus("idle");
      } catch (error) {
        console.error("Failed to save Combi Control score", error);
        setScoreSaveError("Unable to save this score.");
        setScoreSaveStatus("error");
      } finally {
        await loadLeaderboards();
      }
    },
    [loadLeaderboards, selectedPlayer],
  );

  const endGame = useCallback(() => {
    stopLoop();
    clearCountdownTimer();
    const scoreAtDeath = scoreRef.current;

    setFinalScore(scoreAtDeath);
    setGameOverMessage(getRandomGameOverMessage());
    syncScreen("gameOver");
    void persistGameOverScore(scoreAtDeath);
  }, [clearCountdownTimer, persistGameOverScore, stopLoop, syncScreen]);

  useEffect(() => {
    animateRef.current = (timestamp: number) => {
      if (screenRef.current !== "playing") {
        return;
      }

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return;
      }

      const lastFrameTime = lastFrameTimeRef.current ?? timestamp;
      const deltaTime = Math.min((timestamp - lastFrameTime) / 1000, 0.033);
      lastFrameTimeRef.current = timestamp;

      const forklift = forkliftRef.current;
      const gameSize = gameSizeRef.current;
      forklift.velocity += GRAVITY * deltaTime;
      forklift.y += forklift.velocity * deltaTime;

      const obstacles = obstaclesRef.current;
      const obstacleSpeed = getScaledObstacleSpeed(scoreRef.current);
      obstacles.forEach((obstacle) => {
        obstacle.x -= obstacleSpeed * deltaTime;

        if (!obstacle.passed && obstacle.x + obstacle.width < forklift.x) {
          obstacle.passed = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
        }
      });

      while (obstacles.length && obstacles[0].x + obstacles[0].width < -20) {
        obstacles.shift();
      }

      const lastObstacle = obstacles[obstacles.length - 1];
      if (!lastObstacle || lastObstacle.x < gameSize.width - OBSTACLE_SPACING) {
        obstacles.push(createObstacle(gameSize.width + 40, gameSize));
      }

      drawGame(context, forklift, obstacles, gameSize);

      if (hasCollision(forklift, obstacles, gameSize)) {
        endGame();
        return;
      }

      frameRef.current = requestAnimationFrame(animateRef.current);
    };
  }, [endGame]);

  const resetGameState = useCallback(() => {
    const gameSize = gameSizeRef.current;

    forkliftRef.current = createForklift(gameSize);
    const firstObstacleX = Math.min(gameSize.width + 120, FIRST_OBSTACLE_MAX_X);
    obstaclesRef.current = [
      createObstacle(firstObstacleX, gameSize),
      createObstacle(firstObstacleX + OBSTACLE_SPACING, gameSize),
    ];
    scoreRef.current = 0;
    scoreSavedRef.current = false;
    setScore(0);
    setFinalScore(0);
    setGameOverMessage(GAME_OVER_MESSAGES[0]);
    setScoreSaveStatus("idle");
    setScoreSaveError(null);
  }, []);

  const startGame = useCallback(async () => {
    const player = await createOrSelectPlayer();

    if (!player) {
      return;
    }

    stopLoop();
    clearCountdownTimer();
    resetGameState();
    setCountdown("2");
    syncScreen("countdown");

    countdownTimerRef.current = window.setTimeout(() => {
      setCountdown("1");

      countdownTimerRef.current = window.setTimeout(() => {
        setCountdown("Go");

        countdownTimerRef.current = window.setTimeout(() => {
          countdownTimerRef.current = null;
          syncScreen("playing");
          lastFrameTimeRef.current = null;
          frameRef.current = requestAnimationFrame(animateRef.current);
        }, 600);
      }, 1000);
    }, 1000);
  }, [
    clearCountdownTimer,
    createOrSelectPlayer,
    resetGameState,
    stopLoop,
    syncScreen,
  ]);

  const backToStart = useCallback(() => {
    stopLoop();
    clearCountdownTimer();
    resetGameState();
    setSelectedPlayer(null);
    setPlayerSearchTerm("");
    setPlayerMatches([]);
    setPlayerError(null);
    setPlayerSearchStatus("idle");
    setPlayerActionStatus("idle");
    syncScreen("start");
  }, [clearCountdownTimer, resetGameState, stopLoop, syncScreen]);

  useEffect(() => {
    const normalizedSearch = playerSearchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      setPlayerMatches([]);
      setPlayerSearchStatus("idle");
      return;
    }

    let isCurrent = true;
    setPlayerSearchStatus("loading");
    setPlayerError(null);

    const searchTimer = window.setTimeout(() => {
      searchGamePlayers(playerSearchTerm)
        .then((players) => {
          if (!isCurrent) {
            return;
          }

          setPlayerMatches(players);
          setPlayerSearchStatus("idle");
        })
        .catch((error) => {
          if (!isCurrent) {
            return;
          }

          console.error("Failed to search Combi Control players", error);
          setPlayerError("Unable to search players.");
          setPlayerSearchStatus("error");
        });
    }, 220);

    return () => {
      isCurrent = false;
      window.clearTimeout(searchTimer);
    };
  }, [playerSearchTerm]);

  useEffect(() => {
    if (screen !== "start") {
      return;
    }

    void loadLeaderboards();
  }, [loadLeaderboards, screen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const previousSize = gameSizeRef.current;
      const nextSize = {
        width: Math.max(Math.floor(rect.width), 320),
        height: Math.max(Math.floor(rect.height), 320),
      };

      canvas.width = Math.floor(nextSize.width * scale);
      canvas.height = Math.floor(nextSize.height * scale);
      gameSizeRef.current = nextSize;

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      const widthRatio = nextSize.width / previousSize.width;
      const heightRatio = nextSize.height / previousSize.height;

      forkliftRef.current = {
        ...forkliftRef.current,
        x: Math.min(
          forkliftRef.current.x * widthRatio,
          nextSize.width - forkliftRef.current.width - 8,
        ),
        y: Math.min(
          forkliftRef.current.y * heightRatio,
          nextSize.height - FLOOR_HEIGHT - forkliftRef.current.height - 8,
        ),
      };
      obstaclesRef.current = obstaclesRef.current.map((obstacle) => ({
        ...obstacle,
        x: obstacle.x * widthRatio,
        gapY: Math.min(
          obstacle.gapY * heightRatio,
          Math.max(
            82,
            nextSize.height - FLOOR_HEIGHT - obstacle.gapHeight - 58,
          ),
        ),
      }));

      context.setTransform(scale, 0, 0, scale, 0, 0);
      drawGame(context, forkliftRef.current, obstaclesRef.current, nextSize);
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    resizeCanvas();

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        if (
          screenRef.current === "playing" ||
          screenRef.current === "countdown"
        ) {
          event.preventDefault();
        }

        if (screenRef.current === "playing") {
          flap();
        }

        return;
      }

      if (event.code === "KeyF" && screenRef.current === "gameOver") {
        event.preventDefault();

        if (!event.repeat) {
          void startGame();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flap, startGame]);

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (
        screenRef.current !== "playing" ||
        !event.isPrimary ||
        event.button > 0
      ) {
        return;
      }

      event.preventDefault();
      flap();
    },
    [flap],
  );

  useEffect(() => {
    return () => {
      stopLoop();
      clearCountdownTimer();
    };
  }, [clearCountdownTimer, stopLoop]);

  return (
    <main className="h-dvh w-screen overflow-hidden bg-background text-foreground">
      <section
        className="relative h-full w-full overflow-hidden bg-card"
        style={{ touchAction: screen === "playing" ? "none" : "auto" }}
        onPointerDown={handleCanvasPointerDown}
      >
        <canvas
          ref={canvasRef}
          aria-label="Combi Control game canvas"
          className="block h-full w-full touch-none select-none bg-muted"
        />

        {screen === "countdown" || screen === "playing" ? (
          <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-2.5 py-2 sm:px-5 sm:py-3">
            <div className="flex min-w-0 items-center gap-2">
              {selectedPlayer ? (
                <div className="min-w-0 max-w-[44vw] rounded-md bg-background/78 px-2.5 py-1.5 text-center shadow-sm backdrop-blur-sm sm:min-w-32 sm:max-w-xs sm:px-3 sm:py-2">
                  <div className="text-[0.56rem] font-black uppercase leading-none tracking-wide text-muted-foreground sm:text-[0.68rem]">
                    Player
                  </div>
                  <div className="mx-auto my-1 h-px w-full bg-border/80 sm:my-1.5" />
                  <div className="truncate text-sm font-black leading-none text-foreground sm:text-lg">
                    {selectedPlayer.name}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="min-w-20 rounded-md bg-background/78 px-2.5 py-1.5 text-center shadow-sm backdrop-blur-sm sm:min-w-28 sm:px-3 sm:py-2">
              <div className="text-[0.56rem] font-black uppercase leading-none tracking-wide text-amber-900 sm:text-[0.68rem]">
                Aisles Cleared
              </div>
              <div className="mx-auto my-1 h-px w-full bg-amber-300/80 sm:my-1.5" />
              <div className="text-2xl font-black leading-none tabular-nums text-amber-950 sm:text-5xl">
                {score}
              </div>
            </div>
          </header>
        ) : null}

        {screen === "countdown" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 px-4 backdrop-blur-[2px]">
            <div className="rounded-md bg-background/82 px-8 py-6 text-center shadow-lg backdrop-blur-sm">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Get Ready
              </p>
              <div className="mt-2 text-7xl font-semibold leading-none tracking-normal text-foreground">
                {countdown}
              </div>
            </div>
          </div>
        ) : null}

        {screen === "start" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/62 px-4 py-4 backdrop-blur-[3px]">
            <div className="grid max-h-[calc(100dvh-2rem)] w-full max-w-5xl gap-4 overflow-auto md:grid-cols-[minmax(0,25rem)_minmax(18rem,1fr)] md:items-start">
              <div className="relative rounded-md border border-border bg-card/95 p-6 shadow-2xl">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary/70" />
                <div className="mb-7">
                  <div className="w-fit rounded-full border border-green-300 bg-green-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-green-900 shadow-sm">
                    Forklift Arcade
                  </div>
                  <h2 className="mt-3 text-4xl font-black leading-none tracking-normal text-foreground sm:text-5xl">
                    Combi Control
                  </h2>
                  <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                    Clear the aisles. Dodge the racks.{" "}
                    <strong className="font-black text-foreground">
                      Keep dispatch happy.
                    </strong>
                  </p>
                </div>

                <div className="mb-5 h-px bg-border" />

                <div className="space-y-4">
                  <label
                    htmlFor="player-search"
                    className="block text-sm font-semibold text-foreground"
                  >
                    Player
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="player-search"
                      value={playerSearchTerm}
                      onChange={(event) => {
                        setPlayerSearchTerm(event.target.value);
                        setSelectedPlayer(null);
                      }}
                      placeholder="Search or create player"
                      className="h-12 bg-background/95 pl-9 font-semibold"
                    />
                  </div>

                  {playerSearchTerm.trim() && !selectedPlayer ? (
                    <div className="space-y-3">
                      {playerSearchStatus === "loading" ? (
                        <div className="flex items-center rounded-md border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground">
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Searching
                        </div>
                      ) : null}

                      {playerMatches.length > 0 ? (
                        <div className="max-h-40 overflow-auto rounded-md border border-border bg-background p-1 shadow-sm">
                          {playerMatches.map((player) => (
                            <button
                              key={player.id}
                              type="button"
                              className="flex w-full items-center justify-between rounded-sm px-3 py-2.5 text-left text-sm hover:bg-muted"
                              onClick={() => selectPlayer(player)}
                            >
                              <span className="truncate font-medium">
                                {player.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {playerSearchStatus === "idle" &&
                      playerMatches.length === 0 ? (
                        <div className="rounded-md border border-dashed border-emerald-400/45 bg-emerald-50/80 px-4 py-3.5 text-emerald-950 shadow-sm shadow-emerald-950/5 dark:border-emerald-400/35 dark:bg-emerald-950/25 dark:text-emerald-50">
                          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/70 bg-emerald-100 px-2.5 py-1 text-xs font-black uppercase tracking-normal text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-400/15 dark:text-emerald-100">
                            <UserPlus className="size-3.5" />
                            New player queued
                          </div>
                          <p className="mt-2 text-sm font-semibold text-emerald-950 dark:text-emerald-50">
                            No matching player.
                          </p>
                          <p className="mt-1.5 text-sm text-emerald-900/80 dark:text-emerald-100/75">
                            Start Shift will create{" "}
                            <strong className="font-black text-emerald-950 dark:text-emerald-50">
                              &quot;{playerSearchTerm.trim()}&quot;
                            </strong>{" "}
                            as a new player.
                          </p>
                        </div>
                      ) : null}

                      {playerMatches.length > 0 && !selectedPlayer ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={createOrSelectPlayer}
                          disabled={playerActionStatus === "loading"}
                        >
                          {playerActionStatus === "loading" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Search className="size-4" />
                          )}
                          Use This Player
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedPlayer ? (
                    <div className="rounded-md border border-dashed border-sky-400/45 bg-sky-50/80 px-4 py-3.5 text-sky-950 shadow-sm shadow-sky-950/5 dark:border-sky-400/35 dark:bg-sky-950/25 dark:text-sky-50">
                      <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-sky-100 px-2.5 py-1 text-xs font-black uppercase tracking-normal text-sky-900 dark:border-sky-500/35 dark:bg-sky-400/15 dark:text-sky-100">
                        <BadgeCheck className="size-3.5" />
                        Player found
                      </div>
                      <p className="mt-2 text-sm font-semibold text-sky-950 dark:text-sky-50">
                        Ready for{" "}
                        <strong className="font-black">
                          {selectedPlayer.name}
                        </strong>
                        .
                      </p>
                      <p className="mt-1.5 text-sm text-sky-900/80 dark:text-sky-100/75">
                        Start Shift will load this player and save the run to
                        their profile.
                      </p>
                    </div>
                  ) : null}

                  {playerError ? (
                    <p className="text-sm font-medium text-destructive">
                      {playerError}
                    </p>
                  ) : null}
                </div>

                <div className="mt-6 h-px bg-border" />

                <Button
                  className="mt-6 h-12 w-full text-base font-black uppercase tracking-wide shadow-md"
                  size="lg"
                  onClick={startGame}
                  disabled={playerActionStatus === "loading"}
                >
                  <Play className="size-4" />
                  Start Shift
                </Button>
              </div>

              <div className="space-y-4">
                <ControlsCard />

                <section className="relative rounded-md border border-border bg-card/95 p-4 shadow-2xl">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-amber-300" />
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
                        High Scores
                      </p>
                      <h3 className="text-xl font-black tracking-normal text-foreground">
                        All-Time Leaderboard
                      </h3>
                    </div>
                    <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                      Top 20
                    </span>
                  </div>
                  <LeaderboardList
                    entries={allTimeLeaderboard}
                    status={leaderboardStatus}
                    error={leaderboardError}
                  />
                </section>
              </div>
            </div>
          </div>
        ) : null}

        {screen === "gameOver" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/62 px-4 py-4 backdrop-blur-[3px]">
            <div className="grid max-h-[calc(100dvh-2rem)] w-full max-w-5xl gap-4 overflow-auto lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] lg:items-stretch">
              <div className="relative flex min-h-136 flex-col overflow-hidden rounded-md border border-destructive/25 bg-card/95 p-5 text-center shadow-2xl sm:p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-destructive/75" />
                <div className="grid gap-4">
                  <div className="px-1 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Player
                    </p>
                    <p className="mt-1 truncate text-xl font-bold text-black sm:text-2xl">
                      {selectedPlayer?.name ?? "No player selected"}
                    </p>
                  </div>
                  <div className="mx-auto w-full max-w-sm border-y border-border px-5 py-3 text-center">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
                      Final Score
                    </p>
                    <p className="mt-2 text-6xl font-black leading-none tabular-nums text-sky-700 sm:text-7xl">
                      {finalScore}
                    </p>
                  </div>
                </div>

                <div className="flex flex-1 items-center justify-center py-5">
                  <div>
                    <p className="text-lg font-black uppercase tracking-[0.2em] text-destructive sm:text-lg">
                      Game Over
                    </p>
                    <h2
                      className="mx-auto mt-2 max-w-xl text-balance text-xl font-medium leading-snug tracking-normal text-foreground sm:text-2xl lg:text-3xl"
                      style={{
                        fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
                      }}
                    >
                      &quot;{gameOverMessage}&quot;
                    </h2>
                    {scoreSaveStatus === "loading" ? (
                      <p className="mt-5 flex items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Saving score
                      </p>
                    ) : null}
                    {scoreSaveError ? (
                      <p className="mt-5 text-sm font-medium text-destructive">
                        {scoreSaveError}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="min-h-12 justify-between"
                    onClick={startGame}
                  >
                    <span className="inline-flex items-center gap-2">
                      <RotateCcw className="size-4" />
                      Play Again
                    </span>
                    <span className="rounded border border-primary-foreground/40 bg-primary-foreground/15 px-2 py-0.5 text-xs font-black uppercase tracking-wide">
                      F
                    </span>
                  </Button>
                  <Button
                    className="min-h-12"
                    variant="outline"
                    onClick={backToStart}
                  >
                    <ArrowLeft className="size-4" />
                    Back to Main Menu
                  </Button>
                </div>
              </div>

              <section className="relative flex min-h-136 flex-col overflow-hidden rounded-md border border-border bg-card/95 p-4 shadow-2xl">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-amber-300" />
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
                      High Scores
                    </p>
                    <h3 className="text-xl font-black tracking-normal text-foreground">
                      All Time
                    </h3>
                  </div>
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                    Top 20
                  </span>
                </div>
                <LeaderboardList
                  entries={allTimeLeaderboard}
                  status={leaderboardStatus}
                  error={leaderboardError}
                  fillHeight
                />
              </section>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
