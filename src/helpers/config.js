require('dotenv').config()

const V3_AMM_SUBGRAPH = `https://gateway-arbitrum.network.thegraph.com/api/${process.env.AMMV3_SUBGRAPH_API_KEY}/deployments/id/QmVPCT62C6b2m2D3AnfEF1hJhhmYEenuQtUDLMj1vEBt4m`
const V3_AMM_SUBGRAPH_AUTH_KEY = null

module.exports = { V3_AMM_SUBGRAPH, V3_AMM_SUBGRAPH_AUTH_KEY }
