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

const chains = process.env.NEXT_PUBLIC_CHAIN === "megaeth"
  ? ([megaETH] as const)
  : ([anvil] as const);

export const config = createConfig({
  chains,
  transports: Object.fromEntries(
    chains.map((c) => [c.id, http()])
  ) as Record<number, ReturnType<typeof http>>,
});
