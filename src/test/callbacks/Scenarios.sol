// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.20;

abstract contract Scenarios {
    Scenario public scenario = Scenario.SUCCESS;

    enum Scenario {
        FAIL,
        SUCCESS,
        quote_ONLY,
        base_ONLY,
        REENTRANCY
    }

    function quote() public view virtual returns (address);

    function base() public view virtual returns (address);

    function getCaller() public view virtual returns (address);
}
