// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

import "hardhat/console.sol";

/// @notice  Engine Reserves
/// @author  Primitive
/// @dev     This library holds the data structure for an Engine's Reserves.

library Reserve {
    // An Engine has two reserves of RISKY and RISK-FREE assets, X and Y, and total liquidity shares.
    struct Data {
        // the reserve for the risky asset
        uint RX1;
        // the reserve for the stable asset
        uint RY2;
        // the total supply of liquidity shares
        uint liquidity;
        // the liquidity available for lending
        uint float;
        // the liquidity unavailable because it was borrowed
        uint debt;
        // oracle items
        uint cumulativeRisky;
        uint cumulativeStable;
        uint cumulativeLiquidity;
        uint32 blockTimestamp;
    }

    /// @notice Adds to the cumulative reserves
    function update(Data storage res, uint32 blockTimestamp) internal returns (Data storage) {
        uint32 deltaTime = blockTimestamp - res.blockTimestamp;
        res.cumulativeRisky += res.RX1 * deltaTime;
        res.cumulativeStable += res.RY2 * deltaTime;
        res.cumulativeLiquidity += res.liquidity * deltaTime;
        return res;
    }

    /// @notice Increases one reserve value and decreases the other by different amounts
    function swap(Data storage reserve, bool addXRemoveY, uint deltaIn, uint deltaOut, uint32 blockTimestamp) internal returns (Data storage) {
        if(addXRemoveY) {
            reserve.RX1 += deltaIn;
            reserve.RY2 -= deltaOut;
        } else {
            reserve.RX1 -= deltaOut;
            reserve.RY2 += deltaIn;
        }
        return update(reserve, blockTimestamp);
    }

    /// @notice Add to both reserves and total supply of liquidity
    function allocate(Data storage reserve, uint deltaX, uint deltaY, uint deltaL, uint32 blockTimestamp) internal returns (Data storage) {
        reserve.RX1 += deltaX;
        reserve.RY2 += deltaY;
        reserve.liquidity += deltaL;
        return update(reserve, blockTimestamp);
    }

    /// @notice Remove from both reserves and total supply of liquidity
    function remove(Data storage reserve, uint deltaX, uint deltaY, uint deltaL, uint32 blockTimestamp) internal returns (Data storage) {
        reserve.RX1 -= deltaX;
        reserve.RY2 -= deltaY;
        reserve.liquidity -= deltaL;
        return update(reserve, blockTimestamp);
    }

    /// @notice Increases available float to borrow, called when lending
    function addFloat(Data storage reserve, uint deltaL) internal returns (Data storage) {
        reserve.float += deltaL;
        return reserve;
    }

    /// @notice Reduces available float, taking liquidity off the market, called when claiming
    function removeFloat(Data storage reserve, uint deltaL) internal returns (Data storage) {
        reserve.float -= deltaL;
        return reserve;
    }

    /// @notice Reduces float and increases debt of the global reserve, called when borrowing
    function borrowFloat(Data storage reserve, uint deltaL) internal returns (Data storage) {
        reserve.float -= deltaL;
        reserve.debt += deltaL;
        return reserve;
    }

    /// @notice Increases float and reduces debt of the global reserve, called when repaying a borrow 
    function repayFloat(Data storage reserve, uint deltaL) internal returns (Data storage) {
        reserve.float += deltaL;
        reserve.debt -= deltaL;
        return reserve;
    }
}
