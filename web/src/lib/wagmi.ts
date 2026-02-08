import { http, createConfig } from "wagmi";
import { defineChain } from "viem";

export const anvil = defineChain({
  id: 31337,
  name: "Anvil (Local)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
});

// MegaETH public testnet ("carrot")
// Chain params from official docs: https://docs.megaeth.com/testnet
export const megaETH = defineChain({
  id: 6343,
  name: "MegaETH Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_MEGAETH_RPC || "https://carrot.megaeth.com/rpc",
      ],
    },
  },
});

// Include both chains so `switchChain` works even if the user starts on the wrong network.
// Order controls the default chain.
const chains = process.env.NEXT_PUBLIC_CHAIN === "megaeth"
  ? ([megaETH, anvil] as const)
  : ([anvil, megaETH] as const);

export const config = createConfig({
  chains,
  transports: Object.fromEntries(
    chains.map((c) => [c.id, http()])
  ) as Record<number, ReturnType<typeof http>>,
});
