// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.20;

import "../../libraries/Margin.sol";

/// @title   Margin Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestMargin {
    using Margin for Margin.Data;
    using Margin for mapping(address => Margin.Data);

    /// @notice Mapping used for testing
    mapping(address => Margin.Data) public margins;

    function margin() public view returns (Margin.Data memory) {
        return margins[msg.sender];
    }

    /// @notice Adds to quote and riskless token balances
    /// @param  delquote  The amount of quote tokens to add to margin
    /// @param  delbase  The amount of base tokens to add to margin
    /// @return The margin data storage item
    function shouldDeposit(uint256 delquote, uint256 delbase) public returns (Margin.Data memory) {
        uint128 preX = margins[msg.sender].balancequote;
        uint128 preY = margins[msg.sender].balancebase;
        margins[msg.sender].deposit(delquote, delbase);
        assert(preX + delquote >= margins[msg.sender].balancequote);
        assert(preY + delbase >= margins[msg.sender].balancebase);
        return margins[msg.sender];
    }

    /// @notice Removes quote and riskless token balance from `msg.sender`'s internal margin account
    /// @param  delquote  The amount of quote tokens to add to margin
    /// @param  delbase  The amount of base tokens to add to margin
    /// @return The margin data storage item
    function shouldWithdraw(uint256 delquote, uint256 delbase) public returns (Margin.Data memory) {
        uint128 preX = margins[msg.sender].balancequote;
        uint128 preY = margins[msg.sender].balancebase;
        margins[msg.sender] = margins.withdraw(delquote, delbase);
        assert(preX - delquote >= margins[msg.sender].balancequote);
        assert(preY - delbase >= margins[msg.sender].balancebase);
        return margins[msg.sender];
    }
}
