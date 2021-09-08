import { Wallet, BigNumber } from 'ethers'
import { Calibration } from '../test/shared/calibration'
import * as ContractTypes from '../typechain'
import { Fixture } from '@ethereum-waffle/provider'

export interface Contracts {
  engine: ContractTypes.MockEngine
  factory: ContractTypes.MockFactory
  risky: ContractTypes.TestToken
  stable: ContractTypes.TestToken
  router: ContractTypes.TestRouter
  factoryDeploy: ContractTypes.FactoryDeploy
  testReserve: ContractTypes.TestReserve
  testMargin: ContractTypes.TestMargin
  testPosition: ContractTypes.TestPosition
  testReplicationMath: ContractTypes.TestReplicationMath
  testCumulativeNormalDistribution: ContractTypes.TestCumulativeNormalDistribution
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
    configs: Configs
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>
  }
}

type ContractName =
  | 'engineCreate'
  | 'engineDeposit'
  | 'engineSwap'
  | 'engineWithdraw'
  | 'engineAllocate'
  | 'factoryCreate'
  | 'factoryDeploy'
  | 'testReserve'
  | 'testMargin'
  | 'testPosition'
  | 'testReplicationMath'
  | 'testCumulativeNormalDistribution'
  | 'engineRemove'
  | 'engineSupply'
  | 'engineBorrow'
  | 'engineRepay'
  | 'badEngineDeposit'
  | 'reentrancyAttacker'

declare global {
  export namespace Chai {
    interface Assertion {
      revertWithCustomError(errorName: string, params: any[]): AsyncAssertion
      increaseMargin(
        engine: ContractTypes.PrimitiveEngine,
        account: string,
        risky: BigNumber,
        stable: BigNumber
      ): AsyncAssertion
      decreaseMargin(
        engine: ContractTypes.PrimitiveEngine,
        account: string,
        risky: BigNumber,
        stable: BigNumber
      ): AsyncAssertion
      increasePositionFloat(engine: ContractTypes.PrimitiveEngine, posId: string, float: BigNumber): AsyncAssertion
      decreasePositionFloat(engine: ContractTypes.PrimitiveEngine, posId: string, float: BigNumber): AsyncAssertion
      increasePositionLiquidity(engine: ContractTypes.PrimitiveEngine, posId: string, liquidity: BigNumber): AsyncAssertion
      decreasePositionLiquidity(engine: ContractTypes.PrimitiveEngine, posId: string, liquidity: BigNumber): AsyncAssertion
      increasePositionDebt(
        engine: ContractTypes.PrimitiveEngine,
        posId: string,
        collateralRisky: BigNumber,
        collateralStable: BigNumber
      ): AsyncAssertion
      decreasePositionDebt(
        engine: ContractTypes.PrimitiveEngine,
        posId: string,
        collateralRisky: BigNumber,
        collateralStable: BigNumber
      ): AsyncAssertion
      increasePositionFeeRiskyGrowthLast(
        engine: ContractTypes.PrimitiveEngine,
        posId: string,
        amount: BigNumber
      ): AsyncAssertion
      increasePositionFeeStableGrowthLast(
        engine: ContractTypes.PrimitiveEngine,
        posId: string,
        amount: BigNumber
      ): AsyncAssertion
      increaseReserveRisky(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveRisky(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveStable(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveStable(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveLiquidity(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveLiquidity(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveFloat(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveFloat(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveCollateralRisky(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        amount: BigNumber
      ): AsyncAssertion
      decreaseReserveCollateralRisky(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        amount: BigNumber
      ): AsyncAssertion
      increaseReserveCollateralStable(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        amount: BigNumber
      ): AsyncAssertion
      decreaseReserveCollateralStable(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        amount: BigNumber
      ): AsyncAssertion
      increaseReserveFeeRiskyGrowth(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveFeeStableGrowth(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        amount: BigNumber
      ): AsyncAssertion
      updateReserveBlockTimestamp(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        blockTimestamp: number
      ): AsyncAssertion
      updateReserveCumulativeRisky(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        amount: BigNumber,
        blockTimestamp: number
      ): AsyncAssertion
      updateReserveCumulativeStable(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        amount: BigNumber,
        blockTimestamp: number
      ): AsyncAssertion
    }
  }
}
