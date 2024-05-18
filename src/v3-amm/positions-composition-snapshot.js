const { queryApollo } = require('../helpers/apollo-queries')
const poolV3Abi = require('../abi/poolV3Abi.json')
const { V3_AMM_SUBGRAPH, V3_AMM_SUBGRAPH_AUTH_KEY, NFPM_ADDRESS } = require('../helpers/config')
const { BigNumber } = require('ethers')
const { TickMath, ZERO, MaxUint256, Q128Bn } = require('./helpers/tick-math')
const { SqrtPriceMath } = require('./helpers/sqrt-price-math')
const { getAddress, formatUnits, parseUnits } = require('ethers/lib/utils')
const JSBI = require('jsbi')
const { executeStaticCall } = require('../helpers/contracts')


function toBytes32(str, max = 64) {
  return str.length < max ? toBytes32('0' + str, max) : str
}

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


function poolPositionsForPairQuery(pairAddress, idGreaterThan = 0, block, nfpmAddress) {
  let q = 'query positions {'
  q += `poolPositions(first: 1000, 
        where: {pool: "${pairAddress.toLowerCase()}", id_gt: ${idGreaterThan}, liquidity_gt: 0, owner_not: "${nfpmAddress.toLowerCase()}"}, orderBy: id, 
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

function positionsForPairQuery(pairAddress, idGreaterThan = 0, block) {
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

async function fetchProvidersPositionComposition(liquidityAddress, block, activeOnly = true) {
  let pairInfo = null
  try {
    pairInfo = await queryApollo(V3_AMM_SUBGRAPH, fetchDataForPair(liquidityAddress, block), V3_AMM_SUBGRAPH_AUTH_KEY)
  } catch (e) {
    console.log('error', e)
    return
  }
  if (!pairInfo || !pairInfo.pool) return null
  const currentTick = Number(pairInfo.pool.tick)

  let lastLength = null
  let lastId = 0
  const maxPositionsPerBatch = 1000

  let positions = []
  while (lastLength === null || lastLength >= maxPositionsPerBatch) {
    const _data = await queryApollo(V3_AMM_SUBGRAPH, positionsForPairQuery(liquidityAddress, lastId, block), V3_AMM_SUBGRAPH_AUTH_KEY)
    if (!_data) return
    if ('positions' in _data) {
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

    let amountToken1Jsbi = BigNumber.from(0)
    let amountToken0Jsbi = BigNumber.from(0)

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

    if (amount0.gt(BigNumber.from(0)) || amount1.gt(BigNumber.from(0))) {
      const provider = getAddress(position.owner)
      if (!(provider in liquidityProviders)) liquidityProviders[provider] = {
        token0Amount: BigNumber.from(0),
        token1Amount: BigNumber.from(0)
      }
      liquidityProviders[provider].token1Amount = liquidityProviders[provider].token1Amount.add(amount1)
      liquidityProviders[provider].token0Amount = liquidityProviders[provider].token0Amount.add(amount0)
    }
  }

  for (const provider in liquidityProviders) {
    liquidityProviders[provider].token0Amount = formatUnits(liquidityProviders[provider].token0Amount, pairInfo.pool.token0.decimals)
    liquidityProviders[provider].token1Amount = formatUnits(liquidityProviders[provider].token1Amount, pairInfo.pool.token1.decimals)
  }

  return liquidityProviders
}

async function fetchPositionsPendingFees(liquidityAddress, block, activeOnly = true) {
  let pairInfo = null
  try {
    pairInfo = await queryApollo(V3_AMM_SUBGRAPH, fetchDataForPair(liquidityAddress, block), V3_AMM_SUBGRAPH_AUTH_KEY)
  } catch (e) {
    console.log('error', e)
    return
  }
  if (!pairInfo || !pairInfo.pool) return null
  const token0Decimals = Number(pairInfo.pool.token0.decimals)
  const token1Decimals = Number(pairInfo.pool.token1.decimals)
  const currentTick = Number(pairInfo.pool.tick)

  let lastLength = null
  let lastId = 0
  const maxPositionsPerBatch = 1000

  let positions = []
  while (lastLength === null || lastLength >= maxPositionsPerBatch) {
    const _data = await queryApollo(V3_AMM_SUBGRAPH, positionsForPairQuery(liquidityAddress, lastId, block), V3_AMM_SUBGRAPH_AUTH_KEY)
    if (!_data) return
    if ('positions' in _data) {
      positions = positions.concat(_data.positions)
      lastLength = _data.positions.length
      lastId = _data.positions[_data.positions.length - 1].id
    }
  }

  let poolPositions = []
  lastLength = null
  lastId = 0
  while (lastLength === null || lastLength >= maxPositionsPerBatch) {
    const _data = await queryApollo(V3_AMM_SUBGRAPH, poolPositionsForPairQuery(liquidityAddress, lastId, block, NFPM_ADDRESS), V3_AMM_SUBGRAPH_AUTH_KEY)
    if (!_data) return
    if ('poolPositions' in _data) {
      poolPositions = poolPositions.concat(_data.poolPositions)
      lastLength = _data.poolPositions.length
      lastId = _data.poolPositions[_data.poolPositions.length - 1].id
    }
  }

  let calls = [{
    address: liquidityAddress,
    abi: poolV3Abi,
    method: 'totalFeeGrowth0Token',
    params: []
  },{
    address: liquidityAddress,
    abi: poolV3Abi,
    method: 'totalFeeGrowth1Token',
    params: []
  }]
  for (const poolPosition of poolPositions) {
    let positionKey = '0x'.concat(toBytes32(
      JSBI.bitwiseOr(
        JSBI.leftShift(
          JSBI.bitwiseOr(
            JSBI.leftShift(JSBI.BigInt(poolPosition.owner), JSBI.BigInt(24)),
            JSBI.bitwiseAnd(JSBI.BigInt(poolPosition.tickLower.tickIdx), MaxUint256)
          ),
          JSBI.BigInt(24)
        ),
        JSBI.bitwiseAnd(JSBI.BigInt(poolPosition.tickUpper.tickIdx), MaxUint256)
      ).toString(16)
    ))

    calls = calls.concat({
      address: liquidityAddress,
      abi: poolV3Abi,
      method: 'positions',
      params: [positionKey]
    },{
      address: liquidityAddress,
      abi: poolV3Abi,
      method: 'ticks',
      params: [poolPosition.tickLower.tickIdx]
    },{
      address: liquidityAddress,
      abi: poolV3Abi,
      method: 'ticks',
      params: [poolPosition.tickUpper.tickIdx]
    })
  }

  const result = (await executeStaticCall(calls, false)).returnData
  const totalFeeGrowth0Token = result[0][0]
  const totalFeeGrowth1Token = result[1][0]

  const positionsPendingFees = []
  for (const i in poolPositions) {
    const position = poolPositions[i]

    let _i = 3*i+2
    const positionData = result[_i]
    const bottomTickData = result[_i + 1]
    const topTickData = result[_i + 2]

    const bottomTick = Number(position.tickLower.tickIdx)
    const topTick = Number(position.tickUpper.tickIdx)

    let newInnerFeeGrowth0Token = BigNumber.from(0)
    let newInnerFeeGrowth1Token = BigNumber.from(0)

    if(currentTick < topTick) {
      if (currentTick >= bottomTick) {
        newInnerFeeGrowth0Token = totalFeeGrowth0Token.sub(bottomTickData.outerFeeGrowth0Token);
        newInnerFeeGrowth1Token = totalFeeGrowth1Token.sub(bottomTickData.outerFeeGrowth1Token);
      } else {
        newInnerFeeGrowth0Token = bottomTickData.outerFeeGrowth0Token;
        newInnerFeeGrowth1Token = bottomTickData.outerFeeGrowth1Token;
      }
    } else {
      newInnerFeeGrowth0Token = topTickData.outerFeeGrowth0Token.sub(bottomTickData.outerFeeGrowth0Token);
      newInnerFeeGrowth1Token = topTickData.outerFeeGrowth1Token.sub(bottomTickData.outerFeeGrowth1Token);
    }

    const deltaFees0 = (newInnerFeeGrowth0Token.sub(positionData.innerFeeGrowth0Token)).mul(positionData.liquidity).div(Q128Bn)
    const deltaFees1 = (newInnerFeeGrowth1Token.sub(positionData.innerFeeGrowth1Token)).mul(positionData.liquidity).div(Q128Bn)

    const fees0 = deltaFees0.add(positionData.fees0)
    const fees1 = deltaFees1.add(positionData.fees1)

    positionsPendingFees.push({
      pool: getAddress(liquidityAddress),
      owner: getAddress(position.owner),
      tickLower: position.tickLower.tickIdx,
      tickUpper: position.tickUpper.tickIdx,
      pendingFees0: formatUnits(fees0, token0Decimals),
      pendingFees1: formatUnits(fees1, token1Decimals)
    })
  }
  return positionsPendingFees
}

module.exports = { fetchProvidersPositionComposition, fetchPositionsPendingFees }
