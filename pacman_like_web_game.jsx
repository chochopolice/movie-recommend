import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RotateCcw, Play, Pause, Trophy, Ghost, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

const CELL = 28;
const TICK_MS = 180;

const RAW_MAP = [
  "###############",
  "#........#....#",
  "#.###.##.#.##.#",
  "#o#........#o.#",
  "#.#.#####.#.#.#",
  "#.#...#...#.#.#",
  "#..##.#.##....#",
  "###...G...###.#",
  "#....##.##....#",
  "#.#...P...#.#.#",
  "#.#.#####.#.#.#",
  "#o..........o.#",
  "#.##.#.#.#.##.#",
  "#....#...#....#",
  "###############",
];

const DIRS = {
  ArrowUp: { x: 0, y: -1, name: "up" },
  ArrowDown: { x: 0, y: 1, name: "down" },
  ArrowLeft: { x: -1, y: 0, name: "left" },
  ArrowRight: { x: 1, y: 0, name: "right" },
};

function cloneMap(map) {
  return map.map((row) => row.split(""));
}

function findChar(grid, char) {
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] === char) return { x, y };
    }
  }
  return { x: 1, y: 1 };
}

function countDots(grid) {
  let total = 0;
  grid.forEach((row) => row.forEach((cell) => {
    if (cell === "." || cell === "o") total += 1;
  }));
  return total;
}

function isWall(grid, x, y) {
  return grid[y]?.[x] === "#";
}

function randomGhostStep(grid, ghost, pacman) {
  const choices = Object.values(DIRS)
    .map((dir) => ({ ...dir, x2: ghost.x + dir.x, y2: ghost.y + dir.y }))
    .filter((dir) => !isWall(grid, dir.x2, dir.y2));

  if (!choices.length) return ghost;

  const towardPacman = [...choices].sort((a, b) => {
    const da = Math.abs(a.x2 - pacman.x) + Math.abs(a.y2 - pacman.y);
    const db = Math.abs(b.x2 - pacman.x) + Math.abs(b.y2 - pacman.y);
    return da - db;
  });

  const chosen = Math.random() < 0.7 ? towardPacman[0] : choices[Math.floor(Math.random() * choices.length)];
  return { x: chosen.x2, y: chosen.y2, dir: chosen.name };
}

function getInitialState() {
  const grid = cloneMap(RAW_MAP);
  const pacman = findChar(grid, "P");
  const ghostStart = findChar(grid, "G");

  grid[pacman.y][pacman.x] = " ";
  grid[ghostStart.y][ghostStart.x] = " ";

  return {
    grid,
    pacman: { ...pacman, dir: "left" },
    ghost: { ...ghostStart, dir: "left" },
    score: 0,
    lives: 3,
    remainingDots: countDots(grid),
    running: false,
    status: "Press Start",
    poweredTicks: 0,
    gameOver: false,
    win: false,
  };
}

function Mouth({ dir }) {
  const rotation = {
    right: "rotate(0deg)",
    left: "rotate(180deg)",
    up: "rotate(270deg)",
    down: "rotate(90deg)",
  }[dir] || "rotate(0deg)";

  return (
    <motion.div
      animate={{ scale: [1, 0.92, 1] }}
      transition={{ duration: 0.45, repeat: Infinity, ease: "easeInOut" }}
      className="relative h-5 w-5"
      style={{ transform: rotation }}
    >
      <div
        className="absolute inset-0 rounded-full bg-yellow-300"
        style={{ clipPath: "polygon(100% 50%, 0% 0%, 0% 100%)" }}
      />
      <div className="absolute left-0 top-0 h-5 w-5 rounded-full bg-yellow-300" />
      <div className="absolute right-0 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-slate-900" />
    </motion.div>
  );
}

function GhostSprite({ scared }) {
  return (
    <motion.div
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
      className={`relative h-5 w-5 ${scared ? "text-cyan-300" : "text-pink-400"}`}
    >
      <Ghost className="h-5 w-5" />
    </motion.div>
  );
}

