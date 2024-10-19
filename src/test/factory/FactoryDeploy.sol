// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.20;

import "../../interfaces/Ifactory.sol";

contract FactoryDeploy {
    address public factory;

    constructor() {}

    function initialize(address factory_) public {
        factory = factory_;
    }

    function deploy(address quote, address base) public {
        Ifactory(factory).deploy(quote, base);
    }

    function name() public pure returns (string memory) {
        return "FactoryDeploy";
    }
}
