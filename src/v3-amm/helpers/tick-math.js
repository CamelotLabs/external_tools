const JSBI = require("jsbi");
const invariant = require("tiny-invariant");
const {BigNumber, ethers} = require("ethers");
const {BigNumber: BN} = require("bignumber.js");


// constants used internally but not expected to be used externally
const MaxUint256 = JSBI.BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
const NEGATIVE_ONE = JSBI.BigInt(-1)
const ZERO = JSBI.BigInt(0)
const ONE = JSBI.BigInt(1)

// used in liquidity amount math
const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96))
const Q96Bn = BigNumber.from(2).pow(BigNumber.from(96))
const Q128Bn = BigNumber.from(2).pow(BigNumber.from(128))
const Q192 = JSBI.exponentiate(Q96, JSBI.BigInt(2))

const TWO = JSBI.BigInt(2)
const POWERS_OF_2 = [128, 64, 32, 16, 8, 4, 2, 1].map((pow) => [
  pow,
  JSBI.exponentiate(TWO, JSBI.BigInt(pow))
])

function mostSignificantBit(x) {
  invariant(JSBI.greaterThan(x, ZERO), 'ZERO')
  invariant(JSBI.lessThanOrEqual(x, MaxUint256), 'MAX')

  let msb = 0
  for (const [power, min] of POWERS_OF_2) {
    if (JSBI.greaterThanOrEqual(x, min)) {
      x = JSBI.signedRightShift(x, JSBI.BigInt(power))
      msb += power
    }
  }
  return msb
}

function mulDivRoundingUp(a, b, denominator) {
  const product = JSBI.multiply(a, b)
  let result = JSBI.divide(product, denominator)
  if (JSBI.notEqual(JSBI.remainder(product, denominator), ZERO)) result = JSBI.add(result, ONE)
  return result
}

function mulShift(val, mulBy) {
  return JSBI.signedRightShift(JSBI.multiply(val, JSBI.BigInt(mulBy)), JSBI.BigInt(128))
}

const Q32 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(32))

class TickMath {
  /**
   * Cannot be constructed.
   */

  /**
   * The minimum tick that can be used on any pool.
   */
  static MIN_TICK = -887272
  /**
   * The maximum tick that can be used on any pool.
   */
  static MAX_TICK = -TickMath.MIN_TICK

  /**
   * The sqrt ratio corresponding to the minimum tick that could be used on any pool.
   */
  static MIN_SQRT_RATIO = JSBI.BigInt('4295128739')
  /**
   * The sqrt ratio corresponding to the maximum tick that could be used on any pool.
   */
  static MAX_SQRT_RATIO = JSBI.BigInt('1461446703485210103287273052203988822378723970342')

