"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Crown,
  Keyboard,
  Loader2,
  MousePointerClick,
  Play,
  Plus,
  RotateCcw,
  Search,
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

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const FLOOR_HEIGHT = 34;
const FORKLIFT_START_X = 174;
const GRAVITY = 1700;
const LIFT_FORCE = -560;
const OBSTACLE_SPEED = 285;
const OBSTACLE_WIDTH = 72;
const OBSTACLE_GAP = 168;
const OBSTACLE_SPACING = 320;
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
];

function createForklift(): Forklift {
  return {
    x: FORKLIFT_START_X,
    y: GAME_HEIGHT / 2 - 28,
    width: 72,
    height: 42,
    velocity: 0,
  };
}

function createObstacle(x: number): Obstacle {
  const minimumGapY = 82;
  const maximumGapY = GAME_HEIGHT - FLOOR_HEIGHT - OBSTACLE_GAP - 58;

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

function hasCollision(forklift: Forklift, obstacles: Obstacle[]) {
  const forkliftHitbox = getForkliftHitbox(forklift);
  const hitCeiling = forkliftHitbox.y <= 0;
  const hitFloor =
    forkliftHitbox.y + forkliftHitbox.height >= GAME_HEIGHT - FLOOR_HEIGHT;

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
      height: GAME_HEIGHT - FLOOR_HEIGHT - (obstacle.gapY + obstacle.gapHeight),
    };

    return (
      rectsOverlap(forkliftHitbox, topObstacle) ||
      rectsOverlap(forkliftHitbox, bottomObstacle)
    );
  });
}

