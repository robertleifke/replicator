import { Wei, Time, FixedPointX64, parseFixedPointX64, parseWei, toBN, Percentage } from 'web3-units'
import {
  quantilePrime,
  std_n_pdf,
  inverse_std_n_cdf,
  nonNegative,
  getSpotPriceApproximation,
} from '@primitivefi/rmm-math'
import { getbaseGivenquote, getquoteGivenbase, calcInvariant } from '@primitivefi/rmm-math'
import { Calibration } from './calibration'

export const PERCENTAGE = 10 ** Percentage.Mantissa
export const PRECISION: Wei = parseWei('1', 18)
export const GAMMA = 9985

export const clonePool = (poolToClone: VirtualPool, newquote: Wei, newbase: Wei): VirtualPool => {
  return new VirtualPool(poolToClone.cal, newquote, poolToClone.liquidity, newbase ?? newbase)
}

export interface SwapReturn {
  deltaOut: Wei
  pool: VirtualPool
  effectivePriceOutbase?: Wei
}

export interface DebugReturn extends SwapReturn {
  invariantLast?: FixedPointX64
  deltaInWithFee?: Wei
  nextInvariant?: FixedPointX64
}

export interface PoolState {
  reservequote: Wei
  reservebase: Wei
  liquidity: Wei
}

/**
 * @notice Virtualized instance of a pool using any reserve amounts
 */
export class VirtualPool {
  public static readonly PRECISION: Wei = PRECISION
  public static readonly GAMMA: number = GAMMA
  public static readonly FEE: number = GAMMA / PERCENTAGE
  public readonly liquidity: Wei
  public readonly cal: Calibration

  /// ===== State of Virtual Pool =====
  public _reservequote: Wei
  public _reservebase: Wei
  public _invariant: FixedPointX64
  public tau: Time
  public debug: boolean = false

  /**
   * @notice Builds a typescript representation of a single curve within an Engine contract
   * @param initialquote Reserve amount to initialize the pool's quote tokens
   * @param liquidity Total liquidity supply to initialize the pool with
   * @param overridebase The initial base reserve value
   */
  constructor(
    cal: Calibration,
    initialquote: Wei,
    liquidity: Wei,
    overridebase?: Wei,
    overrideInvariant?: FixedPointX64
  ) {
    // ===== State =====
    this._reservequote = initialquote
    this.liquidity = liquidity
    this.cal = cal
    // ===== Calculations using State ====-
    this.tau = this.calcTau() // maturity - lastTimestamp
    this._invariant = overrideInvariant ? overrideInvariant : parseFixedPointX64(0)
    this._reservebase = overridebase ? overridebase : this.getbaseGivenquote(this._reservequote)
  }

  get invariant(): FixedPointX64 {
    return this._invariant
  }

  set invariant(i: FixedPointX64) {
    this._invariant = i
  }

  get reservequote(): Wei {
    return this._reservequote
  }

  get reservebase(): Wei {
    return this._reservebase
  }

  set reservequote(r: Wei) {
    this._reservequote = r
  }

  set reservebase(r: Wei) {
    this._reservebase = r
  }

  /**
   * @param reservequote Amount of quote tokens in reserve
   * @return reservebase Expected amount of base token reserves
   */
  getbaseGivenquote(reservequote: Wei, noInvariant?: boolean): Wei {
    const decimals = this._reservebase.decimals
    let invariant = this._invariant.parsed

    let base = getbaseGivenquote(
      reservequote.float,
      this.cal.strike.float,
      this.cal.sigma.float,
      this.tau.years,
      noInvariant ? 0 : invariant
    )

    if (isNaN(base)) return parseWei(0, decimals)
    return parseWei(base, decimals)
  }

