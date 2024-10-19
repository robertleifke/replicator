// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.20;

import "../../interfaces/Iengine.sol";
import "../../interfaces/IERC20.sol";
import "./Scenarios.sol";

abstract contract TestDepositCallback is Scenarios {
    function depositCallback(
        uint256 dquote,
        uint256 dbase,
        bytes calldata data
    ) public {
        data;
        if (scenario == Scenario.FAIL) return;
        address token0 = quote();
        address token1 = base();
        address from = getCaller();
        if (scenario == Scenario.quote_ONLY) {
            IERC20(token0).transferFrom(from, msg.sender, dquote);
        } else if (scenario == Scenario.base_ONLY) {
            IERC20(token1).transferFrom(from, msg.sender, dbase);
        } else if (scenario == Scenario.SUCCESS) {
            IERC20(token0).transferFrom(from, msg.sender, dquote);
            IERC20(token1).transferFrom(from, msg.sender, dbase);
        } else if (scenario == Scenario.REENTRANCY) {
            Iengine(msg.sender).deposit(address(this), dquote, dbase, data);
        }
    }
}