function drawWarehouseBackground(context: CanvasRenderingContext2D) {
  const wallGradient = context.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  wallGradient.addColorStop(0, "#f2eadb");
  wallGradient.addColorStop(0.42, "#d8cdbb");
  wallGradient.addColorStop(1, "#a89576");
  context.fillStyle = wallGradient;
  context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  context.fillStyle = "rgba(255, 249, 226, 0.48)";
  for (let x = 120; x < GAME_WIDTH; x += 240) {
    context.beginPath();
    context.ellipse(x, 42, 74, 15, 0, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(47, 41, 33, 0.1)";
  context.beginPath();
  context.moveTo(0, 116);
  context.lineTo(270, 180);
  context.lineTo(270, GAME_HEIGHT - FLOOR_HEIGHT);
  context.lineTo(0, GAME_HEIGHT - FLOOR_HEIGHT);
  context.closePath();
  context.fill();

  context.beginPath();
  context.moveTo(GAME_WIDTH, 116);
  context.lineTo(GAME_WIDTH - 270, 180);
  context.lineTo(GAME_WIDTH - 270, GAME_HEIGHT - FLOOR_HEIGHT);
  context.lineTo(GAME_WIDTH, GAME_HEIGHT - FLOOR_HEIGHT);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(83, 63, 36, 0.45)";
  context.lineWidth = 7;
  for (let x = -30; x < 238; x += 70) {
    context.beginPath();
    context.moveTo(x, GAME_HEIGHT - FLOOR_HEIGHT);
    context.lineTo(x + 150, 122);
    context.stroke();
  }
  for (let x = GAME_WIDTH + 30; x > GAME_WIDTH - 238; x -= 70) {
    context.beginPath();
    context.moveTo(x, GAME_HEIGHT - FLOOR_HEIGHT);
    context.lineTo(x - 150, 122);
    context.stroke();
  }

  context.strokeStyle = "rgba(210, 151, 55, 0.72)";
  context.lineWidth = 5;
  for (let y = 166; y < GAME_HEIGHT - 70; y += 64) {
    context.beginPath();
    context.moveTo(0, y + 30);
    context.lineTo(232, y);
    context.stroke();
    context.beginPath();
    context.moveTo(GAME_WIDTH, y + 30);
    context.lineTo(GAME_WIDTH - 232, y);
    context.stroke();
  }

  context.fillStyle = "rgba(46, 41, 34, 0.1)";
  for (let x = 54; x < GAME_WIDTH; x += 138) {
    context.fillRect(x, 0, 7, GAME_HEIGHT - FLOOR_HEIGHT);
  }

  context.strokeStyle = "rgba(74, 66, 54, 0.16)";
  context.lineWidth = 2;
  for (let y = 76; y < GAME_HEIGHT - FLOOR_HEIGHT; y += 82) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(GAME_WIDTH, y);
    context.stroke();
  }

  const floorGradient = context.createLinearGradient(
    0,
    GAME_HEIGHT - 152,
    0,
    GAME_HEIGHT,
  );
  floorGradient.addColorStop(0, "#8f8069");
  floorGradient.addColorStop(1, "#443c31");
  context.fillStyle = floorGradient;
  context.fillRect(0, GAME_HEIGHT - 154, GAME_WIDTH, 154);

  context.fillStyle = "rgba(255, 232, 157, 0.68)";
  for (let x = -24; x < GAME_WIDTH; x += 92) {
    context.fillRect(x, GAME_HEIGHT - 21, 42, 4);
  }

  context.strokeStyle = "rgba(27, 25, 21, 0.2)";
  context.lineWidth = 1;
  for (let x = -GAME_WIDTH; x < GAME_WIDTH * 2; x += 72) {
    context.beginPath();
    context.moveTo(x, GAME_HEIGHT - FLOOR_HEIGHT);
    context.lineTo(x + 180, GAME_HEIGHT);
    context.stroke();
  }

  context.strokeStyle = "rgba(245, 216, 139, 0.42)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(388, GAME_HEIGHT - FLOOR_HEIGHT);
  context.lineTo(292, GAME_HEIGHT);
  context.stroke();
  context.beginPath();
  context.moveTo(572, GAME_HEIGHT - FLOOR_HEIGHT);
  context.lineTo(668, GAME_HEIGHT);
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
) {
  context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawWarehouseBackground(context);

  obstacles.forEach((obstacle) => {
    drawObstacleSegment(context, obstacle, 0, obstacle.gapY);
    drawObstacleSegment(
      context,
      obstacle,
      obstacle.gapY + obstacle.gapHeight,
      GAME_HEIGHT - FLOOR_HEIGHT - (obstacle.gapY + obstacle.gapHeight),
    );
  });

  drawForklift(context, forklift);
}

function getLeaderboardRowClass(index: number) {
  if (index === 0) {
    return "border-amber-400 bg-gradient-to-br from-amber-50 via-yellow-50 to-background shadow-[0_14px_34px_rgba(217,119,6,0.18)]";
  }

  if (index === 1) {
    return "border-slate-300 bg-slate-50";
  }

  if (index === 2) {
    return "border-orange-300 bg-orange-50";
  }

  return "border-border/70 bg-background";
}

function getLeaderboardRankClass(index: number) {
  if (index === 0) {
    return "border-amber-300 bg-amber-100 text-amber-950";
  }

  if (index === 1) {
    return "border-slate-300 bg-slate-100 text-slate-800";
  }

  if (index === 2) {
    return "border-orange-300 bg-orange-100 text-orange-950";
  }

  return "border-border bg-muted/60 text-muted-foreground";
}

function LeaderboardList({
  entries,
  status,
  error,
}: {
  entries: LeaderboardEntry[];
  status: AsyncStatus;
  error: string | null;
}) {
  if (status === "loading") {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-border bg-background/70 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-3 text-sm text-destructive">
        {error ?? "Unable to load leaderboard."}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-border bg-background/70 px-3 py-3 text-sm text-muted-foreground">
        No scores yet.
      </div>
    );
  }

  return (
    <ol className="max-h-80 space-y-1 overflow-auto pr-1">
      {entries.map((entry, index) => {
        const isChampion = index === 0;

        return (
          <li
            key={entry.id}
            className={`grid items-center gap-2 rounded-md border text-sm ${getLeaderboardRowClass(
              index,
            )} ${
              isChampion
                ? "grid-cols-[2.75rem_minmax(0,1fr)_auto] px-3 py-3"
                : "grid-cols-[2rem_minmax(0,1fr)_auto] px-2.5 py-1.5"
            }`}
          >
            <span
              className={`flex items-center justify-center rounded-full border font-bold ${getLeaderboardRankClass(
                index,
              )} ${isChampion ? "size-9 text-base" : "size-6 text-xs"}`}
            >
              {isChampion ? <Crown className="size-4" /> : index + 1}
            </span>
            <span className="min-w-0">
              {isChampion ? (
                <span className="mb-0.5 block text-[0.65rem] font-black uppercase tracking-[0.16em] text-amber-700">
                  Current top spot
                </span>
              ) : null}
              <span
                className={`block truncate text-foreground ${
                  isChampion ? "text-base font-black" : "font-medium"
                }`}
              >
                {entry.playerName}
              </span>
            </span>
            <span
              className={`rounded-md font-bold tabular-nums text-foreground ${
                isChampion
                  ? "border border-amber-300 bg-amber-100 px-2.5 py-1 text-base shadow-sm"
                  : "bg-muted/70 px-2 py-0.5"
              }`}
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
            Click
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
  const [dailyLeaderboard, setDailyLeaderboard] = useState<LeaderboardEntry[]>(
    [],
  );
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

      setDailyLeaderboard(leaderboards.daily);
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

      if (!player || scoreToSave <= 0 || scoreSavedRef.current) {
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
      if (!lastObstacle || lastObstacle.x < GAME_WIDTH - OBSTACLE_SPACING) {
        obstacles.push(createObstacle(GAME_WIDTH + 40));
      }

      drawGame(context, forklift, obstacles);

      if (hasCollision(forklift, obstacles)) {
        endGame();
        return;
      }

      frameRef.current = requestAnimationFrame(animateRef.current);
    };
  }, [endGame]);

  const resetGameState = useCallback(() => {
    forkliftRef.current = createForklift();
    obstaclesRef.current = [
      createObstacle(GAME_WIDTH + 120),
      createObstacle(GAME_WIDTH + 120 + OBSTACLE_SPACING),
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
      canvas.width = Math.floor(rect.width * scale);
      canvas.height = Math.floor(rect.height * scale);

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.setTransform(
        (rect.width * scale) / GAME_WIDTH,
        0,
        0,
        (rect.height * scale) / GAME_HEIGHT,
        0,
        0,
      );
      drawGame(context, forkliftRef.current, obstaclesRef.current);
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    resizeCanvas();

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      if (
        screenRef.current === "playing" ||
        screenRef.current === "countdown"
      ) {
        event.preventDefault();
      }

      if (screenRef.current === "playing") {
        flap();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flap]);

  useEffect(() => {
    return () => {
      stopLoop();
      clearCountdownTimer();
    };
  }, [clearCountdownTimer, stopLoop]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <section className="relative h-full w-full overflow-hidden bg-card">
        <canvas
          ref={canvasRef}
          aria-label="Combi Control game canvas"
          className="block h-full w-full touch-none select-none bg-muted"
          onMouseDown={flap}
          onTouchStart={(event) => {
            event.preventDefault();
            flap();
          }}
        />

        {screen === "countdown" || screen === "playing" ? (
          <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              {selectedPlayer ? (
                <div className="min-w-32 max-w-[42vw] rounded-md bg-background/78 px-3 py-2 text-center shadow-sm backdrop-blur-sm sm:max-w-xs">
                  <div className="text-[0.68rem] font-black uppercase leading-none tracking-wide text-muted-foreground">
                    Player
                  </div>
                  <div className="mx-auto my-1.5 h-px w-full bg-border/80" />
                  <div className="truncate text-base font-black leading-none text-foreground sm:text-lg">
                    {selectedPlayer.name}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="min-w-28 rounded-md bg-background/78 px-3 py-2 text-center shadow-sm backdrop-blur-sm">
              <div className="text-[0.68rem] font-black uppercase leading-none tracking-wide text-amber-900">
                Aisles Cleared
              </div>
              <div className="mx-auto my-1.5 h-px w-full bg-amber-300/80" />
              <div className="text-4xl font-black leading-none tabular-nums text-amber-950 sm:text-5xl">
                {score}
              </div>
            </div>
          </header>
        ) : null}

        {screen === "start" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/62 px-4 py-4 backdrop-blur-[3px]">
            <div className="grid max-h-[calc(100vh-2rem)] w-full max-w-5xl gap-4 overflow-auto md:grid-cols-[minmax(0,25rem)_minmax(18rem,1fr)] md:items-start">
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
                        <div className="space-y-3 rounded-md border border-dashed border-border bg-background px-4 py-4">
                          <p className="text-sm text-muted-foreground">
                            No matching player.
                          </p>
                          <Button
                            type="button"
                            className="w-full"
                            onClick={startGame}
                            disabled={playerActionStatus === "loading"}
                          >
                            {playerActionStatus === "loading" ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Plus className="size-4" />
                            )}
                            Create &quot;{playerSearchTerm.trim()}&quot; and
                            Start
                          </Button>
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

        {screen === "gameOver" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/62 px-4 py-4 backdrop-blur-[3px]">
            <div className="grid max-h-[calc(100vh-2rem)] w-full max-w-6xl gap-4 overflow-auto lg:grid-cols-[minmax(0,1fr)_23rem]">
              <div className="relative flex min-h-128 flex-col overflow-hidden rounded-md border border-destructive/25 bg-card/95 p-5 text-center shadow-2xl sm:p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-destructive/75" />
                <div className="grid gap-5">
                  <div className="px-1 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Player
                    </p>
                    <p className="mt-1 truncate text-xl font-bold text-sky-700 sm:text-2xl">
                      {selectedPlayer?.name ?? "No player selected"}
                    </p>
                  </div>
                  <div className="mx-auto w-full max-w-sm border-y border-border px-5 py-4 text-center">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
                      Final Score
                    </p>
                    <p className="mt-2 text-6xl font-black leading-none tabular-nums text-foreground sm:text-7xl">
                      {finalScore}
                    </p>
                  </div>
                </div>

                <div className="flex flex-1 items-center justify-center py-5">
                  <div>
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-destructive">
                      Game Over
                    </p>
                    <h2
                      className="mx-auto mt-3 max-w-2xl text-balance text-2xl font-bold leading-snug tracking-normal text-foreground sm:text-3xl lg:text-4xl"
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
                  <Button onClick={startGame}>
                    <RotateCcw className="size-4" />
                    Play Again
                  </Button>
                  <Button variant="outline" onClick={backToStart}>
                    <ArrowLeft className="size-4" />
                    Back to Main Menu
                  </Button>
                </div>
              </div>

              <section className="relative rounded-md border border-border bg-card/95 p-4 shadow-2xl">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-amber-300" />
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
                      Rankings
                    </p>
                    <h3 className="text-xl font-black tracking-normal text-foreground">
                      Leaderboard
                    </h3>
                  </div>
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                    Top 20
                  </span>
                </div>
                <div className="space-y-5">
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      Today
                    </h4>
                    <LeaderboardList
                      entries={dailyLeaderboard}
                      status={leaderboardStatus}
                      error={leaderboardError}
                    />
                  </section>
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      All Time
                    </h4>
                    <LeaderboardList
                      entries={allTimeLeaderboard}
                      status={leaderboardStatus}
                      error={leaderboardError}
                    />
                  </section>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
