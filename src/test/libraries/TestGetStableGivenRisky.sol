// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.20;

import "../../libraries/ReplicationMath.sol";

/// @title   Test Get base Given quote
/// @author  Primitive
/// @dev     Tests each step in ReplicationMath.getbaseGivenquote. For testing ONLY

contract TestGetbaseGivenquote {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    uint256 public scaleFactorquote;
    uint256 public scaleFactorbase;

    function set(uint256 prec0, uint256 prec1) public {
        scaleFactorquote = prec0;
        scaleFactorbase = prec1;
    }

    function PRECISION() public pure returns (uint256) {
        return Units.PRECISION;
    }

    function step0(uint256 strike) public view returns (int128 K) {
        K = strike.scaleToX64(scaleFactorbase);
    }

    function step1(uint256 sigma, uint256 tau) public pure returns (int128 vol) {
        vol = ReplicationMath.getProportionalVolatility(sigma, tau);
    }

    function step2(uint256 reservequote) public view returns (int128 reserve) {
        reserve = reservequote.scaleToX64(scaleFactorquote);
    }

    function step3(int128 reserve) public pure returns (int128 phi) {
        phi = ReplicationMath.ONE_INT.sub(reserve).getInverseCDF(); // CDF^-1(1-x)
    }

    function step4(int128 phi, int128 vol) public pure returns (int128 input) {
        input = phi.sub(vol); // phi - vol
    }

    function step5(
        int128 K,
        int128 input,
        int128 invariantLast
    ) public pure returns (int128 reservebase) {
        reservebase = K.mul(input.getCDF()).add(invariantLast);
    }

    function testStep3(uint256 reserve) public view returns (int128 phi) {
        phi = ReplicationMath.ONE_INT.sub(reserve.scaleToX64(scaleFactorquote)).getInverseCDF();
    }

    function testStep4(
        uint256 reserve,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 input) {
        int128 phi = testStep3(reserve);
        int128 vol = step1(sigma, tau);
        input = phi.sub(vol);
    }

    function testStep5(
        uint256 reserve,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 reservebase) {
        int128 input = testStep4(reserve, sigma, tau);
        reservebase = strike.scaleToX64(scaleFactorbase).mul(input.getCDF());
    }

    /// @return reservebase The calculated base reserve, using the quote reserve
    function getbaseGivenquote(
        int128 invariantLast,
        uint256 precbase,
        uint256 reservequote,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 reservebase) {
        precbase;
        int128 K = step0(strike);
        int128 input;
        {
            int128 vol = step1(sigma, tau);
            int128 reserve = step2(reservequote);
            int128 phi = step3(reserve);
            input = step4(phi, vol);
        }
        reservebase = step5(K, input, invariantLast);
    }

    function name() public pure returns (string memory) {
        return "TestGetbaseGivenquote";
    }
}
