"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "@wagmi/core";
import { RoundView } from "./round-view";
import { useEffect, useRef } from "react";
import { ensureMegaethCarrotChain, MEGAETH_CARROT_CHAIN_ID } from "@/lib/megaeth-network";

export default function Home() {
  const demo = process.env.NEXT_PUBLIC_DEMO === "1";

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  // Auto-switch to MegaETH carrot on wallet connect.
  const didAttemptAutoSwitchRef = useRef(false);
  useEffect(() => {
    if (demo) return;
    if (!isConnected) {
      didAttemptAutoSwitchRef.current = false;
      return;
    }
    if (didAttemptAutoSwitchRef.current) return;
    didAttemptAutoSwitchRef.current = true;
    if (chainId === MEGAETH_CARROT_CHAIN_ID) return;

    void ensureMegaethCarrotChain({
      currentChainId: chainId,
      switchChainAsync,
    }).catch(() => {
      // ignore (user rejection, unsupported wallet, etc.)
    });
  }, [demo, isConnected, chainId, switchChainAsync]);

  const demoAddress = "0x000000000000000000000000000000000000bEEF" as const;
  const effectiveConnected = demo ? true : isConnected;
  const effectiveAddress = (demo ? demoAddress : address) as typeof demoAddress | undefined;

  return (
    <div className="container">
      <header className="header">
        <h1>MegaRally</h1>
        {demo ? (
          <div className="connect-btn" style={{ background: "#2a2a2a" }}>
            Demo mode
          </div>
        ) : isConnected ? (
          <button className="connect-btn" onClick={() => disconnect()}>
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </button>
        ) : (
          <button
            className="connect-btn"
            onClick={() => connect({ connector: injected() })}
          >
            Connect
          </button>
        )}
      </header>

      {effectiveConnected ? (
        <RoundView address={effectiveAddress!} demo={demo} />
      ) : (
        <div className="no-round">
          <p>Connect your wallet to play</p>
        </div>
      )}
    </div>
  );
}
