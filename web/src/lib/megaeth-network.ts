export const MEGAETH_CARROT_CHAIN_ID = 6343;

// MetaMask/Rabby chain-add params for MegaETH public testnet ("carrot")
// Chain ID 6343 = 0x18C7
export const MEGAETH_CARROT_ADD_CHAIN_PARAMS = {
  chainId: "0x18C7",
  chainName: "MegaETH Testnet",
  rpcUrls: ["https://carrot.megaeth.com/rpc"],
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  blockExplorerUrls: ["https://megaeth-testnet-v2.blockscout.com/"],
} as const;

function getErrorCode(err: unknown): number | undefined {
  const anyErr = err as any;
  return (
    anyErr?.code ??
    anyErr?.cause?.code ??
    anyErr?.data?.originalError?.code ??
    anyErr?.cause?.data?.originalError?.code
  );
}

function getEthereumProvider(): { request: (args: { method: string; params?: any[] }) => Promise<any> } | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).ethereum;
}

function isUnrecognizedChainError(err: unknown) {
  const code = getErrorCode(err);
  if (code === 4902) return true;

  const message = String((err as any)?.message ?? "").toLowerCase();
  // Wallets differ in wording.
  return message.includes("unrecognized chain") || message.includes("unknown chain") || message.includes("not added");
}

/**
 * Ensures the connected wallet is on MegaETH carrot.
 *
 * Pattern:
 * - try wagmi switchChain
 * - if chain is not added to wallet, request wallet_addEthereumChain
 * - then switchChain again
 */
export async function ensureMegaethCarrotChain(params: {
  currentChainId?: number;
  switchChainAsync?: (args: { chainId: number }) => Promise<unknown>;
}) {
  const { currentChainId, switchChainAsync } = params;
  if (!switchChainAsync) return;
  if (currentChainId === MEGAETH_CARROT_CHAIN_ID) return;

  try {
    await switchChainAsync({ chainId: MEGAETH_CARROT_CHAIN_ID });
    return;
  } catch (err) {
    if (!isUnrecognizedChainError(err)) throw err;

    const ethereum = getEthereumProvider();
    if (!ethereum?.request) throw err;

    // Add chain, then retry switch.
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [MEGAETH_CARROT_ADD_CHAIN_PARAMS],
    });

    await switchChainAsync({ chainId: MEGAETH_CARROT_CHAIN_ID });
  }
}
