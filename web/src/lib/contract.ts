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
    name: "MAX_ATTEMPTS",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_OBSTACLES_PER_SECOND",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_SCORE_PER_OBSTACLE",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isOperator",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setOperator",
    inputs: [
      { name: "operator", type: "address" },
      { name: "allowed", type: "bool" }
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "obstaclePassed",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "entryIndex_", type: "uint32" },
      { name: "obstacleCount_", type: "uint32" },
      { name: "deltaScore", type: "uint32" }
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "obstaclePassedFor",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
      { name: "entryIndex_", type: "uint32" },
      { name: "obstacleCount_", type: "uint32" },
      { name: "deltaScore", type: "uint32" }
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "attemptsUsed",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentAttemptScore",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalScore",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "entryIndex",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "startEntry",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "startAttempt",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "endAttempt",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
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
    name: "EntryStarted",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "entryIndex", type: "uint32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AttemptStarted",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "entryIndex", type: "uint32", indexed: false },
      { name: "attemptNumber", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AttemptEnded",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "entryIndex", type: "uint32", indexed: false },
      { name: "attemptsUsed", type: "uint8", indexed: false },
      { name: "attemptScore", type: "uint256", indexed: false },
      { name: "entryTotalScore", type: "uint256", indexed: false },
      { name: "bestScore", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "OperatorSet",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "allowed", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ObstaclePassed",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "entryIndex", type: "uint32", indexed: true },
      { name: "obstacleCount", type: "uint32", indexed: false },
      { name: "deltaScore", type: "uint32", indexed: false },
      { name: "attemptScore", type: "uint256", indexed: false },
      { name: "bestScore", type: "uint256", indexed: false },
    ],
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
  "0x1E5a45532a3C5fA56342A7CeFdd42f6eB4F5E6aD"; // default anvil deploy address
