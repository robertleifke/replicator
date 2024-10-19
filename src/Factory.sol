// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.20;

import "./interfaces/IFactory.sol";
import "./Engine.sol";

/// @title   Primitive Factory
/// @author  Primitive
/// @notice  No access controls are available to deployer
/// @dev     Deploy new engine contracts
contract Factory is IFactory {
    /// @notice Thrown when the quote and base tokens are the same
    error SameTokenError();

    /// @notice Thrown when the quote or the base token is 0x0...
    error ZeroAddressError();

    /// @notice Thrown on attempting to deploy an already deployed Engine
    error DeployedError();

    /// @notice Thrown on attempting to deploy a pool using a token with unsupported decimals
    error DecimalsError(uint256 decimals);

    /// @notice Engine will use these variables for its immutable variables
    struct Args {
        address factory;
        address quote;
        address base;
        uint256 scaleFactorquote;
        uint256 scaleFactorbase;
        uint256 minLiquidity;
    }

    /// @inheritdoc IFactory
    uint256 public constant override MIN_LIQUIDITY_FACTOR = 6;
    /// @inheritdoc IFactory
    address public immutable override deployer;
    /// @inheritdoc IFactory
    mapping(address => mapping(address => address)) public override getEngine;
    /// @inheritdoc IFactory
    Args public override args; // Used instead of an initializer in Engine contract

    constructor() {
        deployer = msg.sender;
    }

    /// @inheritdoc IFactory
    function deploy(address quote, address base) external override returns (address engine) {
        if (quote == base) revert SameTokenError();
        if (quote == address(0) || base == address(0)) revert ZeroAddressError();
        if (getEngine[quote][base] != address(0)) revert DeployedError();

        engine = deploy(address(this), quote, base);
        getEngine[quote][base] = engine;
        emit DeployEngine(msg.sender, quote, base, engine);
    }

    /// @notice         Deploys an engine contract with a `salt`. Only supports tokens with 6 <= decimals <= 18
    /// @dev            Engine contract should have no constructor args, because this affects the deployed address
    ///                 From solidity docs:
    ///                 "It will compute the address from the address of the creating contract,
    ///                 the given salt value, the (creation) bytecode of the created contract,
    ///                 and the constructor arguments."
    ///                 While the address is still deterministic by appending constructor args to a contract's bytecode,
    ///                 it's not efficient to do so on chain.
    /// @param  factory Address of the deploying smart contract
    /// @param  quote   quote token address, underlying token
    /// @param  base  base token address, quote token
    /// @return engine  Engine contract address which was deployed
    function deploy(
        address factory,
        address quote,
        address base
    ) internal returns (address engine) {
        (uint256 quoteDecimals, uint256 baseDecimals) = (IERC20(quote).decimals(), IERC20(base).decimals());
        if (quoteDecimals > 18 || quoteDecimals < 6) revert DecimalsError(quoteDecimals);
        if (baseDecimals > 18 || baseDecimals < 6) revert DecimalsError(baseDecimals);

        unchecked {
            uint256 scaleFactorquote = 10**(18 - quoteDecimals);
            uint256 scaleFactorbase = 10**(18 - baseDecimals);
            uint256 lowestDecimals = (quoteDecimals > baseDecimals ? baseDecimals : quoteDecimals);
            uint256 minLiquidity = 10**(lowestDecimals / MIN_LIQUIDITY_FACTOR);
            args = Args({
                factory: factory,
                quote: quote,
                base: base,
                scaleFactorquote: scaleFactorquote,
                scaleFactorbase: scaleFactorbase,
                minLiquidity: minLiquidity
            }); // Engines call this to get constructor args
        }
        
        engine = address(new Engine{salt: keccak256(abi.encode(quote, base))}());
        delete args;
    }
}