  /**
   *
   * @param reservebase Amount of base tokens in reserve
   * @return reservequote Expected amount of quote token reserves
   */
  getquoteGivenbase(reservebase: Wei, noInvariant?: boolean): Wei {
    const decimals = this._reservequote.decimals
    let invariant = this._invariant.parsed

    let quote = getquoteGivenbase(
      reservebase.float,
      this.cal.strike.float,
      this.cal.sigma.float,
      this.tau.years,
      noInvariant ? 0 : invariant
    )

    if (isNaN(quote)) return parseWei(0, decimals)
    return parseWei(quote, decimals)
  }

  /**
   * @return tau Calculated tau using this Pool's maturity timestamp and lastTimestamp
   */
  calcTau(): Time {
    this.tau = this.cal.maturity.sub(this.cal.lastTimestamp)
    return this.tau
  }

  /**
   * @return invariant Calculated invariant using this Pool's state
   */
  getAndSetNewInvariant(): FixedPointX64 {
    const quote = this._reservequote.float / this.liquidity.float
    const base = this._reservebase.float / this.liquidity.float
    let invariant = calcInvariant(quote, base, this.cal.strike.float, this.cal.sigma.float, this.tau.years)
    invariant = Math.floor(invariant * Math.pow(10, 18))
    this._invariant = new FixedPointX64(
      toBN(invariant === NaN ? 0 : invariant)
        .mul(FixedPointX64.Denominator)
        .div(PRECISION.raw)
    )
    return this._invariant
  }

  /**
   * @notice A quote to base token swap
   */
  swapAmountInquote(deltaIn: Wei, invariantLast = this._invariant): DebugReturn {
    if (deltaIn.raw.isNegative()) return this.defaultSwapReturn
    const reservebaseLast = this._reservebase
    const reservequoteLast = this._reservequote

    // 0. Calculate the new quote reserves (we know the new quote reserves because we are swapping in quote)
    const deltaInWithFee = deltaIn.mul(GAMMA).div(PERCENTAGE)
    // 1. Calculate the new base reserve using the new quote reserve
    const newquoteReserve = reservequoteLast.add(deltaInWithFee).mul(PRECISION).div(this.liquidity)

    const newReservebase = this.getbaseGivenquote(newquoteReserve).mul(this.liquidity).div(PRECISION)

    if (newReservebase.raw.isNegative()) return this.defaultSwapReturn

    const deltaOut = reservebaseLast.sub(newReservebase)

    this._reservequote = this._reservequote.add(deltaIn)
    this._reservebase = this._reservebase.sub(deltaOut)

    // 2. Calculate the new invariant with the new reserve values
    const nextInvariant = this.getAndSetNewInvariant()
    // 3. Check the nextInvariant is >= invariantLast in the fee-less case, set it if valid
    if (nextInvariant.percentage < invariantLast.percentage)
      console.log('invariant not passing', `${nextInvariant.percentage} < ${invariantLast.percentage}`)

    const effectivePriceOutbase = deltaOut
      .mul(parseWei(1, 18 - deltaOut.decimals))
      .div(deltaIn.mul(parseWei(1, 18 - deltaIn.decimals))) // base per quote

    return { invariantLast, deltaInWithFee, nextInvariant, deltaOut, pool: this, effectivePriceOutbase }
  }

