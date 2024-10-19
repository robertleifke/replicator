import { ethers } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { createFixtureLoader, deployMockContract } from 'ethereum-waffle'

import expect from '../../.../../../shared/expect'
import { computeEngineAddress } from '../../../shared'
import { testContext } from '../../.../../../shared/testContext'
import { PoolState, TestPools } from '../../.../../../shared/poolConfigs'
import { engineFixture } from '../../.../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll } from '../../.../../../shared/hooks'

import { abi as TestToken } from '../../../../artifacts/contracts/test/TestToken.sol/TestToken.json'
import { bytecode } from '../../../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'

TestPools.forEach(function (pool: PoolState) {
  testContext(`deploy engines`, function () {
    const { decimalsquote, decimalsbase } = pool.calibration

    let loadFixture: ReturnType<typeof createFixtureLoader>
    let signer: Wallet, other: Wallet
    before(async function () {
      ;[signer, other] = await (ethers as any).getSigners()
      loadFixture = createFixtureLoader([signer, other])
    })

    beforeEach(async function () {
      const fixture = await loadFixture(engineFixture)
      const { factory, factoryDeploy, router } = fixture
      const { engine, quote, base } = await fixture.createEngine(decimalsquote, decimalsbase)
      this.contracts = { factory, factoryDeploy, router, engine, quote, base }
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      await usePool(this.signers[0], this.contracts, pool.calibration)
      await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address)
    })

    describe('when the parameters are valid', function () {
      let deployer

      beforeEach(async function () {
        deployer = this.signers[0]
      })

      it('deploys a new engine', async function () {
        let mockquote = await deployMockContract(deployer, TestToken)
        let mockbase = await deployMockContract(deployer, TestToken)
        await mockquote.mock.decimals.returns(18)
        await mockbase.mock.decimals.returns(18)
        expect(await this.contracts.factory.getEngine(mockquote.address, mockbase.address)).to.equal(
          constants.AddressZero
        )
        await this.contracts.factoryDeploy.deploy(mockquote.address, mockbase.address)
      })

      it('emits the DeployEngine event', async function () {
        const [deployer] = this.signers

        let mockquote = await deployMockContract(deployer, TestToken)
        let mockbase = await deployMockContract(deployer, TestToken)
        await mockquote.mock.decimals.returns(18)
        await mockbase.mock.decimals.returns(18)
        const engineAddress = computeEngineAddress(
          this.contracts.factory.address,
          mockquote.address,
          mockbase.address,
          bytecode
        )

        await expect(this.contracts.factoryDeploy.deploy(mockquote.address, mockbase.address))
          .to.emit(this.contracts.factory, 'DeployEngine')
          .withArgs(this.contracts.factoryDeploy.address, mockquote.address, mockbase.address, engineAddress)
      })
    })

    describe('when the parameters are invalid', function () {
      it('reverts when tokens are the same', async function () {
        await expect(
          this.contracts.factoryDeploy.deploy(this.contracts.quote.address, this.contracts.quote.address)
        ).to.be.revertedWith('SameTokenError()')
      })

      it('reverts when the quote asset is address 0', async function () {
        await expect(
          this.contracts.factoryDeploy.deploy(constants.AddressZero, this.contracts.base.address)
        ).to.be.revertedWith('ZeroAddressError()')
      })

      it('reverts when the base asset is address 0', async function () {
        await expect(
          this.contracts.factoryDeploy.deploy(this.contracts.quote.address, constants.AddressZero)
        ).to.be.revertedWith('ZeroAddressError()')
      })
    })
  })
})
