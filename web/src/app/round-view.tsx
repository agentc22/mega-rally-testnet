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
import { FluffleDash } from "./fluffle-dash";

interface LeaderboardEntry {
  address: Address;
  score: bigint;
}

export function RoundView({ address, demo }: { address: Address; demo?: boolean }) {
  const isDemo = !!demo;

  const [roundId, setRoundId] = useState<bigint | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [myScore, setMyScore] = useState(0n);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();

  // ---------------- Demo state ----------------
  const [demoJoined, setDemoJoined] = useState(false);
  const [demoRoundEndsAt, setDemoRoundEndsAt] = useState<number | null>(null);
  const [demoFinalized, setDemoFinalized] = useState(false);
  const [demoEntryFee] = useState(0.01);
  const [demoPool, setDemoPool] = useState(0);
  const [demoPlayers, setDemoPlayers] = useState<Address[]>([]);

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
    setMyScore(0n);
  }, [isDemo, demoRoundEndsAt, address]);

  // demo timer
  useEffect(() => {
    if (!isDemo || !demoRoundEndsAt) return;
    const tick = () => {
      const left = demoRoundEndsAt - Math.floor(Date.now() / 1000);
      setTimeLeft(Math.max(0, left));
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
    query: { enabled: !isDemo },
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
    query: { enabled: !isDemo && roundId !== null },
  });

  const { data: hasJoined, refetch: refetchJoined } = useReadContract({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    functionName: "joined",
    args: roundId !== null ? [roundId, address] : undefined,
    query: { enabled: !isDemo && roundId !== null },
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

  // Countdown timer
  useEffect(() => {
    if (isDemo) return;
    if (!endTime || endTime === 0n) return;
    const tick = () => {
      const left = Number(endTime) - Math.floor(Date.now() / 1000);
      setTimeLeft(Math.max(0, left));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [endTime, isDemo]);

  const fetchLeaderboard = useCallback(async () => {
    if (isDemo) return;
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
  }, [roundId, publicClient, address, isDemo]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    if (isDemo) return;
    if (!isActive) return;
    const iv = setInterval(fetchLeaderboard, 3000);
    return () => clearInterval(iv);
  }, [isActive, fetchLeaderboard, isDemo]);

  useWatchContractEvent({
    address: MEGA_RALLY_ADDRESS,
    abi: MEGA_RALLY_ABI,
    eventName: "ActionsSubmitted",
    enabled: !isDemo,
    onLogs() {
      fetchLeaderboard();
    },
  });

  // ---------------- Batched commits ----------------
  const uncommittedRef = useRef(0); // float
  const inFlightRef = useRef<{ amount: number } | null>(null);
  const lastCommitAtRef = useRef(0);

  const commitThreshold = 25; // "meters"
  const commitEveryMs = 3000;

  const tryCommit = useCallback(async () => {
    if (isDemo) {
      const amt = Math.floor(uncommittedRef.current);
      if (amt <= 0) return;
      uncommittedRef.current -= amt;
      setMyScore((s) => s + BigInt(amt));
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
    if (amt < commitThreshold && since < commitEveryMs) return;

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
      // optimistic local score (watch/poll will correct if needed)
      setMyScore((s) => s + BigInt(amt));
      fetchLeaderboard();
    } catch {
      // put distance back to retry later
      uncommittedRef.current += amt;
    } finally {
      inFlightRef.current = null;
    }
  }, [isDemo, isActive, effectiveHasJoined, roundId, writeContractAsync, fetchLeaderboard, address]);

  const onDistance = useCallback(
    (delta: number) => {
      if (!isActive) return;
      if (!effectiveHasJoined) return;
      if (delta <= 0) return;
      uncommittedRef.current += delta;
      // opportunistic commits
      void tryCommit();
    },
    [isActive, effectiveHasJoined, tryCommit]
  );

  useEffect(() => {
    if (!isActive) return;
    const iv = setInterval(() => {
      void tryCommit();
    }, 500);
    return () => clearInterval(iv);
  }, [isActive, tryCommit]);

  // ---------------- Actions ----------------
  async function handleCreateRound() {
    if (isDemo) {
      const now = Math.floor(Date.now() / 1000);
      setDemoFinalized(false);
      setDemoRoundEndsAt(now + 120);
      setLeaderboard([
        { address, score: 0n },
        { address: "0x000000000000000000000000000000000000dEaD" as Address, score: 0n },
        { address: "0x000000000000000000000000000000000000bEEF" as Address, score: 0n },
      ]);
      setMyScore(0n);
      setDemoPool(0.01 * 3);
      setDemoJoined(true);
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
    if (isDemo) {
      setDemoJoined(true);
      return;
    }

    if (roundId === null || entryFee === undefined) return;
    await writeContractAsync({
      address: MEGA_RALLY_ADDRESS,
      abi: MEGA_RALLY_ABI,
      functionName: "joinRound",
      args: [roundId],
      value: entryFee,
    });
    await refetchJoined();
    await refetchRound();
    fetchLeaderboard();
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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  const supportedChainIds = useMemo(() => [31337, 6343], []);
  const isSupportedChain = supportedChainIds.includes(chainId);

  if (!isDemo && !isSupportedChain) {
    return (
      <div className="no-round">
        <p>Wrong network. This app isn’t deployed on your current chain.</p>
        <p style={{ opacity: 0.8, fontSize: 14 }}>
          Switch to Anvil (local) for now. MegaETH support will be enabled once the chain is live and we deploy the contract.
        </p>
        <button
          className="action-btn"
          onClick={async () => {
            try {
              await switchChainAsync({ chainId: 31337 });
            } catch {
              // ignore
            }
          }}
        >
          Switch network
        </button>
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
      </div>
    );
  }

  const localDistance = myScore + BigInt(Math.floor(uncommittedRef.current));

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
        <div className="round-info" style={{ marginTop: 8 }}>
          <span>Entry: {formatEther(effectiveEntryFee)} ETH</span>
          <span>Pool: {formatEther(effectivePool)} ETH</span>
          <span>Players: {effectivePlayerCount.toString()}</span>
        </div>
      </div>

      {/* Game + HUD */}
      {isActive && (
        <div className="dash-wrap">
          <div className="dash-hud">
            <div className="dash-hud-left">
              <div className="dash-hud-label">TIME</div>
              <div className="dash-hud-value">{formatTime(timeLeft)}</div>
            </div>
            <div className="dash-hud-right">
              <div className="dash-hud-label">DIST</div>
              <div className="dash-hud-value">{localDistance.toString()}</div>
            </div>
          </div>

          <button className="dash-standings" onClick={() => setDrawerOpen(true)}>
            Standings
          </button>

          <FluffleDash active={isActive && effectiveHasJoined} onDistance={onDistance} />

          {!effectiveHasJoined && (
            <div className="dash-overlay">
              <div className="dash-overlay-inner">
                <p style={{ marginBottom: 10, opacity: 0.9 }}>
                  Join to start dashing.
                </p>
                <button className="action-btn" onClick={handleJoin} disabled={isPending}>
                  {isPending ? "Joining..." : isDemo ? "Join Round (demo)" : `Join Round (${formatEther(effectiveEntryFee)} ETH)`}
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
                    <span className="addr">
                      {entry.address.toLowerCase() === address.toLowerCase() ? "You" : shortAddr(entry.address)}
                    </span>
                    <span className="score">{entry.score.toString()}</span>
                  </li>
                ))}
              </ul>
            )}

            {!isDemo && (
              <div className="status" style={{ marginTop: 10 }}>
                Batching commits every ~3s (or when distance builds up). Tx frequency stays sane.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
