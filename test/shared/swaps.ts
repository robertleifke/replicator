import {
  callDelta,
  getInvariantApproximation,
  getMarginalPriceSwapquoteInApproximation,
  getMarginalPriceSwapbaseInApproximation,
  getquoteGivenbase,
  getquoteGivenbaseApproximation,
  getSpotPriceApproximation,
  getbaseGivenquoteApproximation,
} from '@primitivefi/rmm-math'
import { Floating, parseWei, Wei } from 'web3-units'

/**
 * Copied from {@link https://github.com/primitivefinance/rmm-sdk/blob/main/src/entities/swaps.ts}
 *
 * @remarks
 * The rmm-sdk uses this rmm-core package as a dependency. The sdk has models of the smart contracts,
 * making it easier to derive information like swap amounts. This is used in the core smart contract tests as well.
 */

/** Post-swap invariant and implied price after a swap. */
export interface SwapResult {
  /** Post-swap invariant of the pool. */
  invariant: number

  /** Price of the asset paid from the swap. */
  priceIn: string
}

export interface ExactInResult extends SwapResult {
  /** Amount of tokens output from a swap. */
  output: number
}

export interface ExactOutResult extends SwapResult {
  /** Amount of tokens input to a swap. */
  input: number
}

/** Static functions to compute swap in/out amounts and marginal prices. */
export class Swaps {
  // --- Max Swap Amounts in ---
  static getMaxDeltaIn(
    quoteForbase: boolean,
    reservequoteWei: Wei,
    reservebaseWei: Wei,
    reserveLiquidityWei: Wei,
    strikeWei: Wei
  ): Wei {
    if (quoteForbase) {
      const quotePerLiquidity = reservequoteWei.mul(1e18).div(reserveLiquidityWei)
      return parseWei(1, reservequoteWei.decimals).sub(quotePerLiquidity).mul(reserveLiquidityWei).div(1e18)
    } else {
      const basePerLiquidity = reservebaseWei.mul(1e18).div(reserveLiquidityWei)
      return strikeWei.sub(basePerLiquidity).mul(reserveLiquidityWei).div(1e18)
    }
  }

  static getMaxDeltaOut(quoteForbase: boolean, reservequoteWei: Wei, reservebaseWei: Wei, strikeWei: Wei): Wei {
    if (quoteForbase) {
      return reservebaseWei.sub(1)
    } else {
      return reservequoteWei.sub(1)
    }
  }

  /**
   * Gets price of quote token denominated in base token.
   *
   * @param reservequoteFloating Amount of quote tokens in reserve as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   */
  public static getReportedPriceOfquote(
    reservequoteFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number
  ): number {
    return getSpotPriceApproximation(reservequoteFloating, strikeFloating, sigmaFloating, tauYears)
  }

  // --- Computing Reserves ---

  /**
   * Gets estimated quote token reserves given a reference price of the quote asset, for 1 unit of liquidity.
   *
   * @remarks
   * Equal to the Delta (option greeks) exposure of one liquidity unit.
   *
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param referencePriceOfquote Price of the quote token denominated in the base token.
   *
   * @beta
   */
  public static getquoteReservesGivenReferencePrice(
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    referencePriceOfquote: number
  ): number {
    return 1 - callDelta(strikeFloating, sigmaFloating, tauYears, referencePriceOfquote)
  }

  /**
   * Gets quote reserves given base reserves, for 1 unit of liquidity.
   *
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param reservebaseFloating Amount of quote tokens in reserve as a floating point decimal number.
   * @param invariantFloating Computed invariant of curve as a floating point decimal number.
   *
   * @beta
   */
  public static getquoteGivenbase(
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    reservebaseFloating: number,
    invariantFloating = 0
  ): number | undefined {
    const base = getquoteGivenbaseApproximation(
      reservebaseFloating,
      strikeFloating,
      sigmaFloating,
      tauYears,
      invariantFloating
    )

    if (isNaN(base)) return undefined
    return base
  }

