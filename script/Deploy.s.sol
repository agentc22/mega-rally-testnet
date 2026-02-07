// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MegaRally.sol";

contract Deploy is Script {
    function run() external {
        address feeReceiver = vm.envOr("FEE_RECEIVER", msg.sender);
        vm.startBroadcast();
        MegaRally rally = new MegaRally(feeReceiver);
        vm.stopBroadcast();
        console.log("MegaRally deployed at:", address(rally));
    }
}
