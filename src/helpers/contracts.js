const {ethers} = require("ethers");
const { RPC_URI, MULTICALL_ADDRESS, MULTICALL_ABI } = require('./config')

function getProvider(chainId) {
  return new ethers.providers.JsonRpcBatchProvider(RPC_URI)
}

async function executeStaticCall(calls, successRequired) {
  const batch = 100
  let callsLength = calls.length
  let last = 0
  let returnData = []
  let blockNumber
  while (last < callsLength) {
    const _calls = calls.slice(last, last + batch)
    const result = await executeBatchCall(_calls, successRequired)
    const _data = result.returnData
    if (!_data) return {returnData: null, blockNumber: null}
    returnData = returnData.concat(_data)
    blockNumber = result.blockNumber
    last += batch
  }
  return {returnData, blockNumber}
}

async function executeBatchCall(calls, successRequired = true) {
  const multicall = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, getProvider())
  try {
    const callData = calls.map((call) => {
      const contractInterface = new ethers.utils.Interface(call.abi)
      return [
        call.address,
        contractInterface.encodeFunctionData(call.method, call.params),
      ]
    })
    const {blockNumber, returnData} = await multicall.callStatic.aggregate(successRequired, callData);
    return {
      returnData: returnData.map((call, i) => {
        const contractInterface = new ethers.utils.Interface(calls[i].abi)
        return contractInterface.decodeFunctionResult(calls[i].method, call)
      }),
      blockNumber
    }
  } catch (e) {
    console.log("failed", calls, e)
    return {returnData: null, blockNumber: null}
  }
}

module.exports = {getProvider, executeStaticCall}