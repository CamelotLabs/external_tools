require('dotenv').config()

const V3_AMM_SUBGRAPH = `https://gateway-arbitrum.network.thegraph.com/api/${process.env.AMMV3_SUBGRAPH_API_KEY}/subgraphs/id/3utanEBA9nqMjPnuQP1vMCCys6enSM3EawBpKTVwnUw2`
const V3_AMM_SUBGRAPH_AUTH_KEY = null

module.exports = { V3_AMM_SUBGRAPH, V3_AMM_SUBGRAPH_AUTH_KEY }