  /**
   * Returns the sqrt ratio as a Q64.96 for the given tick. The sqrt ratio is computed as sqrt(1.0001)^tick
   * @param tick the tick for which to compute the sqrt ratio
   */
  static getSqrtRatioBnAtTick(tick) {

    invariant(tick >= TickMath.MIN_TICK && tick <= TickMath.MAX_TICK && Number.isInteger(tick), 'TICK')
    const absTick = tick < 0 ? tick * -1 : tick

    let ratio =
      (absTick & 0x1) !== 0
        ? JSBI.BigInt('0xfffcb933bd6fad37aa2d162d1a594001')
        : JSBI.BigInt('0x100000000000000000000000000000000')
    if ((absTick & 0x2) !== 0) ratio = mulShift(ratio, '0xfff97272373d413259a46990580e213a')
    if ((absTick & 0x4) !== 0) ratio = mulShift(ratio, '0xfff2e50f5f656932ef12357cf3c7fdcc')
    if ((absTick & 0x8) !== 0) ratio = mulShift(ratio, '0xffe5caca7e10e4e61c3624eaa0941cd0')
    if ((absTick & 0x10) !== 0) ratio = mulShift(ratio, '0xffcb9843d60f6159c9db58835c926644')
    if ((absTick & 0x20) !== 0) ratio = mulShift(ratio, '0xff973b41fa98c081472e6896dfb254c0')
    if ((absTick & 0x40) !== 0) ratio = mulShift(ratio, '0xff2ea16466c96a3843ec78b326b52861')
    if ((absTick & 0x80) !== 0) ratio = mulShift(ratio, '0xfe5dee046a99a2a811c461f1969c3053')
    if ((absTick & 0x100) !== 0) ratio = mulShift(ratio, '0xfcbe86c7900a88aedcffc83b479aa3a4')
    if ((absTick & 0x200) !== 0) ratio = mulShift(ratio, '0xf987a7253ac413176f2b074cf7815e54')
    if ((absTick & 0x400) !== 0) ratio = mulShift(ratio, '0xf3392b0822b70005940c7a398e4b70f3')
    if ((absTick & 0x800) !== 0) ratio = mulShift(ratio, '0xe7159475a2c29b7443b29c7fa6e889d9')
    if ((absTick & 0x1000) !== 0) ratio = mulShift(ratio, '0xd097f3bdfd2022b8845ad8f792aa5825')
    if ((absTick & 0x2000) !== 0) ratio = mulShift(ratio, '0xa9f746462d870fdf8a65dc1f90e061e5')
    if ((absTick & 0x4000) !== 0) ratio = mulShift(ratio, '0x70d869a156d2a1b890bb3df62baf32f7')
    if ((absTick & 0x8000) !== 0) ratio = mulShift(ratio, '0x31be135f97d08fd981231505542fcfa6')
    if ((absTick & 0x10000) !== 0) ratio = mulShift(ratio, '0x9aa508b5b7a84e1c677de54f3e99bc9')
    if ((absTick & 0x20000) !== 0) ratio = mulShift(ratio, '0x5d6af8dedb81196699c329225ee604')
    if ((absTick & 0x40000) !== 0) ratio = mulShift(ratio, '0x2216e584f5fa1ea926041bedfe98')
    if ((absTick & 0x80000) !== 0) ratio = mulShift(ratio, '0x48a170391f7dc42444e8fa2')

    if (tick > 0) ratio = JSBI.divide(MaxUint256, ratio)

    // back to Q96
    return JSBI.greaterThan(JSBI.remainder(ratio, Q32), ZERO)
      ? BigNumber.from(ratio.toString()).div(BigNumber.from(Q32.toString())).add(1)
      : BigNumber.from(ratio.toString()).div(BigNumber.from(Q32.toString()))
  }

  /**
   * Returns the tick corresponding to a given sqrt ratio, s.t. #getSqrtRatioAtTick(tick) <= sqrtRatioX96
   * and #getSqrtRatioAtTick(tick + 1) > sqrtRatioX96
   * @param sqrtRatioX96 the sqrt ratio as a Q64.96 for which to compute the tick
   */
  static getTickAtSqrtRatio(sqrtRatioX96) {
    invariant(
      JSBI.greaterThanOrEqual(sqrtRatioX96, TickMath.MIN_SQRT_RATIO) &&
      JSBI.lessThan(sqrtRatioX96, TickMath.MAX_SQRT_RATIO),
      'SQRT_RATIO'
    )

    const sqrtRatioX128 = JSBI.leftShift(sqrtRatioX96, JSBI.BigInt(32))

    const msb = mostSignificantBit(sqrtRatioX128)

    let r
    if (JSBI.greaterThanOrEqual(JSBI.BigInt(msb), JSBI.BigInt(128))) {
      r = JSBI.signedRightShift(sqrtRatioX128, JSBI.BigInt(msb - 127))
    } else {
      r = JSBI.leftShift(sqrtRatioX128, JSBI.BigInt(127 - msb))
    }

    let log2 = JSBI.leftShift(JSBI.subtract(JSBI.BigInt(msb), JSBI.BigInt(128)), JSBI.BigInt(64))

    for (let i = 0; i < 14; i++) {
      r = JSBI.signedRightShift(JSBI.multiply(r, r), JSBI.BigInt(127))
      const f = JSBI.signedRightShift(r, JSBI.BigInt(128))
      log2 = JSBI.bitwiseOr(log2, JSBI.leftShift(f, JSBI.BigInt(63 - i)))
      r = JSBI.signedRightShift(r, f)
    }

    const logSqrt10001 = JSBI.multiply(log2, JSBI.BigInt('255738958999603826347141'))

    const tickLow = JSBI.toNumber(
      JSBI.signedRightShift(
        JSBI.subtract(logSqrt10001, JSBI.BigInt('3402992956809132418596140100660247210')),
        JSBI.BigInt(128)
      )
    )
    const tickHigh = JSBI.toNumber(
      JSBI.signedRightShift(
        JSBI.add(logSqrt10001, JSBI.BigInt('291339464771989622907027621153398088495')),
        JSBI.BigInt(128)
      )
    )

    return tickLow === tickHigh
      ? tickLow
      : JSBI.lessThanOrEqual(JSBI.BigInt(TickMath.getSqrtRatioBnAtTick(tickHigh).toString()), sqrtRatioX96)
        ? tickHigh
        : tickLow
  }

