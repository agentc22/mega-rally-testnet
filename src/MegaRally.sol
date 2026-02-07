// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

    uint256 public constant FEE_BPS = 200; // 2%
    address public feeReceiver;
    uint256 public nextRoundId;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bool)) public joined;
    mapping(uint256 => mapping(address => uint256)) public scores;
    mapping(uint256 => mapping(address => uint256)) public lastActionTime;
    mapping(uint256 => address[]) internal _players;

    uint256 public constant ACTION_COOLDOWN = 1 seconds;

    event RoundCreated(uint256 indexed roundId, address indexed creator, uint256 entryFee, uint256 startTime, uint256 endTime);
    event RoundJoined(uint256 indexed roundId, address indexed player);
    event ActionSubmitted(uint256 indexed roundId, address indexed player, uint256 newScore);
    event ActionsSubmitted(uint256 indexed roundId, address indexed player, uint256 amount, uint256 newScore);
    event RoundFinalized(uint256 indexed roundId, address indexed winner, uint256 payout, uint256 fee);

    constructor(address _feeReceiver) {
        feeReceiver = _feeReceiver;
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

    function joinRound(uint256 roundId) external payable {
        Round storage r = rounds[roundId];
        require(r.endTime > 0, "round does not exist");
        require(block.timestamp < r.endTime, "round ended");
        require(!joined[roundId][msg.sender], "already joined");
        require(msg.value == r.entryFee, "wrong entry fee");

        joined[roundId][msg.sender] = true;
        r.pool += msg.value;
        r.playerCount++;
        _players[roundId].push(msg.sender);

        emit RoundJoined(roundId, msg.sender);
    }

    function submitAction(uint256 roundId) external {
        submitActions(roundId, 1);
    }

    /// @notice Submit a batch of actions in one tx (used by Fluffle Dash distance batching)
    function submitActions(uint256 roundId, uint256 amount) public {
        require(amount > 0, "amount=0");
        Round storage r = rounds[roundId];
        require(r.endTime > 0, "round does not exist");
        require(block.timestamp >= r.startTime && block.timestamp < r.endTime, "round not active");
        require(joined[roundId][msg.sender], "not joined");
        require(block.timestamp >= lastActionTime[roundId][msg.sender] + ACTION_COOLDOWN, "cooldown");

        lastActionTime[roundId][msg.sender] = block.timestamp;
        scores[roundId][msg.sender] += amount;

        emit ActionsSubmitted(roundId, msg.sender, amount, scores[roundId][msg.sender]);
        emit ActionSubmitted(roundId, msg.sender, scores[roundId][msg.sender]);
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

    function getScore(uint256 roundId, address player) external view returns (uint256) {
        return scores[roundId][player];
    }
}
