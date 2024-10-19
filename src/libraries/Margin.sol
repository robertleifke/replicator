// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.8.0;

import "./SafeCast.sol";

/// @title   Margin Library
/// @author  Primitive
/// @dev     Uses a data struct with two uint128s to optimize for one storage slot
library Margin {
    using SafeCast for uint256;

    struct Data {
        uint128 balancequote; // Balance of the quote token, aka underlying asset
        uint128 balancebase; // Balance of the base token, aka "quote" asset
    }

    /// @notice             Adds to quote and base token balances
    /// @param  margin      Margin data of an account in storage to manipulate
    /// @param  delquote    Amount of quote tokens to add to margin
    /// @param  delbase   Amount of base tokens to add to margin
    function deposit(
        Data storage margin,
        uint256 delquote,
        uint256 delbase
    ) internal {
        if (delquote != 0) margin.balancequote += delquote.toUint128();
        if (delbase != 0) margin.balancebase += delbase.toUint128();
    }

    /// @notice             Removes quote and base token balance from `msg.sender`'s internal margin account
    /// @param  margins     Margin data mapping, uses `msg.sender`'s margin account
    /// @param  delquote    Amount of quote tokens to subtract from margin
    /// @param  delbase   Amount of base tokens to subtract from margin
    /// @return margin      Data storage of a margin account
    function withdraw(
        mapping(address => Data) storage margins,
        uint256 delquote,
        uint256 delbase
    ) internal returns (Data storage margin) {
        margin = margins[msg.sender];
        if (delquote != 0) margin.balancequote -= delquote.toUint128();
        if (delbase != 0) margin.balancebase -= delbase.toUint128();
    }
}
