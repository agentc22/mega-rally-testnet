"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type GameStatus = "ready" | "running" | "crashed";

// Auto-run: the game should start moving/spawning obstacles as soon as an attempt is active.
// The player still needs to tap/hold to jump/slide.

export type DashFeedback = "perfect" | "near";

export function FluffleDash({
  active,
  onDistance,
  onCrash,
  entrySeedBase,
  attemptNumber,
  onCombo,
  onFeedback,
}: {
  active: boolean;
  onDistance: (delta: number) => void;
  onCrash?: () => void;
  /**
   * Deterministic, transparent seed base for *this entry* (one set of 3 attempts).
   * Must vary per-entry to prevent memorization/grind advantage in time-limited tournaments.
   * Example: `${chainId}:${contractAddress}:${tournamentIdOrRoundId}:${playerAddress}:${entryNonce}`
   */
  entrySeedBase?: string;
  /** 1-based attempt number within the entry (used to vary patterns between attempts). */
  attemptNumber?: number;
  onCombo?: (combo: number) => void;
  onFeedback?: (f: DashFeedback) => void;
}) {
  // Keep latest callbacks without restarting the game loop on every parent re-render.
  const onDistanceRef = useRef(onDistance);
  const onCrashRef = useRef(onCrash);
  const onComboRef = useRef(onCombo);
  const onFeedbackRef = useRef(onFeedback);
  useEffect(() => {
    onDistanceRef.current = onDistance;
  }, [onDistance]);
  useEffect(() => {
    onCrashRef.current = onCrash;
  }, [onCrash]);
  useEffect(() => {
    onComboRef.current = onCombo;
  }, [onCombo]);
  useEffect(() => {
    onFeedbackRef.current = onFeedback;
  }, [onFeedback]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<GameStatus>("ready");
  const statusRef = useRef<GameStatus>("ready");
  const [runDistance, setRunDistance] = useState(0);
  const runDistanceRef = useRef(0);

  // Hidden debug overlay toggle (for mobile troubleshooting)
  const [debug, setDebug] = useState(false);
  const debugRef = useRef(false);
  useEffect(() => {
    debugRef.current = debug;
  }, [debug]);

  // world state
  const runner = useRef({ y: 0, vy: 0, slidingUntil: 0, dashingUntil: 0 });
  const obstacles = useRef<
    { x: number; w: number; h: number; kind: "low" | "high"; skin: string; passed?: boolean }[]
  >([]);

  // Track obstacles passed for difficulty progression.
  const obstaclesPassedRef = useRef(0);

  // Fun hook: combo for consecutive passes.
  const comboRef = useRef(0);

  // Fun hook: jump forgiveness.
  const lastGroundedMsRef = useRef<number>(0);
  const jumpBufferedUntilMsRef = useRef<number>(0);

  const crashSentRef = useRef(false);

  // Deterministic spawn RNG: patterns repeat for a given (tournamentSeed, attemptNumber).
  const rngStateRef = useRef(0x12345678);

  const hash32 = (s: string) => {
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h | 0;
  };

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const smoothstep01 = (t: number) => {
    const x = clamp01(t);
    return x * x * (3 - 2 * x);
  };

  // Piecewise difficulty ramp based on obstacles passed.
  // Targets:
  // - newbies: survive ~5–10 obstacles
  // - average: 20–25
  // - strong humans: 80+
  const difficultyT01 = (passed: number) => {
    // Quicker early ramp so the first 5–10 obstacles aren't "free".
    // Easy: 0–8 obstacles (0.0 → 0.30)
    if (passed <= 8) return 0.3 * smoothstep01(passed / 8);
    // Moderate: 8–24 obstacles (0.30 → 0.65)
    if (passed <= 24) return lerp(0.3, 0.65, smoothstep01((passed - 8) / 16));
    // Hard: 24–70 obstacles (0.65 → 1.0)
    if (passed <= 70) return lerp(0.65, 1.0, smoothstep01((passed - 24) / 46));
    return 1;
  };

  // xorshift32
  const rand01 = () => {
    let x = rngStateRef.current | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    rngStateRef.current = x | 0;
    // uint32 -> [0,1)
    return ((x >>> 0) & 0xffffffff) / 4294967296;
  };

  const cfg = useMemo(
    () => ({
      // ---- Tweak everything from this one object ----
      gravity: 2400, // px/s^2
      jumpVy: -820,

      // Difficulty curve is driven primarily by obstacles PASSED.
      // This avoids big spikes due to spawn jitter or canvas size differences.
      difficulty: {
        // Runner/world speed (px/s)
        speed: {
          start: 280,
          end: 520,
          maxDashBonus: 80,
        },

        // Obstacle spacing in pixels between spawns (larger = fewer obstacles)
        // We add a small deterministic jitter to avoid a metronome feel.
        spawnGapPx: {
          start: 520, // easy: still generous, but not sleepy
          end: 190, // hard: noticeably tighter
          min: 175,
          jitterFrac: 0.18, // +/-18% deterministic jitter
        },

        // Collision forgiveness: shrink runner hitbox by this many px (per side).
        // Early game is slightly forgiving, but not "auto-pass".
        hitboxPadPx: {
          start: 8,
          end: 2,
        },

        // Slightly reduce tall obstacles early to make slide timing learnable.
        highObstacleHeight: {
          start: 40,
          end: 52,
        },

        // Obstacle mix: start mostly "low", ramp toward more "high" a bit earlier.
        highObstacleChance: {
          start: 0.18,
          end: 0.48,
        },
      },

      obstacleW: 34,
      runnerX: 82,
      runnerW: 22,
      runnerH: 34,
      runnerSlideH: 18,
      groundPad: 24,
      slideMs: 420,
      dashMs: 220,
      holdToSlideMs: 180,

      // Input forgiveness (low-risk fun hooks)
      coyoteMs: 90,
      jumpBufferMs: 110,

      // Force a grace period at the start of each run.
      // (Distance-based, so it scales naturally with speed.)
      startGraceDistancePx: 520,
    }),
    []
  );

  function resetRun() {
    runner.current = { y: 0, vy: 0, slidingUntil: 0, dashingUntil: 0 };
    obstacles.current = [];
    obstaclesPassedRef.current = 0;
    runDistanceRef.current = 0;
    setRunDistance(0);
    crashSentRef.current = false;

    comboRef.current = 0;
    onComboRef.current?.(0);

    const seedKey = `${entrySeedBase ?? "local"}|${attemptNumber ?? 1}`;
    rngStateRef.current = hash32(seedKey);

    const nowMs = performance.now();
    lastGroundedMsRef.current = nowMs;
    jumpBufferedUntilMsRef.current = 0;

    statusRef.current = "ready";
    setStatus("ready");
  }

  // Start moving/spawning immediately when an attempt becomes active.
  useEffect(() => {
    if (!active) {
      resetRun();
      return;
    }
    resetRun();
    statusRef.current = "running";
    setStatus("running");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, entrySeedBase, attemptNumber]);

  function startIfNeeded() {
    if (!active) return;
    if (statusRef.current === "ready") {
      statusRef.current = "running";
      setStatus("running");
    }
  }

  const canJumpNow = (nowMs: number, groundY: number) => {
    const onGround = Math.abs(runner.current.y - groundY) < 0.01;
    if (onGround) return true;
    return nowMs - lastGroundedMsRef.current <= cfg.coyoteMs;
  };

  const tryConsumeBufferedJump = (nowMs: number, groundY: number) => {
    if (jumpBufferedUntilMsRef.current <= nowMs) return false;
    if (!canJumpNow(nowMs, groundY)) return false;
    runner.current.vy = cfg.jumpVy;
    jumpBufferedUntilMsRef.current = 0;
    return true;
  };

  function jump(nowMs: number) {
    if (!active) return;
    startIfNeeded();
    if (statusRef.current !== "running") return;

    const h = canvasRef.current?.clientHeight ?? 0;
    if (!h) return;
    const groundY = h - cfg.groundPad;

    // Jump buffer: register intent and consume when possible (grounded/coyote).
    jumpBufferedUntilMsRef.current = Math.max(jumpBufferedUntilMsRef.current, nowMs + cfg.jumpBufferMs);
    tryConsumeBufferedJump(nowMs, groundY);
  }

  function slideOrDash(nowMs: number) {
    if (!active) return;
    startIfNeeded();
    if (statusRef.current !== "running") return;

    // Hold = slide. If already sliding, treat as a small dash burst.
    if (nowMs < runner.current.slidingUntil) {
      runner.current.dashingUntil = nowMs + cfg.dashMs;
      return;
    }
    runner.current.slidingUntil = nowMs + cfg.slideMs;
  }

  // ---- Sprite loading (SVGs in /public/sprites) ----
  const spritesRef = useRef<Record<string, HTMLImageElement>>({});
  const [spritesTick, setSpritesTick] = useState(0);

  useEffect(() => {
    const load = (key: string, url: string) => {
      if (spritesRef.current[key]) return;
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = url;
      img.onload = () => setSpritesTick((t) => t + 1);
      spritesRef.current[key] = img;
    };

    // Prefer the statically-injected base path (GitHub Pages serves under /mega-rally-testnet/v/<id>/)
    // so sprite URLs work from any route.
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const u = (p: string) => new URL(`${basePath}${p}`, window.location.origin).toString();

    load("fluffle_run1", u("/sprites/fluffle_run1.svg"));
    load("fluffle_run2", u("/sprites/fluffle_run2.svg"));
    load("fluffle_slide", u("/sprites/fluffle_slide.svg"));
    load("ob_shard", u("/sprites/obstacle_shard.svg"));
    load("ob_drone", u("/sprites/obstacle_drone.svg"));
    load("ob_pylon", u("/sprites/obstacle_pylon.svg"));
    load("ob_tree", u("/sprites/obstacle_tree.svg"));
  }, []);

  useEffect(() => {
    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      statusRef.current = "ready";
      setStatus("ready");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();

    // Distance-based spawn scheduling (deterministic, with mild jitter).
    let nextSpawnAtDistance = cfg.startGraceDistancePx;

    // Throttle React state updates (mobile perf): keep true distance in a ref.
    let lastHudUpdate = performance.now();

    const resize = () => {
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // initialize runner on ground after first layout
      const groundY = height - cfg.groundPad;
      if (runner.current.y === 0) runner.current.y = groundY;
    };

    resize();
    window.addEventListener("resize", resize);

    // No time-based forced spawns; obstacle timing is distance-based for fairness.

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "d") setDebug((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const groundY = h - cfg.groundPad;

      // background (CRT-ish) with subtle dynamic grade
      const t01 = difficultyT01(obstaclesPassedRef.current);
      const bgTop = `rgba(${Math.round(7 + 10 * t01)},${Math.round(10 + 8 * t01)},${Math.round(22 + 28 * t01)},1)`;
      const bgBot = `rgba(7,10,18,1)`;
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, bgTop);
      bgGrad.addColorStop(1, bgBot);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // parallax skyline (deterministic-ish blocks)
      const skyY = Math.round(h * 0.18);
      const skylineH = Math.round(h * 0.34);
      const segW = 44;
      const scroll = (runDistanceRef.current * 0.06) % segW;
      for (let i = -2; i < Math.ceil(w / segW) + 2; i++) {
        // pseudo-random per segment using sine hash
        const id = Math.floor((runDistanceRef.current * 0.06) / segW) + i;
        const r = Math.abs(Math.sin(id * 999.13)) % 1;
        const bH = Math.round(40 + r * skylineH);
        const x = i * segW - scroll;
        const y = skyY + (skylineH - bH);
        ctx.fillStyle = "rgba(11,18,32,0.85)";
        ctx.fillRect(x, y, segW - 6, bH);

        // neon windows flicker
        const flick = 0.18 + 0.12 * Math.sin((runDistanceRef.current * 0.002) + id);
        ctx.fillStyle = `rgba(34,211,238,${Math.max(0, flick)})`;
        ctx.fillRect(x + 10, y + 14, 6, 2);
        ctx.fillStyle = `rgba(255,43,214,${Math.max(0, flick * 0.7)})`;
        ctx.fillRect(x + 22, y + 22, 8, 2);
      }

      // scanlines
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 1);
      }

      // neon horizon grid
      ctx.strokeStyle = "rgba(34,211,238,0.18)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x - (runDistanceRef.current * 0.6) % 28, groundY);
        ctx.lineTo(x - (runDistanceRef.current * 0.6) % 28, h);
        ctx.stroke();
      }

      // ground
      const grad = ctx.createLinearGradient(0, groundY, 0, h);
      grad.addColorStop(0, "rgba(34,211,238,0.18)");
      grad.addColorStop(1, "rgba(0,0,0,0.0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, groundY, w, h - groundY);

      // obstacles (sprites; fall back to geometry if not loaded yet)
      for (const o of obstacles.current) {
        const y = groundY - o.h;

        const img = spritesRef.current[o.skin];

        if (img?.complete && img.naturalWidth > 0) {
          ctx.save();

          if (o.kind === "low") {
            // low obstacles sit on the ground
            ctx.drawImage(img, o.x - 10, y - 18, o.w + 20, o.h + 30);
          } else {
            // overhead obstacles hang above their hitbox a bit
            const extra = Math.max(24, Math.round(o.h * 0.6));
            ctx.drawImage(img, o.x - 22, y - extra, o.w + 44, o.h + extra + 30);
          }

          ctx.restore();
          continue;
        }

        // fallback shapes
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.75)";

        if (o.kind === "low") {
          const spikes = 4;
          const step = o.w / spikes;
          ctx.beginPath();
          ctx.moveTo(o.x, groundY);
          for (let i = 0; i < spikes; i++) {
            const sx = o.x + i * step;
            ctx.lineTo(sx + step / 2, y);
            ctx.lineTo(sx + step, groundY);
          }
          ctx.closePath();

          ctx.fillStyle = "#fbbf24";
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = "#22d3ee";
          ctx.fillRect(o.x, y, o.w, o.h);
          ctx.strokeRect(o.x, y, o.w, o.h);
        }

        ctx.restore();
      }

      // runner (cyber fluffle sprite; fall back to old geometry)
      const nowMs = performance.now();
      const isSliding = nowMs < runner.current.slidingUntil;
      const isJumping = runner.current.y < groundY - 1;
      const rw = cfg.runnerW;
      const rh = isSliding ? cfg.runnerSlideH : cfg.runnerH;
      const rx = cfg.runnerX;
      const ry = runner.current.y - rh;

      const runFrame = Math.floor((runDistanceRef.current / 80) % 2);
      const spriteKey = isSliding ? "fluffle_slide" : runFrame === 0 ? "fluffle_run1" : "fluffle_run2";
      const img = spritesRef.current[spriteKey];

      if (img?.complete && img.naturalWidth > 0) {
        ctx.save();

        // Slight tilt while jumping for extra juice.
        if (isJumping) {
          ctx.translate(rx + rw / 2, ry + rh / 2);
          ctx.rotate(-0.12);
          ctx.translate(-(rx + rw / 2), -(ry + rh / 2));
        }

        if (isSliding) {
          // slide sprite is wider/flatter
          const sw = rw * 2.2;
          const sh = rh * 1.5;
          ctx.drawImage(img, rx - rw * 0.5, runner.current.y - sh + 2, sw, sh);
        } else {
          const sw = rw * 2.1;
          const sh = rh * 2.1;
          ctx.drawImage(img, rx - rw * 0.55, ry - rh * 0.65, sw, sh);
        }

        ctx.restore();
      } else {
        const cx = rx + rw / 2;
        const cy = ry + rh / 2;
        const r = Math.max(10, Math.min(rw, rh) / 2);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = "#ffd6ff";
        ctx.shadowColor = "rgba(255,43,214,0.75)";
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,43,214,0.95)";
        ctx.stroke();

        if (isSliding) {
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(rx - 10, runner.current.y - 2);
          ctx.lineTo(rx + rw + 18, runner.current.y - 2);
          ctx.stroke();
        }

        ctx.restore();
      }

      // debug hitboxes
      if (debugRef.current) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.65)";
        ctx.lineWidth = 1;
        // runner AABB
        ctx.strokeRect(rx, ry, rw, rh);
        // obstacle AABBs
        ctx.strokeStyle = "rgba(251,191,36,0.75)";
        for (const o of obstacles.current) {
          const oy = groundY - o.h;
          ctx.strokeRect(o.x, oy, o.w, o.h);
        }
        ctx.restore();
      }

      // text
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "600 14px ui-monospace, SFMono-Regular, Menlo, monospace";
      if (statusRef.current === "ready") {
        ctx.fillText("Tap to JUMP • hold to SLIDE", 14, 22);
      } else if (statusRef.current === "crashed") {
        ctx.fillText("CRASHED", 14, 22);
      }

      // debug overlay (in-canvas, always visible if toggled)
      if (debugRef.current) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(10, 10, 240, 74);
        ctx.strokeStyle = "rgba(34,211,238,0.7)";
        ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, 240, 74);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(`debug: ON (press 'd' to toggle)`, 16, 28);
        ctx.fillText(`obstacles: ${obstacles.current.length}`, 16, 44);
        ctx.fillText(`canvas: ${Math.round(w)}x${Math.round(h)} dpr:${Math.round(window.devicePixelRatio || 1)}`, 16, 60);
        ctx.fillText(`status: ${statusRef.current}`, 16, 76);
        ctx.restore();
      }

      // vignette
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    };

    const collide = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return false;
      const groundY = h - cfg.groundPad;

      const nowMs = performance.now();
      const isSliding = nowMs < runner.current.slidingUntil;
      const isDashing = nowMs < runner.current.dashingUntil;

      const rx = cfg.runnerX;
      const rw = cfg.runnerW;
      const rh = isSliding ? cfg.runnerSlideH : cfg.runnerH;
      const ry = runner.current.y - rh;

      const t = difficultyT01(obstaclesPassedRef.current);
      const padBase = lerp(cfg.difficulty.hitboxPadPx.start, cfg.difficulty.hitboxPadPx.end, t);
      // If dashing, be extra forgiving.
      const pad = Math.round(padBase + (isDashing ? 3 : 0));

      for (const o of obstacles.current) {
        const ox = o.x;
        const oy = groundY - o.h;
        const ow = o.w;
        const oh = o.h;

        const hit =
          rx + pad < ox + ow &&
          rx + rw - pad > ox &&
          ry + pad < oy + oh &&
          ry + rh - pad > oy;

        if (hit) return true;
      }
      return false;
    };

    const tick = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;

      if (statusRef.current === "running") {
        const t01 = difficultyT01(obstaclesPassedRef.current);
        const nowMs = performance.now();
        const isDashing = nowMs < runner.current.dashingUntil;
        const baseSpeed = lerp(cfg.difficulty.speed.start, cfg.difficulty.speed.end, t01);
        const speed = baseSpeed + (isDashing ? cfg.difficulty.speed.maxDashBonus : 0);

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const groundY = h - cfg.groundPad;

        // runner physics
        runner.current.vy += cfg.gravity * dt;
        runner.current.y += runner.current.vy * dt;
        if (runner.current.y > groundY) {
          runner.current.y = groundY;
          runner.current.vy = 0;
          lastGroundedMsRef.current = nowMs;
        } else if (Math.abs(runner.current.y - groundY) < 0.01) {
          lastGroundedMsRef.current = nowMs;
        }

        // Consume any buffered jump as soon as it becomes legal.
        tryConsumeBufferedJump(nowMs, groundY);

        // spawn obstacles (distance-based, deterministic)
        if (runDistanceRef.current >= nextSpawnAtDistance) {
          const highChance = lerp(
            cfg.difficulty.highObstacleChance.start,
            cfg.difficulty.highObstacleChance.end,
            t01
          );
          const kind: "low" | "high" = rand01() < 1 - highChance ? "low" : "high";
          const highH = Math.round(
            lerp(cfg.difficulty.highObstacleHeight.start, cfg.difficulty.highObstacleHeight.end, t01)
          );
          const hgt = kind === "low" ? 26 : highH;

          // Pick a visual skin per obstacle for variety (collision still uses kind/size).
          const lowSkins = ["ob_shard", "ob_pylon", "ob_tree"];
          const highSkins = ["ob_drone"]; // keep overhead readable for now
          const skins = kind === "low" ? lowSkins : highSkins;
          const skin = skins[Math.floor(rand01() * skins.length)] || (kind === "low" ? "ob_shard" : "ob_drone");

          obstacles.current.push({
            x: w + 40,
            w: cfg.obstacleW,
            h: hgt,
            kind,
            skin,
          });

          // schedule next spawn
          const baseGap = lerp(cfg.difficulty.spawnGapPx.start, cfg.difficulty.spawnGapPx.end, t01);
          const jitter = (rand01() * 2 - 1) * cfg.difficulty.spawnGapPx.jitterFrac; // [-j,+j]
          const gapPx = Math.max(cfg.difficulty.spawnGapPx.min, baseGap * (1 + jitter));
          nextSpawnAtDistance = runDistanceRef.current + gapPx;
        }

        // move obstacles
        for (const o of obstacles.current) o.x -= speed * dt;

        const isSlidingNow = nowMs < runner.current.slidingUntil;
        const rhNow = isSlidingNow ? cfg.runnerSlideH : cfg.runnerH;
        const ryNow = runner.current.y - rhNow;

        // count passed obstacles (for difficulty progression + combo)
        for (const o of obstacles.current) {
          if (!o.passed && o.x + o.w < cfg.runnerX) {
            o.passed = true;
            obstaclesPassedRef.current += 1;

            comboRef.current += 1;
            onComboRef.current?.(comboRef.current);

            // Basic near-miss/perfect feedback (low obstacles only; cheap + low-risk).
            if (o.kind === "low") {
              const oTop = groundY - o.h;
              const clearance = oTop - runner.current.y; // + => cleared above
              if (clearance >= 0 && clearance <= 3) onFeedbackRef.current?.("perfect");
              else if (clearance >= 0 && clearance <= 8) onFeedbackRef.current?.("near");
            } else {
              // If we later reposition high obstacles, we can add slide-based feedback here.
              void rhNow;
              void ryNow;
            }
          }
        }

        obstacles.current = obstacles.current.filter((o) => o.x > -o.w - 20);

        // distance
        const d = speed * dt;
        runDistanceRef.current += d;
        onDistanceRef.current(d / 10);

        // Throttle React updates (mobile Safari can choke on per-frame setState)
        if (t - lastHudUpdate > 250) {
          lastHudUpdate = t;
          setRunDistance(runDistanceRef.current);
        }

        // collision
        if (collide()) {
          statusRef.current = "crashed";
          setStatus("crashed");

          comboRef.current = 0;
          onComboRef.current?.(0);

          if (!crashSentRef.current) {
            crashSentRef.current = true;
            onCrashRef.current?.();
          }
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cfg]);

  // ---------- Input handling: tap jump, hold slide ----------
  const holdTimerRef = useRef<number | null>(null);
  const downAtRef = useRef<number>(0);
  const holdTriggeredRef = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  return (
    <div
      className="dash-root"
      style={{ position: "relative" }}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!active) return;
        if (statusRef.current === "crashed") return; // crash handled by parent overlay

        downAtRef.current = Date.now();
        holdTriggeredRef.current = false;
        clearHoldTimer();
        holdTimerRef.current = window.setTimeout(() => {
          holdTriggeredRef.current = true;
          slideOrDash(Date.now());
        }, cfg.holdToSlideMs);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        if (!active) return;
        clearHoldTimer();
        if (statusRef.current === "crashed") return;

        const dur = Date.now() - downAtRef.current;
        if (holdTriggeredRef.current || dur >= cfg.holdToSlideMs) {
          // slide already triggered
          return;
        }
        jump(Date.now());
      }}
      onPointerCancel={() => {
        clearHoldTimer();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Hidden debug toggle hotspot (top-left). Tap 5x quickly to toggle. */}
      <div
        style={{ position: "absolute", top: 0, left: 0, width: 42, height: 42, opacity: 0.01 }}
        onPointerDown={(e) => {
          e.preventDefault();
          // local tap counter via dataset
          const el = e.currentTarget as HTMLDivElement;
          const now = Date.now();
          const lastTap = Number(el.dataset.lastTap || 0);
          const taps = Number(el.dataset.taps || 0);
          const nextTaps = now - lastTap < 550 ? taps + 1 : 1;
          el.dataset.lastTap = String(now);
          el.dataset.taps = String(nextTaps);
          if (nextTaps >= 5) {
            el.dataset.taps = "0";
            setDebug((v) => !v);
          }
        }}
      />
      <canvas ref={canvasRef} className="dash-canvas" />
    </div>
  );
}
