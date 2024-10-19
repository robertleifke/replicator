import { ethers } from 'hardhat'
import { Fixture } from 'ethereum-waffle'
import { Libraries } from '../../types'
import * as ContractTypes from '../../typechain'
import { TestGetbaseGivenquote, TestCalcInvariant } from '../../typechain'
import MockEngineArtifact from '../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'

interface FactoryFixture {
  factory: ContractTypes.MockFactory
}

async function factoryFixture(): Promise<FactoryFixture> {
  const factoryFactory = await ethers.getContractFactory('MockFactory')
  const factory = (await factoryFactory.deploy()) as ContractTypes.MockFactory
  return { factory }
}

interface TokensFixture {
  quote: ContractTypes.TestToken
  base: ContractTypes.TestToken
}

async function tokensFixture(decimalsquote: number, decimalsbase: number): Promise<TokensFixture> {
  const tokenFactory = await ethers.getContractFactory('TestToken')
  const quote = (await tokenFactory.deploy('Test quote 0', 'quote0', decimalsquote)) as ContractTypes.TestToken
  const base = (await tokenFactory.deploy('Test base 1', 'base1', decimalsbase)) as ContractTypes.TestToken

  return { quote, base }
}

export interface EngineFixture {
  factory: ContractTypes.MockFactory
  factoryDeploy: ContractTypes.FactoryDeploy
  router: ContractTypes.TestRouter
  createEngine(
    decimalsquote: number,
    decimalsbase: number
  ): Promise<{ engine: ContractTypes.MockEngine; quote: ContractTypes.TestToken; base: ContractTypes.TestToken }>
}

export const engineFixture: Fixture<EngineFixture> = async function (): Promise<EngineFixture> {
  const { factory } = await factoryFixture()

  const factoryDeployFactory = await ethers.getContractFactory('FactoryDeploy')

  const factoryDeploy = (await factoryDeployFactory.deploy()) as ContractTypes.FactoryDeploy
  const tx = await factoryDeploy.initialize(factory.address)
  await tx.wait()

  const routerContractFactory = await ethers.getContractFactory('TestRouter')

  // The engine MUST be set in the router, once one has been deployed
  const router = (await routerContractFactory.deploy(ethers.constants.AddressZero)) as ContractTypes.TestRouter

  return {
    factory,
    factoryDeploy,
    router,
    createEngine: async (decimalsquote: number, decimalsbase: number) => {
      const { quote, base } = await tokensFixture(decimalsquote, decimalsbase)
      const tx = await factory.deploy(quote.address, base.address)
      await tx.wait()
      const addr = await factory.getEngine(quote.address, base.address)
      const engine = (await ethers.getContractAt(MockEngineArtifact.abi, addr)) as unknown as ContractTypes.MockEngine
      await router.setEngine(engine.address)
      return { engine, quote, base }
    },
  }
}

export interface LibraryFixture {
  libraries: Libraries
}

export const librariesFixture: Fixture<LibraryFixture> = async function (): Promise<LibraryFixture> {
  const libraries: Libraries = {} as Libraries

  const reserveFactory = await ethers.getContractFactory('TestReserve')
  const marginFactory = await ethers.getContractFactory('TestMargin')
  const replicationFactory = await ethers.getContractFactory('TestReplicationMath')
  const cdfFactory = await ethers.getContractFactory('TestCumulativeNormalDistribution')

  libraries.testReserve = (await reserveFactory.deploy()) as ContractTypes.TestReserve

  libraries.testMargin = (await marginFactory.deploy()) as ContractTypes.TestMargin

  libraries.testReplicationMath = (await replicationFactory.deploy()) as ContractTypes.TestReplicationMath

  libraries.testCumulativeNormalDistribution =
    (await cdfFactory.deploy()) as ContractTypes.TestCumulativeNormalDistribution

  return { libraries }
}

export interface TestStepFixture extends LibraryFixture {
  getbaseGivenquote: TestGetbaseGivenquote
  calcInvariant: TestCalcInvariant
}

export const replicationLibrariesFixture: Fixture<TestStepFixture> = async function (
  [wallet],
  provider
): Promise<TestStepFixture> {
  const libraries = await librariesFixture([wallet], provider)

  const basequoteFactory = await ethers.getContractFactory('TestGetbaseGivenquote')
  const getbaseGivenquote = (await basequoteFactory.deploy()) as TestGetbaseGivenquote
  await getbaseGivenquote.deployed()

  const invariantFactory = await ethers.getContractFactory('TestCalcInvariant')
  const calcInvariant = (await invariantFactory.deploy()) as TestCalcInvariant
  await calcInvariant.deployed()
  return {
    getbaseGivenquote,
    calcInvariant,
    ...libraries,
  }
}
