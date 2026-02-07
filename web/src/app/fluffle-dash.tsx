"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type GameStatus = "ready" | "running" | "crashed";

export function FluffleDash({
  active,
  onDistance,
}: {
  active: boolean;
  onDistance: (delta: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<GameStatus>("ready");
  const statusRef = useRef<GameStatus>("ready");
  const [runDistance, setRunDistance] = useState(0);

  // simple physics (in "world" pixels)
  const bird = useRef({ y: 220, vy: 0 });
  const pipes = useRef<{ x: number; gapY: number; passed: boolean }[]>([]);

  const cfg = useMemo(
    () => ({
      gravity: 1600, // px/s^2
      flapVy: -520,
      speed: 220, // px/s
      pipeEvery: 1.35, // s
      pipeWidth: 60,
      gap: 140,
      birdX: 90,
      birdR: 14,
    }),
    []
  );

  function resetRun() {
    bird.current = { y: 220, vy: 0 };
    pipes.current = [];
    setRunDistance(0);
    statusRef.current = "ready";
    setStatus("ready");
  }

  function flap() {
    if (!active) return;
    if (statusRef.current === "ready") {
      statusRef.current = "running";
      setStatus("running");
    }
    if (statusRef.current === "crashed") {
      resetRun();
      statusRef.current = "running";
      setStatus("running");
    }
    bird.current.vy = cfg.flapVy;
  }

  useEffect(() => {
    if (!active) {
      // stop game loop when round isn't active
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
    let spawnAcc = 0;

    const resize = () => {
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // background
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, w, h);

      // subtle stars
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 24; i++) {
        const x = (i * 97 + runDistance * 3) % w;
        const y = (i * 53) % h;
        ctx.fillRect(x, y, 2, 2);
      }

      // pipes
      ctx.fillStyle = "#22c55e";
      for (const p of pipes.current) {
        const topH = p.gapY - cfg.gap / 2;
        const botY = p.gapY + cfg.gap / 2;
        const botH = h - botY;
        ctx.fillRect(p.x, 0, cfg.pipeWidth, topH);
        ctx.fillRect(p.x, botY, cfg.pipeWidth, botH);
      }

      // bird
      const b = bird.current;
      ctx.fillStyle = "#ff4d4d";
      ctx.beginPath();
      ctx.arc(cfg.birdX, b.y, cfg.birdR, 0, Math.PI * 2);
      ctx.fill();

      // ground
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, h - 20, w, 20);

      // status text
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "600 14px system-ui";
      if (statusRef.current === "ready") {
        ctx.fillText("Tap anywhere to flap", 14, 22);
      } else if (statusRef.current === "crashed") {
        ctx.fillText("Crashed — tap to restart", 14, 22);
      }
    };

    const collide = () => {
      const h = canvas.clientHeight;
      const b = bird.current;

      // bounds
      if (b.y - cfg.birdR < 0) return true;
      if (b.y + cfg.birdR > h - 20) return true;

      for (const p of pipes.current) {
        const withinX = cfg.birdX + cfg.birdR > p.x && cfg.birdX - cfg.birdR < p.x + cfg.pipeWidth;
        if (!withinX) continue;
        const topH = p.gapY - cfg.gap / 2;
        const botY = p.gapY + cfg.gap / 2;
        const hitTop = b.y - cfg.birdR < topH;
        const hitBot = b.y + cfg.birdR > botY;
        if (hitTop || hitBot) return true;
      }
      return false;
    };

    const tick = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;

      if (statusRef.current === "running") {
        // physics
        bird.current.vy += cfg.gravity * dt;
        bird.current.y += bird.current.vy * dt;

        // spawn
        spawnAcc += dt;
        if (spawnAcc >= cfg.pipeEvery) {
          spawnAcc = 0;
          const h = canvas.clientHeight;
          const margin = 60;
          const gapY = margin + Math.random() * (h - 20 - margin * 2);
          pipes.current.push({ x: canvas.clientWidth + 40, gapY, passed: false });
        }

        // move pipes
        for (const p of pipes.current) p.x -= cfg.speed * dt;
        pipes.current = pipes.current.filter((p) => p.x > -cfg.pipeWidth - 10);

        // distance (continuous)
        const d = cfg.speed * dt;
        setRunDistance((prev) => prev + d);
        onDistance(d / 10); // scale down to "meters" (tunable)

        // collision
        if (collide()) {
          statusRef.current = "crashed";
          setStatus("crashed");
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cfg, onDistance]);

  return (
    <div
      className="dash-root"
      onPointerDown={(e) => {
        // Prevent scroll/zoom gestures from stealing taps on mobile.
        e.preventDefault();
        flap();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="dash-canvas" />
    </div>
  );
}