export default function PacmanLikeWebGame() {
  const [state, setState] = useState(getInitialState);
  const [nextDir, setNextDir] = useState("left");
  const intervalRef = useRef(null);

  const totalDots = useMemo(() => countDots(cloneMap(RAW_MAP).map((row) => row.map((c) => (c === "P" || c === "G" ? " " : c)))), []);

  const resetGame = useCallback(() => {
    setState(getInitialState());
    setNextDir("left");
  }, []);

  const movePlayer = useCallback((prev) => {
    const grid = prev.grid.map((row) => [...row]);
    let pacman = { ...prev.pacman };
    let ghost = { ...prev.ghost };
    let score = prev.score;
    let lives = prev.lives;
    let remainingDots = prev.remainingDots;
    let poweredTicks = Math.max(0, prev.poweredTicks - 1);
    let running = prev.running;
    let status = prev.status;
    let gameOver = prev.gameOver;
    let win = prev.win;

    const desired = Object.values(DIRS).find((d) => d.name === nextDir);
    if (desired && !isWall(grid, pacman.x + desired.x, pacman.y + desired.y)) {
      pacman.dir = desired.name;
    }

    const current = Object.values(DIRS).find((d) => d.name === pacman.dir) || DIRS.ArrowLeft;
    const px = pacman.x + current.x;
    const py = pacman.y + current.y;

    if (!isWall(grid, px, py)) {
      pacman.x = px;
      pacman.y = py;
    }

    const tile = grid[pacman.y][pacman.x];
    if (tile === ".") {
      grid[pacman.y][pacman.x] = " ";
      score += 10;
      remainingDots -= 1;
    } else if (tile === "o") {
      grid[pacman.y][pacman.x] = " ";
      score += 50;
      remainingDots -= 1;
      poweredTicks = 24;
      status = "Power mode! Ghost is scared";
    }

    ghost = randomGhostStep(grid, ghost, pacman);

    if (ghost.x === pacman.x && ghost.y === pacman.y) {
      if (poweredTicks > 0) {
        score += 200;
        const restart = findChar(cloneMap(RAW_MAP), "G");
        ghost = { ...restart, dir: "left" };
        status = "Ghost eaten!";
      } else {
        lives -= 1;
        if (lives <= 0) {
          running = false;
          gameOver = true;
          status = "Game Over";
        } else {
          const fresh = getInitialState();
          pacman = { ...fresh.pacman, dir: pacman.dir };
          ghost = { ...fresh.ghost, dir: "left" };
          status = `Ouch! Lives left: ${lives}`;
        }
      }
    }

    if (remainingDots <= 0) {
      running = false;
      win = true;
      status = "Stage Clear!";
    } else if (!gameOver && poweredTicks === 0 && status === "Power mode! Ghost is scared") {
      status = "Keep going";
    }

    return {
      ...prev,
      grid,
      pacman,
      ghost,
      score,
      lives,
      remainingDots,
      poweredTicks,
      running,
      status,
      gameOver,
      win,
    };
  }, [nextDir]);

  useEffect(() => {
    function onKeyDown(e) {
      if (DIRS[e.key]) {
        e.preventDefault();
        setNextDir(DIRS[e.key].name);
      }
      if (e.key === " ") {
        e.preventDefault();
        setState((prev) => ({
          ...prev,
          running: prev.gameOver || prev.win ? false : !prev.running,
          status: prev.gameOver ? "Reset to play again" : prev.win ? "Reset to play again" : prev.running ? "Paused" : "Playing",
        }));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (state.running && !state.gameOver && !state.win) {
      intervalRef.current = setInterval(() => {
        setState((prev) => movePlayer(prev));
      }, TICK_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.running, state.gameOver, state.win, movePlayer]);

  const progress = Math.round(((totalDots - state.remainingDots) / totalDots) * 100);

  const moveByButton = (dir) => setNextDir(dir);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 text-white">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[380px_1fr]">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-3xl border-slate-800 bg-slate-900/80 shadow-2xl backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-2xl font-bold">
                <span>Pac-Man風 Webゲーム</span>
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  オリジナル試作
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-800 p-4">
                  <div className="mb-1 text-xs text-slate-400">Score</div>
                  <div className="text-2xl font-bold">{state.score}</div>
                </div>
                <div className="rounded-2xl bg-slate-800 p-4">
                  <div className="mb-1 text-xs text-slate-400">Lives</div>
                  <div className="text-2xl font-bold">{state.lives}</div>
                </div>
                <div className="rounded-2xl bg-slate-800 p-4">
                  <div className="mb-1 text-xs text-slate-400">Dots</div>
                  <div className="text-2xl font-bold">{state.remainingDots}</div>
                </div>
              </div>

              <div className="space-y-2 rounded-2xl bg-slate-800 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">進行度</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-3" />
              </div>

              <div className="rounded-2xl bg-slate-800 p-4 text-sm text-slate-200">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <Trophy className="h-4 w-4" />
                  状態
                </div>
                <div>{state.status}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setState((prev) => ({
                    ...prev,
                    running: prev.gameOver || prev.win ? false : !prev.running,
                    status: prev.gameOver ? "Reset to play again" : prev.win ? "Reset to play again" : prev.running ? "Paused" : "Playing",
                  }))}
                  className="rounded-2xl"
                >
                  {state.running ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                  {state.running ? "Pause" : "Start"}
                </Button>
                <Button onClick={resetGame} variant="secondary" className="rounded-2xl">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              </div>

              <div className="rounded-2xl bg-slate-800 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-200">操作</div>
                <div className="mb-3 text-sm text-slate-400">矢印キー、または下のボタンで方向指定。スペースで一時停止。</div>
                <div className="mx-auto flex w-fit flex-col items-center gap-2">
                  <Button size="icon" variant="secondary" className="rounded-2xl" onClick={() => moveByButton("up")}>
                    <ChevronUp className="h-5 w-5" />
                  </Button>
                  <div className="flex gap-2">
                    <Button size="icon" variant="secondary" className="rounded-2xl" onClick={() => moveByButton("left")}>
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button size="icon" variant="secondary" className="rounded-2xl" onClick={() => moveByButton("down")}>
                      <ChevronDown className="h-5 w-5" />
                    </Button>
                    <Button size="icon" variant="secondary" className="rounded-2xl" onClick={() => moveByButton("right")}>
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-800/70 p-4 text-sm leading-6 text-slate-300">
                青い大玉を取ると短時間だけおばけを食べられます。壁・ドット・追尾ゴースト・スコア管理まで入れてあるので、ここから本格拡張しやすい構成です。
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="overflow-hidden rounded-3xl border-slate-800 bg-slate-900/80 shadow-2xl backdrop-blur">
            <CardContent className="p-4">
              <div
                className="mx-auto grid rounded-3xl border border-slate-800 bg-slate-950 p-3 shadow-inner"
                style={{
                  gridTemplateColumns: `repeat(${state.grid[0].length}, ${CELL}px)`,
                  width: state.grid[0].length * CELL + 24,
                }}
              >
                {state.grid.map((row, y) =>
                  row.map((cell, x) => {
                    const isPacman = state.pacman.x === x && state.pacman.y === y;
                    const isGhost = state.ghost.x === x && state.ghost.y === y;
                    const scared = state.poweredTicks > 0;

                    return (
                      <div
                        key={`${x}-${y}`}
                        className={`relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-md ${
                          cell === "#" ? "bg-blue-700/90 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.08)]" : "bg-slate-950"
                        }`}
                      >
                        {!isPacman && !isGhost && cell === "." && <div className="h-2 w-2 rounded-full bg-yellow-100" />}
                        {!isPacman && !isGhost && cell === "o" && (
                          <motion.div
                            animate={{ scale: [1, 1.25, 1] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                            className="h-4 w-4 rounded-full bg-cyan-300"
                          />
                        )}
                        {isPacman && <Mouth dir={state.pacman.dir} />}
                        {isGhost && <GhostSprite scared={scared} />}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