  /**
   * Gets estimated base token reserves given quote token reserves, for 1 unit of liquidity.
   *
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param reservequoteFloating Amount of quote tokens in reserve as a floating point decimal number.
   * @param invariantFloating Computed invariant of curve as a floating point decimal number.
   *
   * @beta
   */
  public static getbaseGivenquote(
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    reservequoteFloating: number,
    invariantFloating = 0
  ): number | undefined {
    const base = getbaseGivenquoteApproximation(
      reservequoteFloating,
      strikeFloating,
      sigmaFloating,
      tauYears,
      invariantFloating
    )

    if (isNaN(base)) return undefined
    return base
  }

  // --- Computing Change in Marginal Price ---

  /**
   * Gets marginal price after an exact trade in of the quote asset with size `amountIn`.
   *
   * {@link https://arxiv.org/pdf/2012.08040.pdf}
   *
   * @param reservequoteFloating Amount of quote tokens in reserve as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param amountIn Amount of quote token to add to quote reserve.
   *
   * @beta
   */
  public static getMarginalPriceSwapquoteIn(
    reservequoteFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    gammaFloating: number,
    amountIn: number
  ) {
    return getMarginalPriceSwapquoteInApproximation(
      amountIn,
      reservequoteFloating,
      strikeFloating,
      sigmaFloating,
      tauYears,
      1 - gammaFloating
    )
  }

  /**
   * Gets marginal price after an exact trade in of the base asset with size `amountIn`.
   *
   * {@link https://arxiv.org/pdf/2012.08040.pdf}
   *
   * @param reservebaseFloating Amount of base tokens in reserve as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param amountIn Amount of base token to add to base reserve.
   *
   * @beta
   */
  public static getMarginalPriceSwapbaseIn(
    invariantFloating: number,
    reservebaseFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    gammaFloating: number,
    amountIn: number
  ) {
    return getMarginalPriceSwapbaseInApproximation(
      amountIn,
      invariantFloating,
      reservebaseFloating,
      strikeFloating,
      sigmaFloating,
      tauYears,
      1 - gammaFloating
    )
  }

  /**
   * Gets output amount of base tokens given an exact amount of quote tokens in.
   *
   * {@link https://github.com/primitivefinance/rmms-py}
   *
   * @param amountIn Amount of quote token to add to quote reserve.
   * @param decimalsquote Decimal places of the quote token.
   * @param decimalsbase Decimal places of the base token.
   * @param reservequoteFloating Amount of quote tokens in reserve as a floating point decimal number.
   * @param reservebaseFloating Amount of base tokens in reserve as a floating point decimal number.
   * @param reserveLiquidityFloating Total supply of liquidity as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   *
   * @beta
   */
  public static exactquoteInput(
    amountIn: number,
    decimalsquote: number,
    decimalsbase: number,
    reservequoteFloating: number,
    reservebaseFloating: number,
    reserveLiquidityFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    gammaFloating: number,
    tauYears: number
  ): ExactInResult {
    if (amountIn < 0) throw new Error(`Amount in cannot be negative: ${amountIn}`)

    const K = strikeFloating
    const gamma = gammaFloating
    const sigma = sigmaFloating
    const tau = tauYears

    const x = Floating.from(reservequoteFloating, decimalsquote)
    const y = Floating.from(reservebaseFloating, decimalsbase)
    const l = Floating.from(reserveLiquidityFloating, 18)

    // Invariant `k` must always be calculated given the curve with `tau`, else the swap happens on a mismatched curve
    const k = getInvariantApproximation(
      x.div(l).normalized, // truncates to appropriate decimals
      y.div(l).normalized,
      K,
      sigma,
      tau,
      0
    )

    const x1 = x.add(amountIn * gamma).div(l)

    const yAdjusted = Swaps.getbaseGivenquote(x1.normalized, K, sigma, tau, k)
    if (typeof yAdjusted === 'undefined')
      throw new Error(`Next base reserves are undefined: ${[yAdjusted, x1.normalized, K, sigma, tau, k]}`)

    const y1 = Floating.from(yAdjusted, decimalsbase).mul(l) // liquidity normalized

    const output = y.sub(y1.normalized)
    if (output.normalized < 0) throw new Error(`Reserves cannot be negative: ${output.normalized}`)

    const res0 = x.add(amountIn).div(l)
    const res1 = y.sub(output).div(l)

    const invariant = getInvariantApproximation(res0.normalized, res1.normalized, K, sigma, tau, 0)
    if (invariant < k) throw new Error(`Invariant decreased by: ${k - invariant}`)

    const priceIn = output.div(amountIn).normalized.toString()

    return {
      output: output.normalized,
      invariant: invariant,
      priceIn: priceIn,
    }
  }

