// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice MegaRally tournament contract.
///
/// Retry model ("entries"):
/// - A player may start multiple *entries* within the same round while the round is active.
/// - Each entry contains up to MAX_ATTEMPTS attempts.
/// - The leaderboard score (getScore / scores) is the player's BEST score across all entries.
/// - Per-entry score resets on startEntry; attemptsUsed resets as well.
contract MegaRally {
    struct Round {
        address creator;
        uint256 entryFee;
        uint256 startTime;
        uint256 endTime;
        uint256 pool;
        bool finalized;
        uint256 playerCount;
    }

    struct PlayerRound {
        // Current entry index (starts at 0; first entry is 1)
        uint32 entryIndex;

        // Number of completed attempts in the current entry (0..MAX_ATTEMPTS)
        uint8 attemptsUsed;
        // Score accrued in the current attempt (only counts while attemptActive)
        uint256 currentAttemptScore;
        // Score locked in from completed attempts within the current entry
        uint256 totalLockedScore;
        bool attemptActive;

        // --- Per-obstacle anti-cheat state (per current entry & attempt) ---
        // Monotonic obstacle counter within the active attempt.
        uint32 obstacleCount;
        // Rate limiting: how many obstacles were recorded in `lastObstacleAt` second.
        uint8 obstaclesThisSecond;
        uint64 lastObstacleAt;
    }

    uint256 public constant FEE_BPS = 200; // 2%
    address public feeReceiver;
    uint256 public nextRoundId;

    uint256 public constant ACTION_COOLDOWN = 1 seconds;
    uint8 public constant MAX_ATTEMPTS = 3;

    // --- Operator-driven per-obstacle scoring ---
    // Max obstacles per player per second (for on-chain anti-spam). Seconds granularity.
    uint8 public constant MAX_OBSTACLES_PER_SECOND = 10;
    // Max score that a single obstacle can contribute.
    uint32 public constant MAX_SCORE_PER_OBSTACLE = 100;

    /// @notice player => operator => allowed
    mapping(address => mapping(address => bool)) public isOperator;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bool)) public joined;

    /// @notice Backwards-compatible aggregate score used for leaderboards/finalization.
    /// @dev This is the BEST score across all entries for (roundId, player).
    mapping(uint256 => mapping(address => uint256)) public scores;

    mapping(uint256 => mapping(address => uint256)) public lastActionTime;
    mapping(uint256 => address[]) internal _players;

    mapping(uint256 => mapping(address => PlayerRound)) internal _playerRound;

    event RoundCreated(
        uint256 indexed roundId, address indexed creator, uint256 entryFee, uint256 startTime, uint256 endTime
    );
    event RoundJoined(uint256 indexed roundId, address indexed player);

    /// @notice Emitted when a new entry starts; clients should derive per-entry seeds using (chainId, contract, roundId, player, entryIndex).
    event EntryStarted(uint256 indexed roundId, address indexed player, uint32 entryIndex);

    event ActionSubmitted(uint256 indexed roundId, address indexed player, uint256 newScore);
    event ActionsSubmitted(uint256 indexed roundId, address indexed player, uint256 amount, uint256 newScore);
    event RoundFinalized(uint256 indexed roundId, address indexed winner, uint256 payout, uint256 fee);

    event AttemptStarted(uint256 indexed roundId, address indexed player, uint32 entryIndex, uint8 attemptNumber);
    event AttemptEnded(
        uint256 indexed roundId,
        address indexed player,
        uint32 entryIndex,
        uint8 attemptsUsed,
        uint256 attemptScore,
        uint256 entryTotalScore,
        uint256 bestScore
    );

    event OperatorSet(address indexed player, address indexed operator, bool allowed);

    /// @notice Emitted once per obstacle recorded.
    event ObstaclePassed(
        uint256 indexed roundId,
        address indexed player,
        uint32 indexed entryIndex,
        uint32 obstacleCount,
        uint32 deltaScore,
        uint256 attemptScore,
        uint256 bestScore
    );

    constructor(address _feeReceiver) {
        feeReceiver = _feeReceiver;
    }

    function setOperator(address operator, bool allowed) external {
        isOperator[msg.sender][operator] = allowed;
        emit OperatorSet(msg.sender, operator, allowed);
    }

    modifier onlyPlayerOrOperator(address player) {
        require(msg.sender == player || isOperator[player][msg.sender], "not operator");
        _;
    }

    function createRound(uint256 entryFee, uint256 duration) external returns (uint256 roundId) {
        require(duration > 0, "duration must be > 0");
        roundId = nextRoundId++;
        uint256 start = block.timestamp;
        uint256 end = start + duration;
        rounds[roundId] = Round({
            creator: msg.sender,
            entryFee: entryFee,
            startTime: start,
            endTime: end,
            pool: 0,
            finalized: false,
            playerCount: 0
        });
        emit RoundCreated(roundId, msg.sender, entryFee, start, end);
    }

    /// @notice Back-compat: joinRound starts your first entry.
    function joinRound(uint256 roundId) external payable {
        startEntry(roundId);
    }

    /// @notice Start a new entry for a round. One tx per entry.
    /// @dev Requires payment of the round entryFee *per entry*.
    function startEntry(uint256 roundId) public payable {
        Round storage r = rounds[roundId];
        require(r.endTime > 0, "round does not exist");
        require(block.timestamp >= r.startTime && block.timestamp < r.endTime, "round not active");
        require(msg.value == r.entryFee, "wrong entry fee");

        // First time a player enters this round, register them.
        if (!joined[roundId][msg.sender]) {
            joined[roundId][msg.sender] = true;
            r.playerCount++;
            _players[roundId].push(msg.sender);
            emit RoundJoined(roundId, msg.sender);
        }

        // Add this entry's fee into the pool.
        r.pool += msg.value;

        // Reset per-entry state.
        PlayerRound storage pr = _playerRound[roundId][msg.sender];
        pr.entryIndex += 1;
        pr.attemptsUsed = 0;
        pr.currentAttemptScore = 0;
        pr.totalLockedScore = 0;
        pr.attemptActive = false;
        pr.obstacleCount = 0;
        pr.obstaclesThisSecond = 0;
        pr.lastObstacleAt = 0;

        emit EntryStarted(roundId, msg.sender, pr.entryIndex);
    }

    function startAttempt(uint256 roundId) external {
        _startAttempt(roundId, msg.sender);
    }

    function _startAttempt(uint256 roundId, address player) internal {
        Round storage r = rounds[roundId];
        require(r.endTime > 0, "round does not exist");
        require(block.timestamp >= r.startTime && block.timestamp < r.endTime, "round not active");
        require(joined[roundId][player], "not joined");

        PlayerRound storage pr = _playerRound[roundId][player];
        require(pr.entryIndex > 0, "no active entry");
        require(!pr.attemptActive, "attempt active");
        require(pr.attemptsUsed < MAX_ATTEMPTS, "attempts exhausted");

        pr.attemptActive = true;
        pr.currentAttemptScore = 0;
        pr.obstacleCount = 0;
        pr.obstaclesThisSecond = 0;
        pr.lastObstacleAt = 0;

        emit AttemptStarted(roundId, player, pr.entryIndex, uint8(pr.attemptsUsed + 1));
    }

    function endAttempt(uint256 roundId) external {
        Round storage r = rounds[roundId];
        require(r.endTime > 0, "round does not exist");
        require(joined[roundId][msg.sender], "not joined");

        PlayerRound storage pr = _playerRound[roundId][msg.sender];
        require(pr.entryIndex > 0, "no active entry");
        require(pr.attemptActive, "no active attempt");

        uint256 attemptScore = pr.currentAttemptScore;
        pr.totalLockedScore += attemptScore;
        pr.currentAttemptScore = 0;
        pr.attemptActive = false;
        pr.attemptsUsed += 1;

        uint256 entryTotal = pr.totalLockedScore;
        uint256 best = scores[roundId][msg.sender];
        if (entryTotal > best) {
            best = entryTotal;
            scores[roundId][msg.sender] = best;
        }

        emit AttemptEnded(roundId, msg.sender, pr.entryIndex, pr.attemptsUsed, attemptScore, entryTotal, best);
    }

    function submitAction(uint256 roundId) external {
        submitActions(roundId, 1);
    }

    /// @notice Submit a batch of actions in one tx (used by Fluffle Dash distance batching)
    /// Points are attributed to the current attempt; max attempts per entry is MAX_ATTEMPTS.
    function submitActions(uint256 roundId, uint256 amount) public {
        require(amount > 0, "amount=0");
        Round storage r = rounds[roundId];
        require(r.endTime > 0, "round does not exist");
        require(block.timestamp >= r.startTime && block.timestamp < r.endTime, "round not active");
        require(joined[roundId][msg.sender], "not joined");
        require(block.timestamp >= lastActionTime[roundId][msg.sender] + ACTION_COOLDOWN, "cooldown");

        PlayerRound storage pr = _playerRound[roundId][msg.sender];
        require(pr.entryIndex > 0, "no active entry");
        require(pr.attemptsUsed < MAX_ATTEMPTS, "attempts exhausted");

        if (!pr.attemptActive) {
            // Infer attempt start on first submit to keep batching UX simple.
            pr.attemptActive = true;
            pr.currentAttemptScore = 0;
            pr.obstacleCount = 0;
            pr.obstaclesThisSecond = 0;
            pr.lastObstacleAt = 0;
            emit AttemptStarted(roundId, msg.sender, pr.entryIndex, uint8(pr.attemptsUsed + 1));
        }

        lastActionTime[roundId][msg.sender] = block.timestamp;
        pr.currentAttemptScore += amount;

        uint256 entryTotal = pr.totalLockedScore + pr.currentAttemptScore;
        uint256 best = scores[roundId][msg.sender];
        if (entryTotal > best) {
            best = entryTotal;
            scores[roundId][msg.sender] = best;
        }

        emit ActionsSubmitted(roundId, msg.sender, amount, best);
        emit ActionSubmitted(roundId, msg.sender, best);
    }

    /// @notice Convenience for self-reporting (player calls directly).
    function obstaclePassed(uint256 roundId, uint32 entryIndex_, uint32 obstacleCount_, uint32 deltaScore)
        external
    {
        _obstaclePassed(roundId, msg.sender, entryIndex_, obstacleCount_, deltaScore);
    }

    /// @notice Operator endpoint (server/relayer calls on behalf of `player`).
    function obstaclePassedFor(
        uint256 roundId,
        address player,
        uint32 entryIndex_,
        uint32 obstacleCount_,
        uint32 deltaScore
    ) external onlyPlayerOrOperator(player) {
        _obstaclePassed(roundId, player, entryIndex_, obstacleCount_, deltaScore);
    }

    function _obstaclePassed(
        uint256 roundId,
        address player,
        uint32 entryIndex_,
        uint32 obstacleCount_,
        uint32 deltaScore
    ) internal {
        Round storage r = rounds[roundId];
        require(r.endTime > 0, "round does not exist");
        require(block.timestamp >= r.startTime && block.timestamp < r.endTime, "round not active");
        require(joined[roundId][player], "not joined");
        require(deltaScore <= MAX_SCORE_PER_OBSTACLE, "delta too big");

        PlayerRound storage pr = _playerRound[roundId][player];
        require(pr.entryIndex > 0, "no active entry");
        require(pr.entryIndex == entryIndex_, "wrong entry");
        require(pr.attemptsUsed < MAX_ATTEMPTS, "attempts exhausted");
        require(pr.attemptActive, "no active attempt");

        // Enforce monotonic obstacle counter (1,2,3,... within the attempt)
        require(obstacleCount_ == pr.obstacleCount + 1, "non-monotonic");
        pr.obstacleCount = obstacleCount_;

        // Rate limit (seconds granularity)
        if (pr.lastObstacleAt == uint64(block.timestamp)) {
            require(pr.obstaclesThisSecond < MAX_OBSTACLES_PER_SECOND, "rate");
            pr.obstaclesThisSecond += 1;
        } else {
            pr.lastObstacleAt = uint64(block.timestamp);
            pr.obstaclesThisSecond = 1;
        }

        pr.currentAttemptScore += deltaScore;

        uint256 entryTotal = pr.totalLockedScore + pr.currentAttemptScore;
        uint256 best = scores[roundId][player];
        if (entryTotal > best) {
            best = entryTotal;
            scores[roundId][player] = best;
        }

        emit ObstaclePassed(roundId, player, pr.entryIndex, obstacleCount_, deltaScore, pr.currentAttemptScore, best);
    }

    function finalizeRound(uint256 roundId) external {
        Round storage r = rounds[roundId];
        require(r.endTime > 0, "round does not exist");
        require(block.timestamp >= r.endTime, "round not ended");
        require(!r.finalized, "already finalized");

        r.finalized = true;

        address winner;
        uint256 highScore;
        address[] storage players = _players[roundId];
        for (uint256 i = 0; i < players.length; i++) {
            uint256 s = scores[roundId][players[i]];
            if (s > highScore) {
                highScore = s;
                winner = players[i];
            }
        }

        if (r.pool == 0 || winner == address(0)) {
            emit RoundFinalized(roundId, address(0), 0, 0);
            return;
        }

        uint256 fee = (r.pool * FEE_BPS) / 10_000;
        uint256 payout = r.pool - fee;

        (bool s1,) = winner.call{value: payout}("");
        require(s1, "winner transfer failed");
        (bool s2,) = feeReceiver.call{value: fee}("");
        require(s2, "fee transfer failed");

        emit RoundFinalized(roundId, winner, payout, fee);
    }

    function getPlayers(uint256 roundId) external view returns (address[] memory) {
        return _players[roundId];
    }

    /// @notice Best score across entries.
    function getScore(uint256 roundId, address player) external view returns (uint256) {
        return scores[roundId][player];
    }

    /// @notice Current entry index for player in round (0 if none started).
    function entryIndex(uint256 roundId, address player) external view returns (uint32) {
        return _playerRound[roundId][player].entryIndex;
    }

    /// @notice Attempts used in the current entry.
    function attemptsUsed(uint256 roundId, address player) external view returns (uint8) {
        return _playerRound[roundId][player].attemptsUsed;
    }

    function currentAttemptScore(uint256 roundId, address player) external view returns (uint256) {
        return _playerRound[roundId][player].currentAttemptScore;
    }

    /// @notice Total score for the current entry (locked + current attempt).
    function totalScore(uint256 roundId, address player) external view returns (uint256) {
        PlayerRound storage pr = _playerRound[roundId][player];
        return pr.totalLockedScore + pr.currentAttemptScore;
    }
}
