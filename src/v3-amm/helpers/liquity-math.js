const {Q96Bn} = require('./tick-math')
export class LiquidityMath {
  /**
   * Returns an imprecise maximum amount of liquidity received for a given amount of token 0.
   * This function is available to accommodate LiquidityAmounts#getLiquidityForAmount0 in the v3 periphery,
   * which could be more precise by at least 32 bits by dividing by Q64 instead of Q96 in the intermediate step,
   * and shifting the subtracted ratio left by 32 bits. This imprecise calculation will likely be replaced in a future
   * v3 router contract.
   * @param sqrtRatioAX96 The price at the lower boundary
   * @param sqrtRatioBX96 The price at the upper boundary
   * @param amount0 The token0 amount
   * @returns liquidity for amount0, imprecise
   */

  static maxLiquidityForAmount0Imprecise(sqrtRatioAX96, sqrtRatioBX96, amount0) {
    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      ;[sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
    }
    const intermediate = sqrtRatioAX96.mul(sqrtRatioBX96).div(Q96Bn)
    return amount0.mul(intermediate).div(sqrtRatioBX96.sub(sqrtRatioAX96))
  }

  /**
   * Returns a precise maximum amount of liquidity received for a given amount of token 0 by dividing by Q64 instead of Q96 in the intermediate step,
   * and shifting the subtracted ratio left by 32 bits.
   * @param sqrtRatioAX96 The price at the lower boundary
   * @param sqrtRatioBX96 The price at the upper boundary
   * @param amount0 The token0 amount
   * @returns liquidity for amount0, precise
   */

  static maxLiquidityForAmount0Precise(sqrtRatioAX96, sqrtRatioBX96, amount0) {
    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      ;[sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
    }

    const numerator = amount0.mul(sqrtRatioAX96).mul(sqrtRatioBX96)
    const denominator = Q96Bn.mul(sqrtRatioBX96.sub(sqrtRatioAX96))

    return numerator.div(denominator)
  }

  /**
   * Computes the maximum amount of liquidity received for a given amount of token1
   * @param sqrtRatioAX96 The price at the lower tick boundary
   * @param sqrtRatioBX96 The price at the upper tick boundary
   * @param amount1 The token1 amount
   * @returns liquidity for amount1
   */

  static maxLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, amount1) {
    if(sqrtRatioAX96.gt(sqrtRatioBX96)) {
      ;[sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
    }
    return amount1.mul(Q96Bn).div(sqrtRatioBX96.sub(sqrtRatioAX96))
  }

  /**
   * Computes the maximum amount of liquidity received for a given amount of token0, token1,
   * and the prices at the tick boundaries.
   * @param sqrtRatioCurrentX96 the current price
   * @param sqrtRatioAX96 price at lower boundary
   * @param sqrtRatioBX96 price at upper boundary
   * @param amount0 token0 amount
   * @param amount1 token1 amount
   * @param useFullPrecision if false, liquidity will be maximized according to what the router can calculate,
   * not what core can theoretically support
   */

  static maxLiquidityForAmounts(
    sqrtRatioCurrentX96,
    sqrtRatioAX96,
    sqrtRatioBX96,
    amount0,
    amount1,
    useFullPrecision = true
  ) {
    if(sqrtRatioAX96.gt(sqrtRatioBX96)) {
      ;[sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
    }

    const maxLiquidityForAmount0 = useFullPrecision ? LiquidityMath.maxLiquidityForAmount0Precise : LiquidityMath.maxLiquidityForAmount0Imprecise

    if(sqrtRatioCurrentX96.lte(sqrtRatioAX96)) {
      return maxLiquidityForAmount0(sqrtRatioAX96, sqrtRatioBX96, amount0)
    } else if (sqrtRatioCurrentX96.lt(sqrtRatioBX96)) {
      const liquidity0 = maxLiquidityForAmount0(sqrtRatioCurrentX96, sqrtRatioBX96, amount0)
      const liquidity1 = LiquidityMath.maxLiquidityForAmount1(sqrtRatioAX96, sqrtRatioCurrentX96, amount1)
      return liquidity0.lt(liquidity1) ? liquidity0 : liquidity1
    } else {
      return LiquidityMath.maxLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, amount1)
    }
  }
}
