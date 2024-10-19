import { ethers } from 'hardhat'
import { parseWei } from 'web3-units'
import { BigNumber, BytesLike, constants, Wallet } from 'ethers'

import expect from '../../shared/expect'
import { librariesFixture } from '../../shared/fixtures'
import { testContext } from '../../shared/testContext'

import { TestReserve } from '../../../typechain'
import { createFixtureLoader } from 'ethereum-waffle'

testContext('testReserve', function () {
  let loadFixture: ReturnType<typeof createFixtureLoader>
  let signer: Wallet, other: Wallet
  before(async function () {
    ;[signer, other] = await (ethers as any).getSigners()
    loadFixture = createFixtureLoader([signer, other])
  })

  beforeEach(async function () {
    const fixture = await loadFixture(librariesFixture)
    this.libraries = fixture.libraries
  })

  describe('reserve library', function () {
    let resId: BytesLike, reserve: TestReserve
    let timestamp: number, reservequote: BigNumber, reservebase: BigNumber
    let before: any, timestep: number

    beforeEach(async function () {
      reserve = this.libraries.testReserve // the test reserve contract
      timestamp = 1645473600 // the timestamp for the tests
      reservequote = parseWei('0.5').raw // initialized quote reserve amount
      reservebase = parseWei('500').raw // initialized base reserve amount
      await reserve.beforeEach('reserve', timestamp, reservequote, reservebase) // init a reserve data struct w/ arbitrary reserves
      resId = await reserve.reserveId() // reserve Id we will manipulate for tests
      before = await reserve.res() // actual reserve data we are manipulating for tests
      timestep = 60 * 60 * 24 // 1 day timestep
    })

    it('should have same timestamp', async function () {
      expect(before.blockTimestamp).to.be.eq(timestamp)
    })

    it('shouldUpdate', async function () {
      await reserve.step(timestep) // step forward a day
      timestamp += timestep
      expect(await reserve.timestamp()).to.be.eq(timestamp)
      await reserve.shouldUpdate(resId)
      let deltaTime = timestep
      let cumulativequote = before.reservequote.mul(deltaTime)
      let cumulativebase = before.reservebase.mul(deltaTime)
      let cumulativeLiquidity = before.liquidity.mul(deltaTime)
      expect(await reserve.res()).to.be.deep.eq([
        before.reservequote,
        before.reservebase,
        before.liquidity,
        before.blockTimestamp + timestep,
        cumulativequote,
        cumulativebase,
        cumulativeLiquidity,
      ])
    })

    it('shouldSwap quote to base', async function () {
      let deltaIn = parseWei('0.1').raw // quote in
      let deltaOut = parseWei('100').raw // base out
      await reserve.shouldSwap(resId, true, deltaIn, deltaOut)
      expect(await reserve.res()).to.be.deep.eq([
        before.reservequote.add(deltaIn),
        before.reservebase.sub(deltaOut),
        before.liquidity,
        before.blockTimestamp,
        before.cumulativequote,
        before.cumulativebase,
        before.cumulativeLiquidity,
      ])
    })

    it('shouldAllocate', async function () {
      let delquote = parseWei('0.1').raw
      let delbase = parseWei('100').raw
      let delLiquidity = parseWei('0.1').raw
      await reserve.shouldAllocate(resId, delquote, delbase, delLiquidity)
      expect(await reserve.res()).to.be.deep.eq([
        before.reservequote.add(delquote),
        before.reservebase.add(delbase),
        before.liquidity.add(delLiquidity),
        before.blockTimestamp,
        before.cumulativequote,
        before.cumulativebase,
        before.cumulativeLiquidity,
      ])
    })
    it('shouldRemove', async function () {
      let delquote = parseWei('0.1').raw
      let delbase = parseWei('100').raw
      let delLiquidity = parseWei('0.1').raw
      await reserve.shouldRemove(resId, delquote, delbase, delLiquidity)
      expect(await reserve.res()).to.be.deep.eq([
        before.reservequote.sub(delquote),
        before.reservebase.sub(delbase),
        before.liquidity.sub(delLiquidity),
        before.blockTimestamp,
        before.cumulativequote,
        before.cumulativebase,
        before.cumulativeLiquidity,
      ])
    })

    it('should overflow on update', async function () {
      const max = constants.MaxUint256.sub(1)
      await reserve.update(resId, max, max, max, 1)
      await reserve.step(100000)
      await expect(reserve.shouldUpdate(resId)).to.not.be.reverted
      expect((await reserve.res()).cumulativeLiquidity.lt(max)).to.be.eq(true)
      expect((await reserve.res()).cumulativequote.lt(max)).to.be.eq(true)
      expect((await reserve.res()).cumulativebase.lt(max)).to.be.eq(true)
    })
  })
})
