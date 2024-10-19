import { BigNumber } from 'ethers'
import { Awaited, EngineTypes } from '../../../types'

export type EngineMarginsType = Awaited<ReturnType<EngineTypes['margins']>>

async function getMarginChange(
  transaction: () => Promise<void> | void,
  engine: EngineTypes,
  account: string
): Promise<{ after: EngineMarginsType; before: EngineMarginsType }> {
  const before = await engine.margins(account)
  await transaction()
  const after = await engine.margins(account)
  return { after, before }
}

// Chai matchers for the margins of the engine

export default function supportMargin(Assertion: Chai.AssertionStatic) {
  Assertion.addMethod(
    'increaseMargin',
    async function (this: any, engine: EngineTypes, account: string, delquote: BigNumber, delbase: BigNumber) {
      const subject = this._obj

      const derivedPromise = Promise.all([getMarginChange(subject, engine, account)]).then(([{ after, before }]) => {
        const expectedquote = before.balancequote.add(delquote) // INCREASE
        const expectedbase = before.balancebase.add(delbase) // INCREASE

        this.assert(
          after.balancequote.eq(expectedquote),
          `Expected ${after.balancequote} to be ${expectedquote}`,
          `Expected ${after.balancequote} NOT to be ${expectedquote}`,
          expectedquote,
          after.balancequote
        )

        this.assert(
          after.balancebase.eq(expectedbase),
          `Expected ${after.balancebase} to be ${expectedbase}`,
          `Expected ${after.balancebase} NOT to be ${expectedbase}`,
          expectedbase,
          after.balancebase
        )
      })

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
    }
  )

  Assertion.addMethod(
    'decreaseMargin',
    async function (this: any, engine: EngineTypes, account: string, delquote: BigNumber, delbase: BigNumber) {
      const subject = this._obj

      const derivedPromise = Promise.all([getMarginChange(subject, engine, account)]).then(([{ after, before }]) => {
        const expectedquote = before.balancequote.sub(delquote) // DECREASE
        const expectedbase = before.balancebase.sub(delbase) // DECREASE

        this.assert(
          after.balancequote.eq(expectedquote),
          `Expected ${after.balancequote} to be ${expectedquote}`,
          `Expected ${after.balancequote} NOT to be ${expectedquote}`,
          expectedquote,
          after.balancequote
        )

        this.assert(
          after.balancebase.eq(expectedbase),
          `Expected ${after.balancebase} to be ${expectedbase}`,
          `Expected ${after.balancebase} NOT to be ${expectedbase}`,
          expectedbase,
          after.balancebase
        )
      })

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
    }
  )
}
