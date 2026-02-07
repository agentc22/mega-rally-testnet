# MegaRally

Fluffle Dash v2: a mobile-first, Flappy-Bird-ish on-chain rally game.

- Players start one or more paid **entries** within a timed round.
- Each entry gives you up to **3 attempts**.
- You **dash** in a canvas runner.
- Your **distance** is your score.
- Leaderboard uses your **best entry**.
- When the round ends, the top score wins the pool (minus a 2% fee).

## Architecture

```
src/              Foundry — MegaRally.sol
test/             Foundry tests
script/           Deploy script
web/              Next.js 14 + wagmi v2 + viem (Canvas 2D gameplay)
```

## Quickstart (local)

### 1) Start Anvil

```bash
anvil
```

### 2) Deploy contract

```bash
# Uses first Anvil default key
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Note the deployed address — if it's not `0x5FbDB2315678afecb367f032d93F642f64180aa3`, update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `web/.env.local`.

### 3) Run the frontend

```bash
cd web
cp .env.local.example .env.local   # edit if needed
npm install
npm run dev
```

Open http://localhost:3000, connect MetaMask (add Anvil network: RPC `http://127.0.0.1:8545`, Chain ID `31337`), and import an Anvil test account.

### 4) Run tests

```bash
forge test -vvv
```

## Demo mode (no wallet)

In `web/.env.local` set:

```bash
NEXT_PUBLIC_DEMO=1
```

This enables a local-only round with simulated opponents (no chain / wallet required).

## Batching: why distance doesn’t mean “tap = tx”

Gameplay produces distance continuously, but **on-chain writes are batched** to keep transaction frequency sane.

Frontend behavior:
- Accumulates distance locally.
- Commits every ~3 seconds **or** when the local buffer exceeds a threshold.

Contract behavior:
- `submitActions(roundId, amount)` increments your score by `amount` in a single tx.

## Contract API

| Function | Description |
|---|---|
| `createRound(entryFee, duration)` | Create a new timed round |
| `startEntry(roundId)` | Start a new paid entry (payable, per entry) |
| `joinRound(roundId)` | Back-compat alias for `startEntry` |
| `submitActions(roundId, amount)` | Batch-submit distance/actions (recommended) |
| `submitAction(roundId)` | Legacy single action (calls `submitActions(roundId, 1)`) |
| `finalizeRound(roundId)` | After round ends — pays winner 98%, feeReceiver 2% |

## MegaETH deployment

1. Set env vars:
   ```bash
   export NEXT_PUBLIC_CHAIN=megaeth
   export NEXT_PUBLIC_MEGAETH_RPC=https://rpc.megaeth.com
   export NEXT_PUBLIC_CONTRACT_ADDRESS=<deployed-address>
   ```
2. Deploy contract with MegaETH RPC and your deployer key.
3. Run the frontend.

## License

MIT


Deployed testnet build via GitHub Pages (Actions).
