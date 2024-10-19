import { Wallet, BigNumber } from 'ethers'
import { Calibration } from '../test/shared/calibration'
import * as ContractTypes from '../typechain'
import { Fixture } from '@ethereum-waffle/provider'
import { SwapTestCase } from '../test/unit/engine/effect/swap.test'
import { Wei } from 'web3-units'

export type Awaited<T> = T extends PromiseLike<infer U> ? U : T

export interface Libraries {
  testReserve: ContractTypes.TestReserve
  testMargin: ContractTypes.TestMargin
  testReplicationMath: ContractTypes.TestReplicationMath
  testCumulativeNormalDistribution: ContractTypes.TestCumulativeNormalDistribution
}

export interface Contracts {
  engine: ContractTypes.MockEngine
  factory: ContractTypes.MockFactory
  quote: ContractTypes.TestToken
  base: ContractTypes.TestToken
  router: ContractTypes.TestRouter
  factoryDeploy: ContractTypes.FactoryDeploy
}

export interface Configs {
  all: Calibration[]
  strikes: Calibration[]
  sigmas: Calibration[]
  maturities: Calibration[]
  spots: Calibration[]
}

declare module 'mocha' {
  export interface Context {
    signers: Wallet[]
    contracts: Contracts
    libraries: Libraries
    configs: Configs
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>
  }
}

type ContractName =
  | 'testRouter'
  | 'factoryCreate'
  | 'factoryDeploy'
  | 'testReserve'
  | 'testMargin'
  | 'testPosition'
  | 'testReplicationMath'
  | 'testCumulativeNormalDistribution'

export type EngineTypes = ContractTypes.engine | ContractTypes.MockEngine

declare global {
  export namespace Chai {
    interface Assertion {
      revertWithCustomError(errorName: string, params?: any[], chainId?: number): AsyncAssertion
      increaseMargin(engine: EngineTypes, account: string, quote: BigNumber, base: BigNumber): AsyncAssertion
      decreaseMargin(engine: EngineTypes, account: string, quote: BigNumber, base: BigNumber): AsyncAssertion
      increasePositionLiquidity(
        engine: EngineTypes,
        account: string,
        poolId: string,
        liquidity: BigNumber
      ): AsyncAssertion
      decreasePositionLiquidity(
        engine: EngineTypes,
        account: string,
        poolId: string,
        liquidity: BigNumber
      ): AsyncAssertion
      increaseReservequote(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReservequote(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReservebase(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReservebase(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveLiquidity(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveLiquidity(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      updateReserveBlockTimestamp(engine: EngineTypes, poolId: string, blockTimestamp: number): AsyncAssertion
      updateReserveCumulativequote(
        engine: EngineTypes,
        poolId: string,
        amount: BigNumber,
        blockTimestamp: number
      ): AsyncAssertion
      updateReserveCumulativebase(
        engine: EngineTypes,
        poolId: string,
        amount: BigNumber,
        blockTimestamp: number
      ): AsyncAssertion

      updateSpotPrice(engine: EngineTypes, cal: Calibration, quoteForbase: boolean): AsyncAssertion
      decreaseSwapOutBalance(
        engine: EngineTypes,
        tokens: any[],
        receiver: string,
        poolId: string,
        { quoteForbase, toMargin }: { quoteForbase: boolean; toMargin: boolean },
        amountOut?: Wei
      ): AsyncAssertion
      increaseInvariant(engine: EngineTypes, poolId: string): AsyncAssertion
    }
  }
}
