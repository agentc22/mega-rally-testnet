// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MegaRally.sol";

contract ObstacleBatcher {
    MegaRally public rally;

    constructor(MegaRally _rally) {
        rally = _rally;
    }

    function batch(
        uint256 roundId,
        address player,
        uint32 entryIndex,
        uint32 startObstacleCount,
        uint32 n,
        uint32 deltaScore
    ) external {
        for (uint32 i = 0; i < n; i++) {
            rally.obstaclePassedFor(roundId, player, entryIndex, startObstacleCount + i, deltaScore);
        }
    }

    function batchMaxPlusOne(uint256 roundId, address player, uint32 entryIndex, uint32 startObstacleCount) external {
        uint32 n = uint32(rally.MAX_OBSTACLES_PER_SECOND()) + 1;
        for (uint32 i = 0; i < n; i++) {
            rally.obstaclePassedFor(roundId, player, entryIndex, startObstacleCount + i, 1);
        }
    }
}

contract MegaRallyTest is Test {
    MegaRally rally;
    address feeReceiver = makeAddr("feeReceiver");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");

    function setUp() public {
        rally = new MegaRally(feeReceiver);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(charlie, 10 ether);
    }

    function test_createRound() public {
        vm.prank(alice);
        uint256 id = rally.createRound(0.01 ether, 60);
        (address creator, uint256 entryFee,, uint256 endTime,,, uint256 playerCount) = rally.rounds(id);
        assertEq(creator, alice);
        assertEq(entryFee, 0.01 ether);
        assertGt(endTime, block.timestamp);
        assertEq(playerCount, 0);
    }

    function test_joinRound() public {
        uint256 id = rally.createRound(0.01 ether, 60);

        vm.prank(alice);
        rally.joinRound{value: 0.01 ether}(id);

        assertTrue(rally.joined(id, alice));
        (,,,, uint256 pool,, uint256 playerCount) = rally.rounds(id);
        assertEq(pool, 0.01 ether);
        assertEq(playerCount, 1);
    }

    function test_joinRound_wrongFee() public {
        uint256 id = rally.createRound(0.01 ether, 60);
        vm.prank(alice);
        vm.expectRevert("wrong entry fee");
        rally.joinRound{value: 0.02 ether}(id);
    }

    function test_joinRound_double_startsNewEntry() public {
        uint256 id = rally.createRound(0.01 ether, 60);

        vm.prank(alice);
        rally.joinRound{value: 0.01 ether}(id);
        assertEq(rally.entryIndex(id, alice), 1);

        // Second join is treated as starting a new paid entry
        vm.prank(alice);
        rally.joinRound{value: 0.01 ether}(id);
        assertEq(rally.entryIndex(id, alice), 2);

        (,,,, uint256 pool,, uint256 playerCount) = rally.rounds(id);
        assertEq(pool, 0.02 ether);
        assertEq(playerCount, 1);
    }

    function test_submitActions() public {
        uint256 id = rally.createRound(0.01 ether, 60);
        vm.prank(alice);
        rally.joinRound{value: 0.01 ether}(id);

        vm.prank(alice);
        rally.submitActions(id, 7);
        assertEq(rally.getScore(id, alice), 7);
    }

    function test_submitActions_amountZero() public {
        uint256 id = rally.createRound(0.01 ether, 60);
        vm.prank(alice);
        rally.joinRound{value: 0.01 ether}(id);

        vm.prank(alice);
        vm.expectRevert("amount=0");
        rally.submitActions(id, 0);
    }

    function test_submitAction_cooldown() public {
        uint256 id = rally.createRound(0.01 ether, 60);
        vm.prank(alice);
        rally.joinRound{value: 0.01 ether}(id);

        vm.prank(alice);
        rally.submitAction(id);

        vm.prank(alice);
        vm.expectRevert("cooldown");
        rally.submitAction(id);

        // After cooldown passes
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        rally.submitAction(id);
        assertEq(rally.getScore(id, alice), 2);
    }

    function test_submitAction_notJoined() public {
        uint256 id = rally.createRound(0.01 ether, 60);
        vm.prank(alice);
        vm.expectRevert("not joined");
        rally.submitAction(id);
    }

    function test_finalizeRound_payoutAndFee() public {
        uint256 id = rally.createRound(1 ether, 60);

        vm.prank(alice);
        rally.joinRound{value: 1 ether}(id);
        vm.prank(bob);
        rally.joinRound{value: 1 ether}(id);

        // Alice taps 3 times, Bob taps 1 time
        vm.prank(alice);
        rally.submitAction(id);
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        rally.submitAction(id);
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        rally.submitAction(id);

        vm.prank(bob);
        rally.submitAction(id);

        // Warp past end
        vm.warp(block.timestamp + 60);

        uint256 aliceBefore = alice.balance;
        uint256 feeBefore = feeReceiver.balance;

        rally.finalizeRound(id);

        // Pool = 2 ether, fee = 2%, payout = 98%
        assertEq(feeReceiver.balance - feeBefore, 0.04 ether);
        assertEq(alice.balance - aliceBefore, 1.96 ether);

        (,,,,, bool finalized,) = rally.rounds(id);
        assertTrue(finalized);
    }

    function test_finalizeRound_notEnded() public {
        uint256 id = rally.createRound(1 ether, 60);
        vm.expectRevert("round not ended");
        rally.finalizeRound(id);
    }

    function test_finalizeRound_alreadyFinalized() public {
        uint256 id = rally.createRound(0, 1);
        vm.warp(block.timestamp + 2);
        rally.finalizeRound(id);
        vm.expectRevert("already finalized");
        rally.finalizeRound(id);
    }

    function test_freeRound() public {
        uint256 id = rally.createRound(0, 60);
        vm.prank(alice);
        rally.joinRound(id);
        vm.prank(alice);
        rally.submitAction(id);

        vm.warp(block.timestamp + 61);
        rally.finalizeRound(id);
        // No revert = success for zero-pool round
    }

    function test_getPlayers() public {
        uint256 id = rally.createRound(0.01 ether, 60);
        vm.prank(alice);
        rally.joinRound{value: 0.01 ether}(id);
        vm.prank(bob);
        rally.joinRound{value: 0.01 ether}(id);

        address[] memory players = rally.getPlayers(id);
        assertEq(players.length, 2);
        assertEq(players[0], alice);
        assertEq(players[1], bob);
    }

    function test_attempts_threeAttemptsSumAndCap() public {
        uint256 id = rally.createRound(0, 60);
        vm.prank(alice);
        rally.joinRound(id);

        // Attempt 1: +5
        vm.prank(alice);
        rally.submitActions(id, 5);
        assertEq(rally.currentAttemptScore(id, alice), 5);
        assertEq(rally.totalScore(id, alice), 5);
        vm.prank(alice);
        rally.endAttempt(id);
        assertEq(rally.attemptsUsed(id, alice), 1);
        assertEq(rally.totalScore(id, alice), 5);

        // Attempt 2: +2
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        rally.submitActions(id, 2);
        vm.prank(alice);
        rally.endAttempt(id);
        assertEq(rally.attemptsUsed(id, alice), 2);
        assertEq(rally.totalScore(id, alice), 7);

        // Attempt 3: +9
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        rally.submitActions(id, 9);
        vm.prank(alice);
        rally.endAttempt(id);
        assertEq(rally.attemptsUsed(id, alice), 3);
        assertEq(rally.totalScore(id, alice), 16);

        // Cannot submit after 3 completed attempts
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        vm.expectRevert("attempts exhausted");
        rally.submitActions(id, 1);

        // Cannot startAttempt after exhausted
        vm.prank(alice);
        vm.expectRevert("attempts exhausted");
        rally.startAttempt(id);
    }

    function test_obstaclePassed_operatorHappyPath() public {
        uint256 id = rally.createRound(0, 60);

        vm.prank(alice);
        rally.joinRound(id);

        vm.prank(alice);
        rally.startAttempt(id);

        vm.prank(alice);
        rally.setOperator(bob, true);

        vm.prank(bob);
        rally.obstaclePassedFor(id, alice, 1, 1, 10);

        assertEq(rally.currentAttemptScore(id, alice), 10);
        assertEq(rally.getScore(id, alice), 10);
    }

    function test_obstaclePassed_monotonicEnforced() public {
        uint256 id = rally.createRound(0, 60);

        vm.startPrank(alice);
        rally.joinRound(id);
        rally.startAttempt(id);
        rally.setOperator(bob, true);
        vm.stopPrank();

        vm.prank(bob);
        rally.obstaclePassedFor(id, alice, 1, 1, 1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "non-monotonic"));
        rally.obstaclePassedFor(id, alice, 1, 3, 1);
    }

    function test_obstaclePassed_rateLimitedPerSecond() public {
        uint256 id = rally.createRound(0, 60);

        vm.startPrank(alice);
        rally.joinRound(id);
        rally.startAttempt(id);
        ObstacleBatcher batcher = new ObstacleBatcher(rally);
        rally.setOperator(address(batcher), true);
        vm.stopPrank();

        // Batch within one tx => same block.timestamp.
        batcher.batch(id, alice, 1, 1, rally.MAX_OBSTACLES_PER_SECOND(), 1);

        uint32 start = uint32(rally.MAX_OBSTACLES_PER_SECOND()) + 1;

        // MAX+1 within a single tx should revert.
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "rate"));
        batcher.batchMaxPlusOne(id, alice, 1, start);
    }

    // NOTE: Event namespaced emits (e.g. `emit MegaRally.RoundCreated(...)`) are
    // not supported in older Solidity versions we target for MegaETH testnet
    // compatibility. Keeping this test disabled.
    // function test_events() public { ... }
}