  /**
   * Gets output amount of quote tokens given an exact amount of base tokens in.
   *
   * {@link https://github.com/primitivefinance/rmms-py}
   *
   * @param amountIn Amount of base tokens to add to base reserve.
   * @param decimalsquote Decimal places of the quote token.
   * @param decimalsbase Decimal places of the base token.
   * @param reservequoteFloating Amount of quote tokens in reserve as a floating point decimal number.
   * @param reservebaseFloating Amount of base tokens in reserve as a floating point decimal number.
   * @param reserveLiquidityFloating Total supply of liquidity as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   *
   * @beta
   */
  public static exactbaseInput(
    amountIn: number,
    decimalsquote: number,
    decimalsbase: number,
    reservequoteFloating: number,
    reservebaseFloating: number,
    reserveLiquidityFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    gammaFloating: number,
    tauYears: number
  ): ExactInResult {
    if (amountIn < 0) throw new Error(`Amount in cannot be negative: ${amountIn}`)

    const K = strikeFloating
    const gamma = gammaFloating
    const sigma = sigmaFloating
    const tau = tauYears

    const x = Floating.from(reservequoteFloating, decimalsquote)
    const y = Floating.from(reservebaseFloating, decimalsbase)
    const l = Floating.from(reserveLiquidityFloating, 18)

    // Invariant `k` must always be calculated given the curve with `tau`, else the swap happens on a mismatched curve
    const k = getInvariantApproximation(
      x.div(l).normalized, // truncates to appropriate decimals
      y.div(l).normalized,
      K,
      sigma,
      tau,
      0
    )

    const y1 = y.add(amountIn * gamma).div(l)

    // note: for some reason, the regular non approximated fn outputs less
    const xAdjusted = getquoteGivenbase(y1.normalized, K, sigma, tau, k)
    if (xAdjusted < 0) throw new Error(`Reserves cannot be negative: ${xAdjusted}`)

    const x1 = Floating.from(xAdjusted, decimalsquote).mul(l)

    const output = x.sub(x1)
    if (output.normalized < 0) throw new Error(`Amount out cannot be negative: ${output.normalized}`)

    const res0 = x.sub(output).div(l)
    const res1 = y.add(amountIn).div(l)

    const invariant = getInvariantApproximation(res0.normalized, res1.normalized, K, sigma, tau, 0)
    if (invariant < k) throw new Error(`Invariant decreased by: ${k - invariant}`)

    let priceIn: string
    if (amountIn === 0) priceIn = Floating.INFINITY.toString()
    else priceIn = Floating.from(amountIn, decimalsbase).div(output).normalized.toString()

    return {
      output: output.normalized,
      invariant: invariant,
      priceIn: priceIn,
    }
  }