  static priceFromSqrtRatio(token0_, token1_, sqrtRatio, invert = false) {
    let token0 = token0_
    let token1 = token1_
    if (invert) {
      token0 = token1_
      token1 = token0_
    }
    let numerator = BigNumber.from(sqrtRatio.toString()).pow(BigNumber.from(2))
    numerator = numerator.mul(BigNumber.from(10).pow(token0.decimals))

    let denominator = (BigNumber.from(2).pow(BigNumber.from(96))).pow(BigNumber.from(2))
    denominator = denominator.mul(BigNumber.from(10).pow(token1.decimals))

    if (invert) {
      const _denominator = denominator
      denominator = numerator
      numerator = _denominator
    }
    return numerator.mul(BigNumber.from(10).pow(token1_.decimals)).div(denominator.toString())
  }

  static priceToSqrtRatioX96(token0, token0Price) {
    const numerator = (BigNumber.from(2).pow(BigNumber.from(96))).pow(BigNumber.from(2))

    const denominator = BigNumber.from(10).pow(token0.decimals)

    const sqrt = numerator.mul(token0Price).div(denominator)
    return JSBI.BigInt(new BN(sqrt.toString()).sqrt().toFixed().split('.')[0].toString())
  }

  static tickToPrice(token0, token1, tick) {
    const sqrtRatioX96 = TickMath.getSqrtRatioBnAtTick(tick)
    return TickMath.priceFromSqrtRatio(token0, token1, sqrtRatioX96, token0.isGreaterThan(token1))
  }

  static priceToClosestTick(token0, token1, price, tickSpacing) {
    let tick
    let sqrtRatioX96
    let priceInverted
    if (price.eq(BigNumber.from(0))) {
      tick = TickMath.nearestUsableTick(TickMath.MIN_TICK, tickSpacing)
      sqrtRatioX96 = BigNumber.from(TickMath.MIN_SQRT_RATIO.toString())
      priceInverted = ethers.constants.MaxUint256
    } else if (price.eq(ethers.constants.MaxUint256)) {
      tick = TickMath.nearestUsableTick(TickMath.MAX_TICK, tickSpacing)
      sqrtRatioX96 = BigNumber.from(TickMath.MAX_SQRT_RATIO.toString())
      priceInverted = BigNumber.from(0)
    } else {
      sqrtRatioX96 = TickMath.priceToSqrtRatioX96(token0, price)
      tick = TickMath.getTickAtSqrtRatio(sqrtRatioX96)

      const nextTick = tick + 1
      const nextTickPrice = TickMath.tickToPrice(token0, token1, nextTick)
      if (!price.lt(nextTickPrice)) {
        tick = nextTick
      }
      price = TickMath.tickToPrice(token0, token1, tick)
      priceInverted = TickMath.tickToPrice(token1, token0, tick)
      sqrtRatioX96 = TickMath.getSqrtRatioBnAtTick(tick)
    }
    return {sqrtRatioX96, tick, price, priceInverted}
  }

  static priceToClosestUsableTick(token0, token1, price, tickSpacing) {
    const data = TickMath.priceToClosestTick(token0, token1, price, tickSpacing)

    const usableTick = TickMath.nearestUsableTick(data.tick, tickSpacing)
    if (usableTick !== data.tick) {
      data.tick = usableTick
      data.price = TickMath.tickToPrice(token0, token1, data.tick)
      data.priceInverted = TickMath.tickToPrice(token1, token0, data.tick)
      data.sqrtRatioX96 = TickMath.getSqrtRatioBnAtTick(data.tick)
    }
    return data
  }

  /**
   * Returns the closest tick that is nearest a given tick and usable for the given tick spacing
   * @param tick the target tick
   * @param tickSpacing the spacing of the pool
   */
  static nearestUsableTick(tick, tickSpacing) {
    invariant(Number.isInteger(tick) && Number.isInteger(tickSpacing), 'INTEGERS')
    invariant(tickSpacing > 0, 'TICK_SPACING')
    invariant(tick >= TickMath.MIN_TICK && tick <= TickMath.MAX_TICK, 'TICK_BOUND')
    const rounded = Math.round(tick / tickSpacing) * tickSpacing
    if (rounded < TickMath.MIN_TICK) return rounded + tickSpacing
    else if (rounded > TickMath.MAX_TICK) return rounded - tickSpacing
    else return rounded
  }
}

module.exports = {MaxUint256, NEGATIVE_ONE, ZERO, ONE, Q96, Q96Bn, Q128Bn, Q192, mostSignificantBit, mulDivRoundingUp, TickMath}