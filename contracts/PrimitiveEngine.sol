// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Primitive Engine
/// @author  Primitive
/// @dev     Replicating Market Maker

import "./libraries/ABDKMath64x64.sol";
import "./libraries/Margin.sol";
import "./libraries/ReplicationMath.sol";
import "./libraries/Reserve.sol";
import "./libraries/SafeCast.sol";
import "./libraries/Transfers.sol";
import "./libraries/Units.sol";

import "./interfaces/callback/IPrimitiveCreateCallback.sol";
import "./interfaces/callback/IPrimitiveDepositCallback.sol";
import "./interfaces/callback/IPrimitiveLiquidityCallback.sol";
import "./interfaces/callback/IPrimitiveSwapCallback.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IPrimitiveEngine.sol";
import "./interfaces/IPrimitiveFactory.sol";

contract PrimitiveEngine is IPrimitiveEngine {
    using ABDKMath64x64 for *;
    using ReplicationMath for int128;
    using Units for *;
    using SafeCast for *;
    using Reserve for mapping(bytes32 => Reserve.Data);
    using Reserve for Reserve.Data;
    using Margin for mapping(address => Margin.Data);
    using Margin for Margin.Data;
    using Transfers for IERC20;

    /// @dev Parameters of each pool
    struct Calibration {
        uint128 strike; // scaled by stable precision
        uint64 sigma; // scaled by percentage precision
        uint32 maturity; // maturity timestamp of pool
        uint32 lastTimestamp; // last timestamp used to calculate time until expiry, "tau"
    }

    /// @inheritdoc IPrimitiveEngineView
    uint256 public constant override PRECISION = 10**18;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public constant override GAMMA = 9985;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public constant override BUFFER = 120 seconds;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public constant override MIN_LIQUIDITY = 1e3;
    /// @inheritdoc IPrimitiveEngineView
    address public immutable override factory;
    /// @inheritdoc IPrimitiveEngineView
    address public immutable override risky;
    /// @inheritdoc IPrimitiveEngineView
    address public immutable override stable;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public immutable override precisionRisky;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public immutable override precisionStable;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Calibration) public override calibrations;
    /// @inheritdoc IPrimitiveEngineView
    mapping(address => Margin.Data) public override margins;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Reserve.Data) public override reserves;
    /// @inheritdoc IPrimitiveEngineView
    mapping(address => mapping(bytes32 => uint256)) public override liquidity;

    uint8 private unlocked = 1;

    modifier lock() {
        if (unlocked != 1) revert LockedError();

        unlocked = 0;
        _;
        unlocked = 1;
    }

    /// @notice Deploys an Engine with two tokens, a 'Risky' and 'Stable'
    constructor() {
        (factory, risky, stable, precisionRisky, precisionStable) = IPrimitiveFactory(msg.sender).args();
    }

    /// @return Risky token balance of this contract
    function balanceRisky() private view returns (uint256) {
        (bool success, bytes memory data) = risky.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        if (!success || data.length < 32) revert BalanceError();
        return abi.decode(data, (uint256));
    }

    /// @return Stable token balance of this contract
    function balanceStable() private view returns (uint256) {
        (bool success, bytes memory data) = stable.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        if (!success || data.length < 32) revert BalanceError();
        return abi.decode(data, (uint256));
    }

    /// @notice Revert if expected do not exceed current balances
    function checkRiskyBalance(uint256 expectedRisky) private view {
        uint256 actualRisky = balanceRisky();
        if (actualRisky < expectedRisky) revert RiskyBalanceError(expectedRisky, actualRisky);
    }

    /// @notice Revert if expected do not exceed current balances
    function checkStableBalance(uint256 expectedStable) private view {
        uint256 actualStable = balanceStable();
        if (actualStable < expectedStable) revert StableBalanceError(expectedStable, actualStable);
    }

    /// @return blockTimestamp casted as a uint32
    function _blockTimestamp() internal view virtual returns (uint32 blockTimestamp) {
        // solhint-disable-next-line
        blockTimestamp = uint32(block.timestamp);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function updateLastTimestamp(bytes32 poolId) external override returns (uint32 lastTimestamp) {
        lastTimestamp = _updateLastTimestamp(poolId);
    }

    /// @return lastTimestamp of the pool, used in calculating the time until expiry
    function _updateLastTimestamp(bytes32 poolId) internal virtual returns (uint32 lastTimestamp) {
        Calibration storage cal = calibrations[poolId];
        if (cal.lastTimestamp == 0) revert UninitializedError();
        lastTimestamp = _blockTimestamp();
        uint32 maturity = cal.maturity;
        if (lastTimestamp > maturity) lastTimestamp = maturity; // if expired, set to the maturity
        cal.lastTimestamp = lastTimestamp;
        emit UpdatedTimestamp(poolId, lastTimestamp);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function create(
        uint256 strike,
        uint64 sigma,
        uint32 maturity,
        uint256 delta,
        uint256 delLiquidity,
        bytes calldata data
    )
        external
        override
        lock
        returns (
            bytes32 poolId,
            uint256 delRisky,
            uint256 delStable
        )
    {
        (uint256 prec0, uint256 prec1) = (precisionRisky, precisionStable);
        uint256 scaledStrike = strike.scaleDown(prec1); // strike / 10^(18 - precision)
        poolId = keccak256(abi.encodePacked(address(this), scaledStrike, sigma, maturity));

        if (delta > 1e18 || delta == 0) revert OutOfBoundsError(delta); // 0 < delta < 1, <= 18 decimals
        if (sigma > 1e7 || sigma < 100) revert OutOfBoundsError(sigma); // 1% <= sigma <= 1000%, precision of 4
        if (calibrations[poolId].lastTimestamp != 0) revert PoolDuplicateError();

        Calibration memory cal = Calibration({
            strike: scaledStrike.toUint128(),
            sigma: sigma.toUint64(),
            maturity: maturity,
            lastTimestamp: _blockTimestamp()
        });

        uint32 tau = cal.maturity - cal.lastTimestamp; // time until expiry
        delRisky = PRECISION - delta; // delta should have 18 precision, 0 < delta < 1e18
        delRisky = delRisky.scaleDown(prec0); // 18 -> native precision
        delStable = ReplicationMath.getStableGivenRisky(0, prec0, prec1, delRisky, cal.strike, cal.sigma, tau);
        delRisky = (delRisky * delLiquidity) / PRECISION; // liquidity has 18 decimals, so delRisky has native precision
        delStable = (delStable * delLiquidity) / PRECISION;

        if (delRisky == 0 || delStable == 0) revert CalibrationError(delRisky, delStable);

        {
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IPrimitiveCreateCallback(msg.sender).createCallback(delRisky, delStable, data);
            checkRiskyBalance(balRisky + delRisky);
            checkStableBalance(balStable + delStable);
        }

        calibrations[poolId] = cal; // initialize calibration
        reserves[poolId].allocate(delRisky, delStable, delLiquidity, cal.lastTimestamp); // provide liquidity
        liquidity[msg.sender][poolId] += delLiquidity - MIN_LIQUIDITY; // burn 1000 wei, at cost of msg.sender
        emit Created(msg.sender, cal.strike, cal.sigma, cal.maturity);
    }

    // ===== Margin =====

    /// @inheritdoc IPrimitiveEngineActions
    function deposit(
        address recipient,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external override lock {
        if (delRisky == 0 || delStable == 0) revert ZeroDeltasError();
        uint256 balRisky;
        uint256 balStable;
        if (delRisky > 0) balRisky = balanceRisky();
        if (delStable > 0) balStable = balanceStable();
        IPrimitiveDepositCallback(msg.sender).depositCallback(delRisky, delStable, data); // agnostic payment
        if (delRisky > 0) checkRiskyBalance(balRisky + delRisky);
        if (delStable > 0) checkStableBalance(balStable + delStable);

        margins[recipient].deposit(delRisky, delStable); // adds to risky and/or stable token balances
        emit Deposited(msg.sender, recipient, delRisky, delStable);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function withdraw(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) external override lock {
        if (delRisky == 0 || delStable == 0) revert ZeroDeltasError();
        margins.withdraw(delRisky, delStable); // removes risky and/or stable token balances from `msg.sender`
        if (delRisky > 0) IERC20(risky).safeTransfer(recipient, delRisky);
        if (delStable > 0) IERC20(stable).safeTransfer(recipient, delStable);
        emit Withdrawn(msg.sender, recipient, delRisky, delStable);
    }

    // ===== Liquidity =====

    /// @inheritdoc IPrimitiveEngineActions
    function allocate(
        bytes32 poolId,
        address recipient,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external override lock returns (uint256 delRisky, uint256 delStable) {
        Reserve.Data storage reserve = reserves[poolId];
        uint32 timestamp = _blockTimestamp();
        if (reserve.blockTimestamp == 0) revert UninitializedError();
        if (timestamp > calibrations[poolId].maturity) revert PoolExpiredError();

        (delRisky, delStable) = reserve.getAmounts(delLiquidity); // amounts to allocate
        if (delRisky == 0 || delStable == 0) revert ZeroDeltasError();

        if (fromMargin) {
            margins.withdraw(delRisky, delStable); // removes tokens from `msg.sender` margin account
        } else {
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IPrimitiveLiquidityCallback(msg.sender).allocateCallback(delRisky, delStable, data); // agnostic payment
            checkRiskyBalance(balRisky + delRisky);
            checkStableBalance(balStable + delStable);
        }

        liquidity[recipient][poolId] += delLiquidity; // increase position liquidity
        reserve.allocate(delRisky, delStable, delLiquidity, timestamp); // increase reserves and liquidity
        emit Allocated(msg.sender, recipient, poolId, delRisky, delStable);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function remove(bytes32 poolId, uint256 delLiquidity)
        external
        override
        lock
        returns (uint256 delRisky, uint256 delStable)
    {
        Reserve.Data storage reserve = reserves[poolId];
        if (reserve.blockTimestamp == 0) revert UninitializedError();
        (delRisky, delStable) = reserve.getAmounts(delLiquidity); // amounts from removing, one side can be 0

        liquidity[msg.sender][poolId] -= delLiquidity; // update position liquidity of msg.sender
        reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp()); // update global reserves
        margins[msg.sender].deposit(delRisky, delStable); // increase margin of msg.sender
        emit Removed(msg.sender, poolId, delRisky, delStable);
    }

    struct SwapDetails {
        bytes32 poolId;
        uint256 deltaIn;
        bool riskyForStable;
        bool fromMargin;
        uint32 timestamp;
    }

    /// @inheritdoc IPrimitiveEngineActions
    function swap(
        bytes32 poolId,
        bool riskyForStable,
        uint256 deltaIn,
        bool fromMargin,
        bytes calldata data
    ) external override lock returns (uint256 deltaOut) {
        if (deltaIn == 0) revert DeltaInError();

        SwapDetails memory details = SwapDetails({
            poolId: poolId,
            deltaIn: deltaIn,
            riskyForStable: riskyForStable,
            fromMargin: fromMargin,
            timestamp: _blockTimestamp()
        });

        uint32 lastTimestamp = _updateLastTimestamp(details.poolId); // the pool's timestamp, after being updated
        if (details.timestamp > lastTimestamp + BUFFER) revert PoolExpiredError(); // 120s buffer to allow final swaps
        int128 invariantX64 = invariantOf(details.poolId); // stored in memory to perform the invariant check

        {
            // reserve scope
            Calibration memory cal = calibrations[details.poolId];
            Reserve.Data storage reserve = reserves[details.poolId];
            bool swapInRisky = details.riskyForStable;
            uint32 tau = cal.maturity - cal.lastTimestamp;
            uint256 deltaInWithFee = (details.deltaIn * GAMMA) / Units.PERCENTAGE; // amount * (1 - fee %)
            (uint256 res0, uint256 res1, uint256 liq) = (
                uint256(reserve.reserveRisky),
                uint256(reserve.reserveStable),
                uint256(reserve.liquidity)
            );

            if (swapInRisky) {
                res0 = ((res0 + deltaInWithFee) * PRECISION) / liq; // per liquidity
                res1 = invariantX64.getStableGivenRisky(
                    precisionRisky,
                    precisionStable,
                    res0,
                    cal.strike,
                    cal.sigma,
                    tau
                ); // native precision, per liquidity
                deltaOut = res1 - (res1 * liq) / PRECISION; // res1 for all liquidity
            } else {
                res1 = ((res1 + deltaInWithFee) * PRECISION) / liq; // per liquidity
                res0 = invariantX64.getRiskyGivenStable(
                    precisionRisky,
                    precisionStable,
                    res1,
                    cal.strike,
                    cal.sigma,
                    tau
                ); // native precision, per liquidity
                deltaOut = res0 - (res0 * liq) / PRECISION; // res0 for all liquidity
            }

            reserve.swap(swapInRisky, details.deltaIn, deltaOut, _blockTimestamp()); // state update

            int128 invariantAfter = invariantOf(details.poolId);
            if (invariantX64 > invariantAfter) revert InvariantError(invariantX64, invariantAfter);
        }

        if (deltaOut == 0) revert DeltaOutError();

        if (details.riskyForStable) {
            IERC20(stable).safeTransfer(msg.sender, deltaOut); // send proceeds, for callback if needed
            if (details.fromMargin) {
                margins.withdraw(deltaIn, 0); // pay for swap
            } else {
                uint256 balRisky = balanceRisky();
                IPrimitiveSwapCallback(msg.sender).swapCallback(details.deltaIn, 0, data); // agnostic payment
                checkRiskyBalance(balRisky + details.deltaIn);
            }
        } else {
            IERC20(risky).safeTransfer(msg.sender, deltaOut); // send proceeds first, for callback if needed
            if (details.fromMargin) {
                margins.withdraw(0, deltaIn); // pay for swap
            } else {
                uint256 balStable = balanceStable();
                IPrimitiveSwapCallback(msg.sender).swapCallback(0, details.deltaIn, data); // agnostic payment
                checkStableBalance(balStable + details.deltaIn);
            }
        }

        emit Swap(msg.sender, details.poolId, details.riskyForStable, details.deltaIn, deltaOut);
    }

    // ===== View =====

    /// @inheritdoc IPrimitiveEngineView
    function invariantOf(bytes32 poolId) public view override returns (int128 invariant) {
        Reserve.Data memory reserve = reserves[poolId];
        Calibration memory cal = calibrations[poolId];
        uint32 tau = cal.maturity - cal.lastTimestamp;
        (uint256 riskyPerLiquidity, uint256 stablePerLiquidity) = reserve.getAmounts(PRECISION);
        invariant = ReplicationMath.calcInvariant(
            precisionRisky,
            precisionStable,
            riskyPerLiquidity,
            stablePerLiquidity,
            cal.strike,
            cal.sigma,
            tau
        );
    }
}
