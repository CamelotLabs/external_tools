const { queryApollo } = require('../helpers/apollo-queries')
const { V3_AMM_SUBGRAPH, V3_AMM_SUBGRAPH_AUTH_KEY } = require('../helpers/config')
const {BigNumber} = require("ethers");
const {TickMath, ZERO } = require("./helpers/tick-math");
const { SqrtPriceMath } = require('./helpers/sqrt-price-math')
const { getAddress, formatUnits } = require('ethers/lib/utils')

function fetchDataForPair(pairAddress, block) {
  let q = 'query pool {'

  q += `bundle(id: 1, block: { number: ${block} })
      {
        ethPriceUSD: maticPriceUSD
      } `

  q += `pool(id: "${pairAddress.toLowerCase()}", block: { number: ${block} })
      {
        totalValueLockedUSD
        totalValueLockedToken0
        totalValueLockedToken1
        liquidity
        tick
        token0 { 
          derivedEth: derivedMatic 
          decimals
        }
        token1 { 
          derivedEth: derivedMatic 
          decimals
        }
        feesUSD
        feesToken0
        feesToken1
      } `

  q += '}'
  return q
}

function activePositionsForPairQuery(pairAddress, idGreaterThan = 0, block) {
  let q = 'query positions {'
  q += `positions(first: 1000, 
        where: {pool: "${pairAddress.toLowerCase()}", id_gt: ${idGreaterThan}, liquidity_gt: 0}, orderBy: id, 
        block: { number: ${block} })
      {
        id
        tickLower { tickIdx }
        tickUpper { tickIdx }
        liquidity
        owner
      }, `

  q += '}'
  return q
}

async function fetchProvidersPositionComposition(liquidityAddress, block, activeOnly=true) {
  let pairInfo = null
  try {
    pairInfo = await queryApollo(V3_AMM_SUBGRAPH, fetchDataForPair(liquidityAddress, block), V3_AMM_SUBGRAPH_AUTH_KEY)
  } catch (e) {
    console.log("error", e)
    return
  }
  if (!pairInfo || !pairInfo.pool) return null
  const currentTick = Number(pairInfo.pool.tick)

  let lastLength = null
  let lastId = 0
  const maxPositionsPerBatch = 1000

  let positions = []
  while (lastLength === null || lastLength >= maxPositionsPerBatch) {
    const _data = await queryApollo(V3_AMM_SUBGRAPH, activePositionsForPairQuery(liquidityAddress, lastId, block), V3_AMM_SUBGRAPH_AUTH_KEY)
    if (!_data) return
    if ("positions" in _data) {
      positions = positions.concat(_data.positions)
      lastLength = _data.positions.length
      lastId = _data.positions[_data.positions.length - 1].id
    }
  }

  const liquidityProviders = {}

  for (const position of positions) {
    const liquidity = BigNumber.from(position.liquidity)
    const tickLower = Number(position.tickLower.tickIdx)
    const tickUpper = Number(position.tickUpper.tickIdx)

    const sqrtCurrent = TickMath.getSqrtRatioBnAtTick(currentTick)
    const sqrtLower = TickMath.getSqrtRatioBnAtTick(tickLower)
    const sqrtUpper = TickMath.getSqrtRatioBnAtTick(tickUpper)

    let amountToken1Jsbi = BigNumber.from(0);
    let amountToken0Jsbi = BigNumber.from(0);

    if (tickLower > currentTick) {
      amountToken1Jsbi = ZERO
      amountToken0Jsbi = activeOnly ? ZERO : SqrtPriceMath.getAmount0Delta(sqrtLower, sqrtUpper, liquidity, false)
    } else if (tickUpper < currentTick) {
      amountToken1Jsbi = activeOnly ? ZERO : SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtUpper, liquidity, false)
      amountToken0Jsbi = ZERO
    } else {
      amountToken1Jsbi = SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtCurrent, liquidity, false)
      amountToken0Jsbi = SqrtPriceMath.getAmount0Delta(sqrtCurrent, sqrtUpper, liquidity, false)
    }
    const amount1 = BigNumber.from(amountToken1Jsbi.toString())
    const amount0 = BigNumber.from(amountToken0Jsbi.toString())

    if(amount0.gt(BigNumber.from(0)) || amount1.gt(BigNumber.from(0))) {
      const provider = getAddress(position.owner)
      if(!(provider in liquidityProviders)) liquidityProviders[provider] = {
        token0Amount: BigNumber.from(0),
        token1Amount: BigNumber.from(0)
      }
      liquidityProviders[provider].token1Amount = liquidityProviders[provider].token1Amount.add(amount1)
      liquidityProviders[provider].token0Amount = liquidityProviders[provider].token0Amount.add(amount0)
    }
  }

  for(const provider in liquidityProviders) {
    liquidityProviders[provider].token0Amount = formatUnits(liquidityProviders[provider].token0Amount, pairInfo.pool.token0.decimals)
    liquidityProviders[provider].token1Amount = formatUnits(liquidityProviders[provider].token1Amount, pairInfo.pool.token1.decimals)
  }

  return liquidityProviders
}

module.exports = {fetchProvidersPositionComposition}