  /**
   * Gets input amount of base tokens given an exact amount of quote tokens out.
   *
   * {@link https://github.com/primitivefinance/rmms-py}
   *
   * @param amountOut Amount of quote tokens to remove from quote reserve.
   * @param decimalsquote Decimal places of the quote token.
   * @param decimalsbase Decimal places of the base token.
   * @param reservequoteFloating Amount of quote tokens in reserve as a floating point decimal number.
   * @param reservebaseFloating Amount of base tokens in reserve as a floating point decimal number.
   * @param reserveLiquidityFloating Total supply of liquidity as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   *
   * @beta
   */
  public static exactquoteOutput(
    amountOut: number,
    decimalsquote: number,
    decimalsbase: number,
    reservequoteFloating: number,
    reservebaseFloating: number,
    reserveLiquidityFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    gammaFloating: number,
    tauYears: number
  ): ExactOutResult {
    if (amountOut < 0) throw new Error(`Amount out cannot be negative: ${amountOut}`)

    const K = strikeFloating
    const gamma = gammaFloating
    const sigma = sigmaFloating
    const tau = tauYears

    const x = Floating.from(reservequoteFloating, decimalsquote)
    const y = Floating.from(reservebaseFloating, decimalsbase)
    const l = Floating.from(reserveLiquidityFloating, 18)

    // Invariant `k` must always be calculated given the curve with `tau`, else the swap happens on a mismatched curve
    const k = getInvariantApproximation(
      x.div(l).normalized, // truncates to appropriate decimals
      y.div(l).normalized,
      K,
      sigma,
      tau,
      0
    )
    const x1 = x.sub(amountOut).div(l)

    const yAdjusted = Swaps.getbaseGivenquote(K, sigma, tau, x1.normalized) // fix: doesn't use approx (which works?)
    if (typeof yAdjusted === 'undefined') throw new Error(`Adjusted base reserve cannot be undefined: ${yAdjusted}`)

    const y1 = Floating.from(yAdjusted, decimalsbase).mul(l)

    const input = y1.sub(y)
    const inputWithFee = input.div(gamma)

    const res0 = x1
    const res1 = y.add(input).div(l)

    const invariant = getInvariantApproximation(res0.normalized, res1.normalized, K, sigma, tau, 0)
    if (invariant < k) throw new Error(`Invariant decreased by: ${k - invariant}`)

    let priceIn: string
    if (inputWithFee.normalized === 0) priceIn = Floating.INFINITY.toString()
    else priceIn = inputWithFee.div(amountOut).normalized.toString()

    return {
      input: inputWithFee.normalized,
      invariant: invariant,
      priceIn: priceIn,
    }
  }

  /**
   * Gets input amount of quote tokens given an exact amount of base tokens out.
   *
   * {@link https://github.com/primitivefinance/rmms-py}
   *
   * @param amountOut Amount of base tokens to remove from base reserve.
   * @param decimalsquote Decimal places of the quote token.
   * @param decimalsbase Decimal places of the base token.
   * @param reservequoteFloating Amount of quote tokens in reserve as a floating point decimal number.
   * @param reservebaseFloating Amount of base tokens in reserve as a floating point decimal number.
   * @param reserveLiquidityFloating Total supply of liquidity as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   *
   * @beta
   */
  public static exactbaseOutput(
    amountOut: number,
    decimalsquote: number,
    decimalsbase: number,
    reservequoteFloating: number,
    reservebaseFloating: number,
    reserveLiquidityFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    gammaFloating: number,
    tauYears: number
  ): ExactOutResult {
    if (amountOut < 0) throw new Error(`Amount in cannot be negative: ${amountOut}`)

    const K = strikeFloating
    const gamma = gammaFloating
    const sigma = sigmaFloating
    const tau = tauYears

    const x = Floating.from(reservequoteFloating, decimalsquote)
    const y = Floating.from(reservebaseFloating, decimalsbase)
    const l = Floating.from(reserveLiquidityFloating, 18)

    // Invariant `k` must always be calculated given the curve with `tau`, else the swap happens on a mismatched curve
    const k = getInvariantApproximation(
      x.div(l).normalized, // truncates to appropriate decimals
      y.div(l).normalized,
      K,
      sigma,
      tau,
      0
    )

    const y1 = y.sub(amountOut).div(l)

    const xAdjusted = getquoteGivenbase(y1.normalized, K, sigma, tau, k)
    if (xAdjusted < 0) throw new Error(`Adjusted quote reserves cannot be negative: ${xAdjusted}`)

    const x1 = Floating.from(xAdjusted, decimalsquote).mul(l)

    const input = x1.sub(x)
    const inputWithFee = input.div(gamma)

    const res0 = x.add(input).div(l)
    const res1 = y1

    const invariant = getInvariantApproximation(res0.normalized, res1.normalized, K, sigma, tau, 0)
    if (invariant < k) throw new Error(`Invariant decreased by: ${k - invariant}`)

    const priceIn = Floating.from(amountOut, decimalsbase).div(inputWithFee).normalized.toString()

    return {
      input: inputWithFee.normalized,
      invariant: invariant,
      priceIn: priceIn,
    }
  }
}
