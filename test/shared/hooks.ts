import { ethers } from 'ethers'
import { parseWei, Wei } from 'web3-units'
import { Wallet } from '@ethersproject/wallet'
import { Contracts } from '../../types'
import { Calibration } from './calibration'
import { computePoolId } from './utils'
const { HashZero, MaxUint256 } = ethers.constants

export interface Tx {
  tx: any
}

export interface UsePool extends Tx {
  poolId: string
}

export interface UseLiquidity extends UsePool {
  posId: string
}

export async function usePool(
  signer: Wallet,
  contracts: Contracts,
  config: Calibration,
  debug: boolean = false
): Promise<UsePool> {
  /// get the parameters from the config
  const { strike, sigma, maturity, delta, gamma, decimalsquote } = config

  /// call create on the router contract
  let tx: any
  try {
    tx = await contracts.router
      .connect(signer)
      .create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        gamma.raw,
        parseWei(1, decimalsquote).sub(parseWei(delta, decimalsquote)).raw,
        parseWei('1', 18).raw,
        HashZero
      )
  } catch (err) {
    console.log(`\n   Error thrown on attempting to call create() on the router in usePool()`, err)
  }

  const poolId = config.poolId(contracts.engine.address)

  if (debug) console.log(`\n   Using pool with id: ${poolId.slice(0, 6)}`)

  const receipt = await tx.wait()
  const args = receipt?.events?.[0].args
  if (args) {
    const actualPoolId = computePoolId(contracts.engine.address, args.strike, args.sigma, args.maturity, args.gamma)
    if (actualPoolId !== poolId) throw Error(`\n  PoolIds do not match: ${poolId} != ${actualPoolId}`)
  }

  const res = await contracts.engine.reserves(poolId)

  if (debug)
    console.log(`Created with reserves quote: ${res.reservequote.toString()} base: ${res.reservebase.toString()}`)

  return { tx, poolId }
}

export async function useLiquidity(
  signer: Wallet,
  contracts: Contracts,
  config: Calibration,
  target: string = signer.address,
  debug = false
): Promise<UseLiquidity> {
  const poolId = config.poolId(contracts.engine.address)
  const amount = parseWei('1000', 18)
  const res = await contracts.engine.reserves(poolId)
  const delquote = amount.mul(res.reservequote).div(res.liquidity)
  const delbase = amount.mul(res.reservebase).div(res.liquidity)
  /// call create on the router contract
  let tx: any
  try {
    tx = await contracts.router
      .connect(signer)
      .allocateFromExternal(poolId, target, delquote.raw, delbase.raw, HashZero)
  } catch (err) {
    console.log(`\n   Error thrown on attempting to call allocateFromExternal() on the router`)
  }

  const posId = poolId

  if (debug) console.log(`\n   Provided ${amount.float} liquidity to ${poolId.slice(0, 6)}`)
  return { tx, poolId, posId }
}

export async function useMargin(
  signer: Wallet,
  contracts: Contracts,
  delquote: Wei,
  delbase: Wei,
  target: string = signer.address,
  debug = false
): Promise<{ tx: any }> {
  /// call create on the router contract
  let tx: any
  try {
    tx = await contracts.router.connect(signer).deposit(target, delquote.raw, delbase.raw, HashZero)
  } catch (err) {
    console.log(`\n   Error thrown on attempting to call deposit() on the router`)
  }

  if (debug) console.log(`   Deposited margin acc: ${target.slice(0, 6)},  ${delquote.float} ${delbase.float}`)
  return { tx }
}

export async function useTokens(
  signer: Wallet,
  contracts: Contracts,
  config: Calibration,
  amount: Wei = parseWei('1000000'),
  debug: boolean = false
): Promise<{ tx: any }> {
  // if config precision is not 18, set the tokens to it
  if (config.scaleFactorquote != 0) await contracts.quote.setDecimals(config.decimalsquote)
  if (config.scaleFactorbase != 0) await contracts.base.setDecimals(config.decimalsbase)
  /// mint tokens for the user
  let tx: any
  try {
    tx = await contracts.quote.connect(signer).mint(signer.address, amount.raw)
    tx = await contracts.base.connect(signer).mint(signer.address, amount.raw)
  } catch (err) {
    console.log(`\n   Error thrown on attempting to call mint() on the tokens`)
  }

  if (debug) {
    console.log(`\n   Using tokens with:`)
    console.log(`     - quote decimals: ${config.decimalsquote}`)
    console.log(`     - base decimals: ${config.decimalsbase}`)
  }
  return { tx }
}

export async function useApproveAll(signer: Wallet, contracts: Contracts) {
  const targets = Object.keys(contracts).map((key) => contracts[key].address)

  async function approve(target: string) {
    await contracts.quote.connect(signer).approve(target, MaxUint256)
    await contracts.base.connect(signer).approve(target, MaxUint256)
  }

  for (const target of targets) {
    await approve(target)
  }
}