  virtualSwapAmountInquote(deltaIn: Wei, invariantLast = this.getAndSetNewInvariant()): DebugReturn {
    if (deltaIn.raw.isNegative()) return this.defaultSwapReturn
    const reservequoteLast = this._reservequote
    const reservebaseLast = this._reservebase
    const deltaInWithFee = deltaIn.mul(GAMMA).div(PERCENTAGE)

    const newReservequote = reservequoteLast.add(deltaInWithFee).mul(PRECISION).div(this.liquidity)

    const newReservebase = this.getbaseGivenquote(newReservequote).mul(this.liquidity).div(PRECISION)

    if (newReservebase.raw.isNegative()) return this.defaultSwapReturn

    const deltaOut = reservebaseLast.sub(newReservebase)

    const quote = reservequoteLast.add(deltaIn).float / this.liquidity.float
    const base = reservebaseLast.sub(deltaOut).float / this.liquidity.float
    let nextInvariant: any = calcInvariant(quote, base, this.cal.strike.float, this.cal.sigma.float, this.tau.years)
    nextInvariant = Math.floor(nextInvariant * Math.pow(10, 18))
    nextInvariant = new FixedPointX64(toBN(nextInvariant).mul(FixedPointX64.Denominator).div(PRECISION.raw))
    const effectivePriceOutbase = deltaOut
      .mul(parseWei(1, 18 - deltaOut.decimals))
      .div(deltaIn.mul(parseWei(1, 18 - deltaIn.decimals)))

    return {
      invariantLast,
      deltaInWithFee,
      nextInvariant,
      deltaOut,
      pool: clonePool(this, this._reservequote.add(deltaIn), this._reservebase.sub(deltaOut)),
      effectivePriceOutbase,
    }
  }

  /**
   * @notice A base to quote token swap
   */
  swapAmountInbase(deltaIn: Wei, invariantLast = this._invariant): DebugReturn {
    if (deltaIn.raw.isNegative()) return this.defaultSwapReturn
    const reservequoteLast = this._reservequote
    const reservebaseLast = this._reservebase

    // Important: Updates the invariant and tau state of this pool

    // 0. Calculate the new quote reserve since we know how much quote is being swapped out
    const deltaInWithFee = deltaIn.mul(GAMMA).div(PERCENTAGE)
    // 1. Calculate the new quote reserves using the known new base reserves
    const newReservebase = reservebaseLast.add(deltaInWithFee).mul(PRECISION).div(this.liquidity)

    const newReservequote = this.getquoteGivenbase(newReservebase).mul(this.liquidity).div(PRECISION)

    if (newReservequote.raw.isNegative()) return this.defaultSwapReturn

    const deltaOut = reservequoteLast.sub(newReservequote)

    this._reservebase = this._reservebase.add(deltaIn)
    this._reservequote = this._reservequote.sub(deltaOut)

    // 2. Calculate the new invariant with the new reserves
    const nextInvariant = this.getAndSetNewInvariant()
    // 3. Check the nextInvariant is >= invariantLast
    if (nextInvariant.parsed < invariantLast.parsed)
      console.log('invariant not passing', `${nextInvariant.parsed} < ${invariantLast.parsed}`)

    // 4. Calculate the change in quote reserve by comparing new reserve to previous
    const effectivePriceOutbase = deltaIn
      .mul(parseWei(1, 18 - deltaIn.decimals))
      .div(deltaOut.mul(parseWei(1, 18 - deltaOut.decimals))) // base per quote

    return { invariantLast, deltaInWithFee, nextInvariant, deltaOut, pool: this, effectivePriceOutbase }
  }

  virtualSwapAmountInbase(deltaIn: Wei, invariantLast = this._invariant): DebugReturn {
    if (deltaIn.raw.isNegative()) return this.defaultSwapReturn
    const reservequoteLast = this._reservequote
    const reservebaseLast = this._reservebase
    const deltaInWithFee = deltaIn.mul(GAMMA).div(PERCENTAGE)

    const newReservebase = reservebaseLast.add(deltaInWithFee).mul(PRECISION).div(this.liquidity)

    const newReservequote = this.getquoteGivenbase(newReservebase).mul(this.liquidity).div(PRECISION)

    if (newReservequote.raw.isNegative()) return this.defaultSwapReturn

    const deltaOut = reservequoteLast.sub(newReservequote)

    const quote = reservequoteLast.sub(deltaOut).float / this.liquidity.float
    const base = reservebaseLast.add(deltaIn).float / this.liquidity.float

    let nextInvariant: any = calcInvariant(quote, base, this.cal.strike.float, this.cal.sigma.float, this.tau.years)
    nextInvariant = Math.floor(nextInvariant * Math.pow(10, 18))
    nextInvariant = new FixedPointX64(toBN(nextInvariant).mul(FixedPointX64.Denominator).div(PRECISION.raw))

    const effectivePriceOutbase = deltaIn
      .mul(parseWei(1, 18 - deltaIn.decimals))
      .div(deltaOut.mul(parseWei(1, 18 - deltaOut.decimals)))

    return {
      invariantLast,
      deltaInWithFee,
      nextInvariant,
      deltaOut,
      pool: clonePool(this, this._reservequote.sub(deltaOut), this._reservebase.add(deltaIn)),
      effectivePriceOutbase,
    }
  }

