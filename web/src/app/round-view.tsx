"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWatchContractEvent,
  useWriteContract,
} from "wagmi";
import { formatEther, parseEther, type Address } from "viem";
import { MEGA_RALLY_ABI, MEGA_RALLY_ADDRESS } from "@/lib/contract";
import { ensureMegaethCarrotChain, MEGAETH_CARROT_CHAIN_ID } from "@/lib/megaeth-network";
import { FluffleDash, type DashFeedback } from "./fluffle-dash";

interface LeaderboardEntry {
  address: Address;
  score: bigint;
}

const MAX_ATTEMPTS = 3;

export function RoundView({ address, demo }: { address: Address; demo?: boolean }) {
  const isDemo = !!demo;

  const [roundId, setRoundId] = useState<bigint | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  // Round time is still enforced on-chain, but the HUD is attempt-based (no countdown shown).
  const [_timeLeft, _setTimeLeft] = useState(0);
  const [myScore, setMyScore] = useState(0n);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // simple mobile sanity check: button tap should cause immediate state change
  const [tapCount, setTapCount] = useState(0);

  // attempt UX (works for demo + onchain)
  const [attemptsUsedUI, setAttemptsUsedUI] = useState(0);
  const [attemptScoreUI, setAttemptScoreUI] = useState(0n);
  const [totalScoreUI, setTotalScoreUI] = useState(0n);

  // Live pending score while running (uncommitted distance buffer).
  // Stored as a float number so the HUD updates smoothly on mobile.
  const [livePendingScore, setLivePendingScore] = useState(0);
  const [attemptOver, setAttemptOver] = useState(false);
  const [endingAttempt, setEndingAttempt] = useState(false);

  // Fun hooks (HUD): combo + quick feedback.
  const [dashCombo, setDashCombo] = useState(0);
  const [dashFeedback, setDashFeedback] = useState<DashFeedback | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  // Per-entry index (on-chain). Seed base uses entryIndex so each paid retry produces a new obstacle pattern.
  const [entryIndexUI, setEntryIndexUI] = useState(0);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    };
  }, []);

  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();

  const onCorrectChain = isDemo || chainId === MEGAETH_CARROT_CHAIN_ID;

  // ---------------- Demo state ----------------
  const [demoJoined, setDemoJoined] = useState(false);
  const [demoRoundEndsAt, setDemoRoundEndsAt] = useState<number | null>(null);
  const [demoFinalized, setDemoFinalized] = useState(false);
  const [demoEntryFee] = useState(0.01);
  const [demoPool, setDemoPool] = useState(0);
  const [demoPlayers, setDemoPlayers] = useState<Address[]>([]);

  const [demoEntryIndex, setDemoEntryIndex] = useState(1);
  const [demoAttemptsUsed, setDemoAttemptsUsed] = useState(0);
  const [demoAttemptScore, setDemoAttemptScore] = useState(0n);
  const [demoTotalLocked, setDemoTotalLocked] = useState(0n);

  // seed demo state once
  useEffect(() => {
    if (!isDemo) return;
    if (demoRoundEndsAt !== null) return;
    const now = Math.floor(Date.now() / 1000);
    setRoundId(0n);
    setDemoRoundEndsAt(now + 120);
    setDemoPlayers([
      address,
      "0x000000000000000000000000000000000000dEaD" as Address,
      "0x000000000000000000000000000000000000bEEF" as Address,
    ]);
    setLeaderboard([
      { address, score: 0n },
      { address: "0x000000000000000000000000000000000000dEaD" as Address, score: 3n },
      { address: "0x000000000000000000000000000000000000bEEF" as Address, score: 1n },
    ]);
    setDemoPool(0.01 * 3);
    setDemoJoined(true);

    setDemoEntryIndex(1);
    setDemoAttemptsUsed(0);
    setDemoAttemptScore(0n);
    setDemoTotalLocked(0n);
    setAttemptOver(false);
    setMyScore(0n);
  }, [isDemo, demoRoundEndsAt, address]);

  // demo timer (drives re-renders so the round can naturally end; not shown in HUD)
  useEffect(() => {
    if (!isDemo || !demoRoundEndsAt) return;
    const tick = () => {
      const left = demoRoundEndsAt - Math.floor(Date.now() / 1000);
      _setTimeLeft(Math.max(0, left));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [isDemo, demoRoundEndsAt]);

  // demo bot activity
  useEffect(() => {
    if (!isDemo || demoFinalized) return;
    const iv = setInterval(() => {
      setLeaderboard((prev) => {
        const next = prev.map((e) => ({ ...e }));
        for (const e of next) {
          if (e.address.toLowerCase() === address.toLowerCase()) continue;
          if (Math.random() < 0.55) e.score = e.score + 1n;
        }
        next.sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : 0));
        return next;
      });
    }, 2500);
    return () => clearInterval(iv);
  }, [isDemo, demoFinalized, address]);

  // ---------------- Onchain round state ----------------
  const { data: nextId, refetch: refetchNextId } = useReadContract({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    functionName: "nextRoundId",
    query: { enabled: !isDemo && onCorrectChain },
  });

  useEffect(() => {
    if (isDemo) return;
    if (nextId !== undefined && nextId > 0n) setRoundId(nextId - 1n);
  }, [nextId, isDemo]);

  const { data: roundData, refetch: refetchRound } = useReadContract({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    functionName: "rounds",
    args: roundId !== null ? [roundId] : undefined,
    query: { enabled: !isDemo && onCorrectChain && roundId !== null },
  });

  const { data: hasJoined, refetch: refetchJoined } = useReadContract({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    functionName: "joined",
    args: roundId !== null ? [roundId, address] : undefined,
    query: { enabled: !isDemo && onCorrectChain && roundId !== null },
  });

  const { data: entryIndexOnchain, refetch: refetchEntryIndex } = useReadContract({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    functionName: "entryIndex",
    args: roundId !== null ? [roundId, address] : undefined,
    query: { enabled: !isDemo && onCorrectChain && roundId !== null },
  });

  const { data: attemptsUsedOnchain, refetch: refetchAttemptsUsed } = useReadContract({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    functionName: "attemptsUsed",
    args: roundId !== null ? [roundId, address] : undefined,
    query: { enabled: !isDemo && onCorrectChain && roundId !== null },
  });

  const { data: currentAttemptScoreOnchain, refetch: refetchAttemptScore } = useReadContract({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    functionName: "currentAttemptScore",
    args: roundId !== null ? [roundId, address] : undefined,
    query: { enabled: !isDemo && onCorrectChain && roundId !== null },
  });

  const { data: totalScoreOnchain, refetch: refetchTotalScore } = useReadContract({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    functionName: "totalScore",
    args: roundId !== null ? [roundId, address] : undefined,
    query: { enabled: !isDemo && onCorrectChain && roundId !== null },
  });

  const [creator, entryFee, startTime, endTime, pool, finalized, playerCount] =
    roundData ?? [undefined, 0n, 0n, 0n, 0n, false, 0n];

  const demoEnd = demoRoundEndsAt ? BigInt(demoRoundEndsAt) : 0n;
  const effectiveEndTime = isDemo ? demoEnd : (endTime ?? 0n);
  const effectiveFinalized = isDemo ? demoFinalized : (finalized ?? false);
  const effectiveEntryFee = isDemo ? parseEther(demoEntryFee.toString()) : (entryFee ?? 0n);
  const effectivePool = isDemo ? parseEther(demoPool.toString()) : (pool ?? 0n);
  const effectivePlayerCount = isDemo ? BigInt(demoPlayers.length) : (playerCount ?? 0n);
  const effectiveHasJoined = isDemo ? demoJoined : (hasJoined ?? false);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isActive = effectiveEndTime > 0n && now < effectiveEndTime && !effectiveFinalized;
  const isEnded = effectiveEndTime > 0n && now >= effectiveEndTime;

  // keep attempt UI in sync
  useEffect(() => {
    if (!isActive) {
      setAttemptOver(false);
      setEndingAttempt(false);
      return;
    }

    if (isDemo) {
      setEntryIndexUI(demoEntryIndex);
      setAttemptsUsedUI(demoAttemptsUsed);
      setAttemptScoreUI(demoAttemptScore);
      setTotalScoreUI(demoTotalLocked + demoAttemptScore);
    } else {
      setEntryIndexUI(Number(entryIndexOnchain ?? 0));
      setAttemptsUsedUI(Number(attemptsUsedOnchain ?? 0));
      setAttemptScoreUI((currentAttemptScoreOnchain ?? 0n) as bigint);
      setTotalScoreUI((totalScoreOnchain ?? 0n) as bigint);
    }
  }, [
    isActive,
    isDemo,
    demoEntryIndex,
    demoAttemptsUsed,
    demoAttemptScore,
    demoTotalLocked,
    entryIndexOnchain,
    attemptsUsedOnchain,
    currentAttemptScoreOnchain,
    totalScoreOnchain,
  ]);

  // Countdown timer (drives re-renders so the round can naturally end; not shown in HUD)
  useEffect(() => {
    if (isDemo) return;
    if (!endTime || endTime === 0n) return;
    const tick = () => {
      const left = Number(endTime) - Math.floor(Date.now() / 1000);
      _setTimeLeft(Math.max(0, left));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [endTime, isDemo]);

  const fetchLeaderboard = useCallback(async () => {
    if (isDemo) return;
    if (!onCorrectChain) return;
    if (roundId === null || !publicClient) return;
    try {
      const players = await publicClient.readContract({
        address: MEGA_RALLY_ADDRESS,
        abi: MEGA_RALLY_ABI,
        functionName: "getPlayers",
        args: [roundId],
      });
      const entries: LeaderboardEntry[] = await Promise.all(
        players.map(async (p) => {
          const score = await publicClient.readContract({
            address: MEGA_RALLY_ADDRESS,
            abi: MEGA_RALLY_ABI,
            functionName: "getScore",
            args: [roundId, p],
          });
          return { address: p, score };
        })
      );
      entries.sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : 0));
      setLeaderboard(entries);

      const me = entries.find((e) => e.address.toLowerCase() === address.toLowerCase());
      if (me) setMyScore(me.score);
    } catch {
      // ignore
    }
  }, [roundId, publicClient, address, isDemo, onCorrectChain]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    if (isDemo) return;
    if (!onCorrectChain) return;
    if (!isActive) return;
    const iv = setInterval(fetchLeaderboard, 3000);
    return () => clearInterval(iv);
  }, [isActive, fetchLeaderboard, isDemo, onCorrectChain]);

  useWatchContractEvent({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    eventName: "ActionsSubmitted",
    enabled: !isDemo && onCorrectChain,
    onLogs() {
      fetchLeaderboard();
      void refetchAttemptsUsed();
      void refetchAttemptScore();
      void refetchTotalScore();
    },
  });

  useWatchContractEvent({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    eventName: "EntryStarted",
    enabled: !isDemo && onCorrectChain,
    onLogs() {
      void refetchEntryIndex();
      void refetchAttemptsUsed();
      void refetchAttemptScore();
      void refetchTotalScore();
    },
  });

  useWatchContractEvent({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    eventName: "AttemptEnded",
    enabled: !isDemo && onCorrectChain,
    onLogs() {
      void refetchAttemptsUsed();
      void refetchAttemptScore();
      void refetchTotalScore();
      fetchLeaderboard();
    },
  });

  // ---------------- Batched commits ----------------
  const uncommittedRef = useRef(0); // float
  const inFlightRef = useRef<{ amount: number } | null>(null);
  const lastCommitAtRef = useRef(0);
  const lastHudPaintAtRef = useRef(0);

  const commitThreshold = 25; // "meters"
  const commitEveryMs = 3000;

  const canPlayAttempt =
    isActive &&
    effectiveHasJoined &&
    entryIndexUI > 0 &&
    !attemptOver &&
    attemptsUsedUI < MAX_ATTEMPTS &&
    !endingAttempt;

  // HUD update loop (~20x/sec) so ref-based score increments render smoothly.
  // Use rAF instead of setInterval (Mobile Safari can aggressively throttle intervals).
  useEffect(() => {
    if (!canPlayAttempt) {
      setLivePendingScore(0);
      return;
    }

    let raf = 0;
    let lastPaint = 0;

    const loop = (t: number) => {
      if (t - lastPaint >= 50) {
        lastPaint = t;
        setLivePendingScore(uncommittedRef.current);
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canPlayAttempt]);

  const tryCommit = useCallback(
    async (force?: boolean) => {
      if (!canPlayAttempt) return;

      if (isDemo) {
        const amt = Math.floor(uncommittedRef.current);
        if (amt <= 0) return;
        uncommittedRef.current -= amt;
        setDemoAttemptScore((s) => s + BigInt(amt));
        setLeaderboard((prev) => {
          const next = prev.map((e) => ({ ...e }));
          const i = next.findIndex((e) => e.address.toLowerCase() === address.toLowerCase());
          if (i >= 0) next[i].score = next[i].score + BigInt(amt);
          next.sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : 0));
          return next;
        });
        return;
      }

      if (!isActive) return;
      if (!effectiveHasJoined) return;
      if (roundId === null) return;
      if (inFlightRef.current) return;

      const nowMs = Date.now();
      const amt = Math.floor(uncommittedRef.current);
      if (amt <= 0) return;
      const since = nowMs - lastCommitAtRef.current;
      if (!force && amt < commitThreshold && since < commitEveryMs) return;

      // take amount and send
      uncommittedRef.current -= amt;
      inFlightRef.current = { amount: amt };
      lastCommitAtRef.current = nowMs;

      try {
        await writeContractAsync({
          address: MEGA_RALLY_ADDRESS,
          abi: MEGA_RALLY_ABI,
          functionName: "submitActions",
          args: [roundId, BigInt(amt)],
        });
        fetchLeaderboard();
        void refetchAttemptScore();
        void refetchTotalScore();
      } catch {
        // put distance back to retry later
        uncommittedRef.current += amt;
      } finally {
        inFlightRef.current = null;
      }
    },
    [
      canPlayAttempt,
      isDemo,
      isActive,
      effectiveHasJoined,
      roundId,
      writeContractAsync,
      fetchLeaderboard,
      address,
      refetchAttemptScore,
      refetchTotalScore,
    ]
  );

  const onDistance = useCallback(
    (delta: number) => {
      if (!canPlayAttempt) return;
      if (delta <= 0) return;
      uncommittedRef.current += delta;

      // Belt + suspenders: if rAF is throttled/paused, still repaint the HUD
      // at a reasonable rate so SCORE/TOTAL feel "live".
      const nowMs = Date.now();
      if (nowMs - lastHudPaintAtRef.current >= 50) {
        lastHudPaintAtRef.current = nowMs;
        setLivePendingScore(uncommittedRef.current);
      }

      void tryCommit();
    },
    [canPlayAttempt, tryCommit]
  );

  useEffect(() => {
    if (!canPlayAttempt) return;
    const iv = setInterval(() => {
      void tryCommit();
    }, 500);
    return () => clearInterval(iv);
  }, [canPlayAttempt, tryCommit]);

  // ---------------- Attempt ending ----------------
  const endAttempt = useCallback(async () => {
    if (!isActive) return;
    if (!effectiveHasJoined) return;
    if (endingAttempt) return;

    setEndingAttempt(true);
    try {
      // best-effort flush
      await tryCommit(true);

      if (isDemo) {
        setDemoTotalLocked((t) => t + demoAttemptScore + BigInt(Math.floor(uncommittedRef.current)));
        setDemoAttemptScore(0n);
        uncommittedRef.current = 0;
        setDemoAttemptsUsed((u) => Math.min(MAX_ATTEMPTS, u + 1));
      } else {
        if (roundId === null) return;
        await writeContractAsync({
          address: MEGA_RALLY_ADDRESS,
          abi: MEGA_RALLY_ABI,
          functionName: "endAttempt",
          args: [roundId],
        });
        void refetchAttemptsUsed();
        void refetchAttemptScore();
        void refetchTotalScore();
        fetchLeaderboard();
        uncommittedRef.current = 0;
      }
    } finally {
      setEndingAttempt(false);
    }
  }, [
    isActive,
    effectiveHasJoined,
    endingAttempt,
    tryCommit,
    isDemo,
    demoAttemptScore,
    roundId,
    writeContractAsync,
    refetchAttemptsUsed,
    refetchAttemptScore,
    refetchTotalScore,
    fetchLeaderboard,
  ]);

  const onCrash = useCallback(async () => {
    setAttemptOver(true);
    // lock in attempt score on-chain (or in demo)
    try {
      await endAttempt();
    } catch {
      // keep overlay; user can retry
    }
  }, [endAttempt]);

  // ---------------- Actions ----------------
  async function handleCreateRound() {
    setTapCount((c) => c + 1);
    // eslint-disable-next-line no-console
    console.log("[MegaRally] Create Round tapped");

    if (isDemo) {
      const now = Math.floor(Date.now() / 1000);
      setDemoFinalized(false);
      setDemoRoundEndsAt(now + 120);
      setLeaderboard([
        { address, score: 0n },
        { address: "0x000000000000000000000000000000000000dEaD" as Address, score: 0n },
        { address: "0x000000000000000000000000000000000000bEEF" as Address, score: 0n },
      ]);
      setDemoPool(0.01 * 3);
      setDemoJoined(true);
      setDemoEntryIndex(1);
      setDemoAttemptsUsed(0);
      setDemoAttemptScore(0n);
      setDemoTotalLocked(0n);
      uncommittedRef.current = 0;
      setAttemptOver(false);
      setMyScore(0n);
      return;
    }

    await writeContractAsync({
      address: MEGA_RALLY_ADDRESS,
      abi: MEGA_RALLY_ABI,
      functionName: "createRound",
      args: [parseEther("0.01"), 120n],
    });
    await refetchNextId();
  }

  async function handleJoin() {
    // Join UX == start first entry (paid).
    if (isDemo) {
      setDemoJoined(true);
      setDemoEntryIndex(1);
      setDemoAttemptsUsed(0);
      setDemoAttemptScore(0n);
      setDemoTotalLocked(0n);
      uncommittedRef.current = 0;
      setAttemptOver(false);
      return;
    }

    if (roundId === null || entryFee === undefined) return;

    // writeContractAsync resolves as soon as the tx is submitted. If we refetch immediately,
    // RPC can still serve the pre-tx state → UI stays stuck on "Join Round".
    const hash = await writeContractAsync({
      address: MEGA_RALLY_ADDRESS,
      abi: MEGA_RALLY_ABI,
      functionName: "startEntry",
      args: [roundId],
      value: entryFee,
    });

    try {
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    } catch {
      // ignore; we'll still attempt to refetch (some wallets/rpcs can be flaky)
    }

    await refetchJoined();
    await refetchRound();
    void refetchEntryIndex();

    // optional: pre-open attempt so a crash before first commit can still be ended
    if (isActive) {
      try {
        const attemptHash = await writeContractAsync({
          address: MEGA_RALLY_ADDRESS,
          abi: MEGA_RALLY_ABI,
          functionName: "startAttempt",
          args: [roundId],
        });
        try {
          if (publicClient) await publicClient.waitForTransactionReceipt({ hash: attemptHash });
        } catch {
          // ignore
        }
      } catch {
        // ignore (attempt may already be active / inferred)
      }
    }

    void refetchAttemptsUsed();
    void refetchAttemptScore();
    void refetchTotalScore();
    fetchLeaderboard();
  }

  async function handleNewEntry() {
    if (!isActive) return;

    if (isDemo) {
      setDemoEntryIndex((i) => i + 1);
      setDemoAttemptsUsed(0);
      setDemoAttemptScore(0n);
      setDemoTotalLocked(0n);
      uncommittedRef.current = 0;
      setAttemptOver(false);
      return;
    }

    if (roundId === null || entryFee === undefined) return;
    const hash = await writeContractAsync({
      address: MEGA_RALLY_ADDRESS,
      abi: MEGA_RALLY_ABI,
      functionName: "startEntry",
      args: [roundId],
      value: entryFee,
    });

    try {
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    } catch {
      // ignore
    }

    void refetchEntryIndex();
    void refetchAttemptsUsed();
    void refetchAttemptScore();
    void refetchTotalScore();
    fetchLeaderboard();
    uncommittedRef.current = 0;
    setAttemptOver(false);
  }

  async function handleFinalize() {
    if (isDemo) {
      setDemoFinalized(true);
      return;
    }

    if (roundId === null) return;
    await writeContractAsync({
      address: MEGA_RALLY_ADDRESS,
      abi: MEGA_RALLY_ABI,
      functionName: "finalizeRound",
      args: [roundId],
    });
    await refetchRound();
    fetchLeaderboard();
  }

  // Countdown formatting was used for the old TIME HUD (removed in attempt-based UX).

  const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const switchToMegaEthTestnet = useCallback(async () => {
    setSwitchingNetwork(true);
    try {
      await ensureMegaethCarrotChain({
        currentChainId: chainId,
        switchChainAsync,
      });
    } catch {
      // ignore (user rejection, unsupported wallet, etc.)
    } finally {
      setSwitchingNetwork(false);
    }
  }, [chainId, switchChainAsync]);

  const attemptNum = Math.min(MAX_ATTEMPTS, attemptsUsedUI + 1);

  // Deterministic, transparent per-entry seed base:
  // - same tournament/round shares the rules/curve
  // - obstacle patterns vary per entry (prevents memorization/grind advantage)
  // - same entryIndex => deterministic spawn
  // Important: this must run on every render (no conditional hooks).
  const entrySeedBase = useMemo(() => {
    const rid = roundId?.toString() ?? "0";
    const who = (address ?? ("0x0000000000000000000000000000000000000000" as Address)).toLowerCase();
    const entry = String(entryIndexUI);
    return `${chainId}:${MEGA_RALLY_ADDRESS}:${rid}:${who}:${entry}`;
  }, [chainId, roundId, address, entryIndexUI]);

  const onDashFeedback = useCallback((f: DashFeedback) => {
    setDashFeedback(f);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setDashFeedback(null), f === "perfect" ? 420 : 520);
  }, []);

  // Hard gate: prevent any onchain actions unless we're on MegaETH testnet.
  // This avoids accidental mainnet tx prompts.
  if (!isDemo && chainId !== MEGAETH_CARROT_CHAIN_ID) {
    return (
      <div className="no-round">
        <p style={{ marginBottom: 8 }}>Wrong network.</p>
        <p style={{ opacity: 0.85, fontSize: 14, marginBottom: 12 }}>
          Switch your wallet to <b>MegaETH Testnet</b> (chainId {MEGAETH_CARROT_CHAIN_ID}).
        </p>
        <button className="action-btn" onClick={switchToMegaEthTestnet} disabled={switchingNetwork}>
          {switchingNetwork ? "Switching…" : "Switch to MegaETH Testnet"}
        </button>
      </div>
    );
  }

  // Demo UX: don't show the No rounds yet / Create Round screen.
  // The demo round is seeded on mount; show a lightweight starting state until then.
  if (isDemo && roundId === null) {
    return (
      <div className="no-round">
        <p>Starting demo…</p>
      </div>
    );
  }

  if (roundId === null || (!isDemo && nextId === 0n)) {
    return (
      <div>
        <div className="no-round">
          <p>No rounds yet</p>
        </div>
        <button className="action-btn" onClick={handleCreateRound} disabled={isPending}>
          {isPending ? "Creating..." : "Create Round (0.01 ETH, 2 min)"}
        </button>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, opacity: 0.7 }} aria-live="polite">
          Tap count: {tapCount}
        </div>
      </div>
    );
  }

  // NOTE: we intentionally keep this as a *number* while animating.
  // Converting to BigInt at the end keeps the HUD stable and avoids
  // the "score looks stuck" issue caused by flooring too early.
  const pendingInt = Math.max(0, Math.trunc(livePendingScore));
  const localAttemptScore = attemptScoreUI + BigInt(pendingInt);
  const localTotalScore = totalScoreUI + BigInt(pendingInt);

  return (
    <div>
      {/* Round info */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Round #{roundId.toString()}</h2>
          <span className={`badge ${isActive ? "badge-active" : "badge-ended"}`}>
            {effectiveFinalized ? "Finalized" : isActive ? "Active" : "Ended"}
          </span>
        </div>
        {!isDemo && (
          <div className="round-info" style={{ marginTop: 8 }}>
            <span>Entry: {formatEther(effectiveEntryFee)} ETH</span>
            <span>Pool: {formatEther(effectivePool)} ETH</span>
            <span>Players: {effectivePlayerCount.toString()}</span>
          </div>
        )}
      </div>

      {/* Game + HUD */}
      {isActive && (
        <div className="dash-wrap">
          <div className="dash-topbar" aria-live="polite">
            <div className="dash-topbar-left">
              <div className="dash-topbar-label">ENTRY</div>
              <div className="dash-topbar-value">#{entryIndexUI}</div>
              <div className="dash-topbar-label" style={{ marginTop: 6 }}>
                ATTEMPT
              </div>
              <div className="dash-topbar-value">{attemptNum}/{MAX_ATTEMPTS}</div>
              <div className="dash-topbar-label" style={{ marginTop: 6 }}>
                COMBO
              </div>
              <div className="dash-topbar-value">{dashCombo}</div>
            </div>

            <div className="dash-topbar-score">
              <div className="dash-topbar-label">SCORE</div>
              <div className="dash-topbar-score-value">{localAttemptScore.toString()}</div>
              {dashFeedback && (
                <div
                  className="dash-topbar-label"
                  style={{ marginTop: 6, color: dashFeedback === "perfect" ? "#22d3ee" : "#fbbf24" }}
                >
                  {dashFeedback === "perfect" ? "PERFECT" : "NEAR"}
                </div>
              )}
            </div>

            <div className="dash-topbar-right">
              <div className="dash-topbar-label">TOTAL</div>
              <div className="dash-topbar-value">{localTotalScore.toString()}</div>
            </div>
          </div>

          <button className="dash-standings" onClick={() => setDrawerOpen(true)}>
            Standings
          </button>

          <FluffleDash
            key={`attempt-${attemptsUsedUI}-${attemptOver ? "over" : "run"}`}
            active={canPlayAttempt}
            entrySeedBase={entrySeedBase}
            attemptNumber={attemptNum}
            onDistance={onDistance}
            onCrash={onCrash}
            onCombo={setDashCombo}
            onFeedback={onDashFeedback}
          />

          {!effectiveHasJoined && (
            <div className="dash-overlay">
              <div className="dash-overlay-inner">
                <p style={{ marginBottom: 10, opacity: 0.9 }}>Join to start dashing.</p>
                <button className="action-btn" onClick={handleJoin} disabled={isPending}>
                  {isPending ? "Joining..." : isDemo ? "Join Round (demo)" : `Join Round (${formatEther(effectiveEntryFee)} ETH)`}
                </button>
              </div>
            </div>
          )}

          {effectiveHasJoined && attemptsUsedUI >= MAX_ATTEMPTS && (
            <div className="dash-overlay">
              <div className="dash-overlay-inner">
                <p style={{ marginBottom: 10, opacity: 0.9 }}>All attempts used for this entry.</p>
                <p style={{ marginBottom: 12, opacity: 0.75, fontSize: 13 }}>
                  Leaderboard keeps your best entry. Start a new entry to retry with a new seed.
                </p>
                <button className="action-btn" onClick={handleNewEntry} disabled={isPending}>
                  {isPending
                    ? "Starting..."
                    : isDemo
                      ? "Start New Entry (demo)"
                      : `Start New Entry (${formatEther(effectiveEntryFee)} ETH)`}
                </button>
              </div>
            </div>
          )}

          {effectiveHasJoined && attemptOver && attemptsUsedUI < MAX_ATTEMPTS && (
            <div className="dash-overlay">
              <div className="dash-overlay-inner">
                <p style={{ marginBottom: 6, fontWeight: 800 }}>Attempt over</p>
                <p style={{ marginBottom: 12, opacity: 0.8, fontSize: 13 }}>
                  Attempt score: {localAttemptScore.toString()} • Total: {localTotalScore.toString()}
                </p>
                <button
                  className="action-btn"
                  onClick={async () => {
                    // if endAttempt failed, retry it
                    if (!isDemo && (attemptScoreUI ?? 0n) > 0n) {
                      try {
                        await endAttempt();
                      } catch {
                        // ignore
                      }
                    }

                    // open next attempt (optional but improves UX around early crashes)
                    if (!isDemo && roundId !== null) {
                      try {
                        await writeContractAsync({
                          address: MEGA_RALLY_ADDRESS,
                          abi: MEGA_RALLY_ABI,
                          functionName: "startAttempt",
                          args: [roundId],
                        });
                        void refetchAttemptsUsed();
                        void refetchAttemptScore();
                        void refetchTotalScore();
                      } catch {
                        // ignore
                      }
                    }

                    setAttemptOver(false);
                    uncommittedRef.current = 0;
                  }}
                  disabled={endingAttempt}
                >
                  {endingAttempt ? "Locking..." : "Next Attempt"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isEnded && !effectiveFinalized && (
        <button className="action-btn" onClick={handleFinalize} disabled={isPending}>
          {isPending ? "Finalizing..." : isDemo ? "Finalize (demo)" : "Finalize Round"}
        </button>
      )}

      {(effectiveFinalized || isEnded) && (
        <button className="action-btn" onClick={handleCreateRound} disabled={isPending}>
          {isPending ? "Creating..." : isDemo ? "Restart Demo Round" : "Create New Round"}
        </button>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Standings</h3>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            {leaderboard.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No players yet</p>
            ) : (
              <ul className="leaderboard">
                {leaderboard.map((entry, i) => (
                  <li key={entry.address}>
                    <span className="rank">#{i + 1}</span>
                    <span className="addr">{entry.address.toLowerCase() === address.toLowerCase() ? "You" : shortAddr(entry.address)}</span>
                    <span className="score">{entry.score.toString()}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="status" style={{ marginTop: 10 }}>
              Attempt score: {attemptScoreUI.toString()} • Attempts used: {attemptsUsedUI}/{MAX_ATTEMPTS}
            </div>

            {!isDemo && (
              <div className="status" style={{ marginTop: 6 }}>
                Batched commits every ~3s (or when distance builds up). No per-action tx spam.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
