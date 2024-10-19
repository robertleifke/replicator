import { ethers } from 'hardhat'
import { parseWei } from 'web3-units'

import expect from '../../shared/expect'
import { librariesFixture } from '../../shared/fixtures'
import { testContext } from '../../shared/testContext'

import { TestMargin } from '../../../typechain'
import { createFixtureLoader } from 'ethereum-waffle'
import { Wallet } from 'ethers'

testContext('testMargin', function () {
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

  describe('margin library', function () {
    let margin: TestMargin, before: any

    beforeEach(async function () {
      margin = this.libraries.testMargin
      before = await margin.margin()
    })

    it('shouldDeposit', async function () {
      let delta = parseWei('1').raw
      await margin.shouldDeposit(delta, delta)
      let after = await margin.margin()
      expect(after.balancequote).to.be.deep.eq(before.balancequote.add(delta))
      expect(after.balancebase).to.be.deep.eq(before.balancebase.add(delta))
    })

    it('shouldWithdraw', async function () {
      let delta = parseWei('1').raw
      await margin.shouldDeposit(delta, delta)
      await margin.shouldWithdraw(delta, delta)
      let after = await margin.margin()
      expect(after.balancequote).to.be.deep.eq(before.balancequote)
      expect(after.balancebase).to.be.deep.eq(before.balancebase)
    })
  })
})