  get spotPrice(): Wei {
    const quote = this._reservequote.float / this.liquidity.float
    const strike = this.cal.strike.float
    const sigma = this.cal.sigma.float
    const tau = this.tau.years
    const spot = getSpotPriceApproximation(quote, strike, sigma, tau)
    return parseWei(spot)
  }

  /**
   * @notice See https://arxiv.org/pdf/2012.08040.pdf
   * @param amountIn Amount of quote token to add to quote reserve
   * @return Marginal price after a trade with size `amountIn` with the current reserves.
   */
  getMarginalPriceSwapquoteIn(amountIn: number) {
    if (!nonNegative(amountIn)) return 0
    const gamma = 1 - VirtualPool.FEE
    const reservequote = this._reservequote.float / this.liquidity.float
    //const invariant = this._invariant
    const strike = this.cal.strike
    const sigma = this.cal.sigma
    const tau = this.tau
    const step0 = 1 - reservequote - gamma * amountIn
    const step1 = sigma.float * Math.sqrt(tau.years)
    const step2 = quantilePrime(step0)
    const step3 = gamma * strike.float
    const step4 = inverse_std_n_cdf(step0)
    const step5 = std_n_pdf(step4 - step1)
    return step3 * step5 * step2
  }

  /**
   * @notice See https://arxiv.org/pdf/2012.08040.pdf
   * @param amountIn Amount of base token to add to base reserve
   * @return Marginal price after a trade with size `amountIn` with the current reserves.
   */
  getMarginalPriceSwapbaseIn(amountIn: number) {
    if (!nonNegative(amountIn)) return 0
    const gamma = 1 - VirtualPool.FEE
    const reservebase = this._reservebase.float / this.liquidity.float
    const invariant = this._invariant
    const strike = this.cal.strike
    const sigma = this.cal.sigma
    const tau = this.tau
    const step0 = (reservebase + gamma * amountIn - invariant.parsed / Math.pow(10, 18)) / strike.float
    const step1 = sigma.float * Math.sqrt(tau.years)
    const step3 = inverse_std_n_cdf(step0)
    const step4 = std_n_pdf(step3 + step1)
    const step5 = step0 * (1 / strike.float)
    const step6 = quantilePrime(step5)
    const step7 = gamma * step4 * step6
    return 1 / step7
  }

  getMaxDeltaIn(quoteForbase: boolean): Wei {
    if (quoteForbase) {
      const quotePerLiquidity = this._reservequote.mul(PRECISION).div(this.liquidity)
      return parseWei(1, this.cal.decimalsquote).sub(quotePerLiquidity).mul(this.liquidity).div(PRECISION)
    } else {
      const basePerLiquidity = this._reservebase.mul(PRECISION).div(this.liquidity)
      return this.cal.strike.sub(basePerLiquidity).mul(this.liquidity).div(PRECISION)
    }
  }

  getMaxDeltaOut(quoteForbase: boolean): Wei {
    if (quoteForbase) {
      return this._reservebase
    } else {
      return this._reservequote
    }
  }

  private get defaultSwapReturn(): SwapReturn {
    return { deltaOut: parseWei(0), pool: this, effectivePriceOutbase: parseWei(0) }
  }
}
