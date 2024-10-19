// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.20;

import "../../interfaces/Iengine.sol";
import "../../interfaces/IERC20.sol";
import "./Scenarios.sol";

abstract contract TestAllocateCallback is Scenarios {
    function allocateCallback(
        uint256 delquote,
        uint256 delbase,
        bytes calldata data
    ) public {
        data;

        if (scenario == Scenario.FAIL) return;
        address token0 = quote();
        address token1 = base();
        address from = getCaller();

        if (scenario == Scenario.SUCCESS) {
            IERC20(token0).transferFrom(from, msg.sender, delquote);
            IERC20(token1).transferFrom(from, msg.sender, delbase);
        } else if (scenario == Scenario.quote_ONLY) {
            IERC20(token0).transferFrom(from, msg.sender, delquote);
        } else if (scenario == Scenario.base_ONLY) {
            IERC20(token1).transferFrom(from, msg.sender, delbase);
        } else if (scenario == Scenario.REENTRANCY) {
            Iengine(msg.sender).allocate(bytes32(0), address(0x0), 1, 1, false, new bytes(0));
        }
        scenario = Scenario.SUCCESS;
        from = address(0x0);
    }
}
