"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { RoundView } from "./round-view";

export default function Home() {
  const demo = process.env.NEXT_PUBLIC_DEMO === "1";

  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  // Note: we intentionally do NOT auto-switch chains on connect.
  // Some mobile wallets reload the page on switch requests, which can cause a refresh loop.
  // Instead we show an explicit Switch to MegaETH Testnet button inside RoundView when on the wrong chain.

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
          <button className="connect-btn" onClick={() => connect({ connector: injected() })}>
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
