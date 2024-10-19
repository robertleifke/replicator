import { parseWei, Percentage, Time, Wei, toBN, parsePercentage } from 'web3-units'
import { callDelta, callPremium } from '@primitivefi/rmm-math'
import { computePoolId } from './utils'

/**
 * Constructs a Calibration entity from floating point decimal numbers.
 *
 * @remarks
 * Converts to proper units, e.g. a floating point number to a wei value for the strike price.
 *
 * @returns calibration entity of the parameters.
 *
 * @beta
 */
export function parseCalibration(
  strike: number,
  sigma: number,
  maturity: number,
  gamma: number,
  lastTimestamp: number,
  referencePrice = 0,
  decimalsquote = 18,
  decimalsbase = 18
): Calibration {
  const cal = {
    strike: parseWei(strike, decimalsbase),
    sigma: parsePercentage(sigma),
    maturity: new Time(maturity), // in seconds, because `block.timestamp` is in seconds
    lastTimestamp: new Time(lastTimestamp), // in seconds, because `block.timestamp` is in seconds
    gamma: parsePercentage(gamma),
    referencePrice: parseWei(referencePrice, decimalsbase),
  }
  return new Calibration(
    cal.strike,
    cal.sigma,
    cal.maturity,
    cal.lastTimestamp,
    cal.referencePrice,
    cal.gamma,
    decimalsquote,
    decimalsbase
  )
}

/**
 * @notice Calibration Struct; Class representation of each Curve's parameters
 */
export class Calibration {
  /** Strike price with the same precision as the base asset. */
  readonly strike: Wei

  /** Volatility as a Percentage instance with 4 precision. */
  readonly sigma: Percentage

  /** Time class with a raw value in seconds. */
  readonly maturity: Time

  /** Gamma, equal to 1 - fee %, as a Percentage instance with 4 precision. */
  readonly gamma: Percentage

  /** Time until expiry is calculated from the difference of current timestamp and this. */
  public readonly lastTimestamp: Time

  /** Price of quote token in base token units with precision base decimals. */
  public readonly referencePrice: Wei

  /** Decimals of quote asset. */
  public readonly decimalsquote: number

  /** Decimals of base asset. */
  public readonly decimalsbase: number

  /**
   *
   * @param strike          Strike price as a float
   * @param sigma           Volatility percentage as a float, e.g. 1 = 100%
   * @param maturity        Timestamp in seconds
   * @param lastTimestamp   Timestamp in seconds
   * @param referencePrice  Value of quote asset in units of base asset
   */
  constructor(
    strike: Wei,
    sigma: Percentage,
    maturity: Time,
    lastTimestamp: Time,
    referencePrice: Wei,
    gamma: Percentage,
    decimalsquote: number = 18,
    decimalsbase: number = 18
  ) {
    this.strike = strike
    this.sigma = sigma
    this.maturity = maturity
    this.lastTimestamp = lastTimestamp
    this.referencePrice = referencePrice
    this.gamma = gamma
    this.decimalsquote = decimalsquote
    this.decimalsbase = decimalsbase
  }

  /**
   * @notice Scaling factor of quote asset, 18 - quote decimals
   */
  get scaleFactorquote(): number {
    return Math.pow(10, 18 - this.decimalsquote)
  }

  /**
   * @notice Scaling factor of base asset, 18 - base decimals
   */
  get scaleFactorbase(): number {
    return Math.pow(10, 18 - this.decimalsbase)
  }

  get MIN_LIQUIDITY(): number {
    return (this.decimalsbase > this.decimalsquote ? this.decimalsquote : this.decimalsbase) / 6
  }

  /**
   * @returns Time until expiry
   */
  get tau(): Time {
    return this.maturity.sub(this.lastTimestamp)
  }

  /**
   * @returns Change in pool premium wrt change in underlying referencePrice price
   */
  get delta(): number {
    return callDelta(this.strike.float, this.sigma.float, this.tau.years, this.referencePrice.float)
  }

  /**
   * @returns Black-Scholes implied premium
   */
  get premium(): number {
    return callPremium(this.strike.float, this.sigma.float, this.tau.years, this.referencePrice.float)
  }

  /**
   * @returns Spot price is above strike price
   */
  get inTheMoney(): boolean {
    return this.strike.float >= this.referencePrice.float
  }

  poolId(engine: string): string {
    return computePoolId(
      engine,
      this.strike.toString(),
      this.sigma.toString(),
      this.maturity.toString(),
      this.gamma.toString()
    )
  }
}
