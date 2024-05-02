const JSBI = require("jsbi");
const invariant = require("tiny-invariant");
const {BigNumber} = require("ethers");
const {ONE, Q96, ZERO, MaxUint256, mulDivRoundingUp } = require('./tick-math');


const MaxUint160 = JSBI.subtract(JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(160)), ONE)

function multiplyIn256(x, y) {
  const product = JSBI.multiply(x, y)
  return JSBI.bitwiseAnd(product, MaxUint256)
}

function addIn256(x, y) {
  const sum = JSBI.add(x, y)
  return JSBI.bitwiseAnd(sum, MaxUint256)
}

class SqrtPriceMath {
  /**
   * Cannot be constructed.
   */

  static getAmount0Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, roundUp) {
    if(BigNumber.isBigNumber(sqrtRatioAX96)) sqrtRatioAX96 = JSBI.BigInt(sqrtRatioAX96.toString())
    if(BigNumber.isBigNumber(sqrtRatioBX96)) sqrtRatioBX96 = JSBI.BigInt(sqrtRatioBX96.toString())
    if(BigNumber.isBigNumber(liquidity)) liquidity = JSBI.BigInt(liquidity.toString())

    if (JSBI.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
      ;[sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
    }

    const numerator1 = JSBI.leftShift(liquidity, JSBI.BigInt(96))
    const numerator2 = JSBI.subtract(sqrtRatioBX96, sqrtRatioAX96)

    return roundUp
      ? mulDivRoundingUp(mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96), ONE, sqrtRatioAX96)
      : JSBI.divide(JSBI.divide(JSBI.multiply(numerator1, numerator2), sqrtRatioBX96), sqrtRatioAX96)
  }

  static getAmount1Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, roundUp) {
    if(BigNumber.isBigNumber(sqrtRatioAX96)) sqrtRatioAX96 = JSBI.BigInt(sqrtRatioAX96.toString())
    if(BigNumber.isBigNumber(sqrtRatioBX96)) sqrtRatioBX96 = JSBI.BigInt(sqrtRatioBX96.toString())
    if(BigNumber.isBigNumber(liquidity)) liquidity = JSBI.BigInt(liquidity.toString())

    if (JSBI.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
      ;[sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
    }

    return roundUp
      ? mulDivRoundingUp(liquidity, JSBI.subtract(sqrtRatioBX96, sqrtRatioAX96), Q96)
      : JSBI.divide(JSBI.multiply(liquidity, JSBI.subtract(sqrtRatioBX96, sqrtRatioAX96)), Q96)
  }

  static getNextSqrtPriceFromInput(sqrtPX96, liquidity, amountIn, zeroForOne) {
    invariant(JSBI.greaterThan(sqrtPX96, ZERO))
    invariant(JSBI.greaterThan(liquidity, ZERO))

    return zeroForOne
      ? this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true)
      : this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true)
  }

  static getNextSqrtPriceFromOutput(
    sqrtPX96,
    liquidity,
    amountOut,
    zeroForOne
  ) {
    invariant(JSBI.greaterThan(sqrtPX96, ZERO))
    invariant(JSBI.greaterThan(liquidity, ZERO))

    return zeroForOne
      ? this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountOut, false)
      : this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountOut, false)
  }

  static getNextSqrtPriceFromAmount0RoundingUp(
    sqrtPX96,
    liquidity,
    amount,
    add
  ) {
    if (JSBI.equal(amount, ZERO)) return sqrtPX96
    const numerator1 = JSBI.leftShift(liquidity, JSBI.BigInt(96))

    if (add) {
      const product = multiplyIn256(amount, sqrtPX96)
      if (JSBI.equal(JSBI.divide(product, amount), sqrtPX96)) {
        const denominator = addIn256(numerator1, product)
        if (JSBI.greaterThanOrEqual(denominator, numerator1)) {
          return mulDivRoundingUp(numerator1, sqrtPX96, denominator)
        }
      }

      return mulDivRoundingUp(numerator1, ONE, JSBI.add(JSBI.divide(numerator1, sqrtPX96), amount))
    } else {
      const product = multiplyIn256(amount, sqrtPX96)

      invariant(JSBI.equal(JSBI.divide(product, amount), sqrtPX96))
      invariant(JSBI.greaterThan(numerator1, product))
      const denominator = JSBI.subtract(numerator1, product)
      return mulDivRoundingUp(numerator1, sqrtPX96, denominator)
    }
  }

  static getNextSqrtPriceFromAmount1RoundingDown(
    sqrtPX96,
    liquidity,
    amount,
    add
  ) {
    if (add) {
      const quotient = JSBI.lessThanOrEqual(amount, MaxUint160)
        ? JSBI.divide(JSBI.leftShift(amount, JSBI.BigInt(96)), liquidity)
        : JSBI.divide(JSBI.multiply(amount, Q96), liquidity)

      return JSBI.add(sqrtPX96, quotient)
    } else {
      const quotient = mulDivRoundingUp(amount, Q96, liquidity)

      invariant(JSBI.greaterThan(sqrtPX96, quotient))
      return JSBI.subtract(sqrtPX96, quotient)
    }
  }
}
module.exports = {SqrtPriceMath}
