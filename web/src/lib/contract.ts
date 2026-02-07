export const MEGA_RALLY_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_feeReceiver", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "ACTION_COOLDOWN",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "FEE_BPS",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createRound",
    inputs: [
      { name: "entryFee", type: "uint256" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [{ name: "roundId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "finalizeRound",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getPlayers",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getScore",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "joinRound",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "joined",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextRoundId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rounds",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "entryFee", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "pool", type: "uint256" },
      { name: "finalized", type: "bool" },
      { name: "playerCount", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "submitAction",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitActions",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "ActionsSubmitted",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newScore", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ActionSubmitted",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "newScore", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoundCreated",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "entryFee", type: "uint256", indexed: false },
      { name: "startTime", type: "uint256", indexed: false },
      { name: "endTime", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoundFinalized",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoundJoined",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
    ],
  },
] as const;

// After deploying with `forge script`, paste the address here
export const MEGA_RALLY_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`) ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // default anvil deploy address
