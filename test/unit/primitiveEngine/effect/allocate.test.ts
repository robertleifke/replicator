import { ethers } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { parseWei, Time, Wei } from 'web3-units'
import { parseEther } from '@ethersproject/units'

import expect from '../../.../../../shared/expect'
import { testContext } from '../../.../../../shared/testContext'
import { PoolState, TestPools } from '../../.../../../shared/poolConfigs'
import { engineFixture } from '../../.../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll, useMargin } from '../../.../../../shared/hooks'
import { createFixtureLoader } from 'ethereum-waffle'

const { HashZero } = constants

// for each calibration, run the tests
TestPools.forEach(function (pool: PoolState) {
  testContext(`allocate to ${pool.description} pool`, function () {
    // curve parameters
    const { decimalsquote, decimalsbase } = pool.calibration
    // environment variables
    let poolId: string, delLiquidity: Wei, delquote: Wei, delbase: Wei

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

      await useTokens(this.signers[0], this.contracts, pool.calibration) // mints tokens
      await useApproveAll(this.signers[0], this.contracts) // approves tokens
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration)) // calls create()
      await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address) // allocates liq

      const amount = parseWei('1000', 18)
      const res = await this.contracts.engine.reserves(poolId)
      delLiquidity = amount
      delquote = amount.mul(res.reservequote).div(res.liquidity)
      delbase = amount.mul(res.reservebase).div(res.liquidity)
    })

    describe('when allocating from margin', function () {
      beforeEach(async function () {
        await useMargin(
          this.signers[0],
          this.contracts,
          parseWei('1000').add(delquote),
          parseWei('1000').add(delbase),
          this.contracts.router.address
        )
        poolId = pool.calibration.poolId(this.contracts.engine.address)
      })

      describe('success cases', function () {
        it('increases position liquidity', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increasePositionLiquidity(this.contracts.engine, this.contracts.router.address, poolId, delLiquidity.raw)
        })

        it('increases position liquidity of another recipient', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.signers[1].address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increasePositionLiquidity(this.contracts.engine, this.signers[1].address, poolId, delLiquidity.raw)
        })

        it('emits the Allocate event', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.emit(this.contracts.engine, 'Allocate')
        })

        it('increases reserve liquidity', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
        })

        it('increases reserve quote', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increaseReservequote(this.contracts.engine, poolId, delquote.raw)
        })

        it('increases reserve base', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increaseReservebase(this.contracts.engine, poolId, delbase.raw)
        })

        it('updates reserve timestamp', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
        })
      })

      describe('fail cases', function () {
        it('reverts if reserve.blockTimestamp is 0 (poolId not initialized)', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              HashZero,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if quote or base margins are insufficient', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              parseEther('1000000000'),
              delbase.raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if there is no liquidity', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              HashZero,
              this.signers[0].address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if the deltas are 0', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.signers[0].address, '0', '0', HashZero)
          ).to.reverted
        })

        it('reverts if pool is expired', async function () {
          await this.contracts.engine.advanceTime(Time.YearInSeconds + 1)
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.signers[0].address, '0', '0', HashZero)
          ).to.reverted
        })
      })
    })

    describe('when allocating from external', function () {
      describe('success cases', function () {
        it('increases liquidity', async function () {
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increasePositionLiquidity(this.contracts.engine, this.contracts.router.address, poolId, delLiquidity.raw)
        })

        it('increases position liquidity of another recipient', async function () {
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.signers[1].address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increasePositionLiquidity(this.contracts.engine, this.signers[1].address, poolId, delLiquidity.raw)
        })

        it('emits the Allocate event', async function () {
          await expect(
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.emit(this.contracts.engine, 'Allocate')
        })

        it('increases reserve liquidity', async function () {
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
        })

        it('increases reserve quote', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delquote = parseWei('1').mul(res.reservequote).div(res.liquidity)
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increaseReservequote(this.contracts.engine, poolId, delquote.raw)
        })

        it('increases reserve base', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delbase = parseWei('1').mul(res.reservebase).div(res.liquidity)
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.increaseReservebase(this.contracts.engine, poolId, delbase.raw)
        })

        it('updates reserve timestamp', async function () {
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              delbase.raw,
              HashZero
            )
          ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
        })

        it('transfers the tokens', async function () {
          const reserve = await this.contracts.engine.reserves(poolId)

          const deltaX = parseWei('1').mul(reserve.reservequote).div(reserve.liquidity)
          const deltaY = parseWei('1').mul(reserve.reservebase).div(reserve.liquidity)

          const quoteBalance = await this.contracts.quote.balanceOf(this.signers[0].address)
          const baseBalance = await this.contracts.base.balanceOf(this.signers[0].address)

          await this.contracts.router.allocateFromExternal(
            poolId,
            this.contracts.router.address,
            delquote.raw,
            delbase.raw,
            HashZero
          )

          expect(await this.contracts.quote.balanceOf(this.signers[0].address)).to.equal(quoteBalance.sub(delquote.raw))
          expect(await this.contracts.base.balanceOf(this.signers[0].address)).to.equal(
            baseBalance.sub(delbase.raw)
          )
        })
      })

      describe('fail cases', function () {
        it('reverts if quote are insufficient', async function () {
          await expect(
            this.contracts.router.allocateFromExternalNoquote(
              poolId,
              this.contracts.router.address,
              parseWei('10').raw,
              delbase.raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if base are insufficient', async function () {
          await expect(
            this.contracts.router.allocateFromExternalNobase(
              poolId,
              this.contracts.router.address,
              delquote.raw,
              parseWei('10000').raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts on reentrancy', async function () {
          await expect(
            this.contracts.router.allocateFromExternalReentrancy(
              poolId,
              this.contracts.router.address,
              parseWei('1').raw,
              parseWei('1').raw,
              HashZero
            )
          ).to.be.reverted
        })
      })
    })
  })
})
