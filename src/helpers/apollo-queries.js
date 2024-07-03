const {gql} = require("apollo-boost");

async function queryApollo(uri, queryString, authToken) {
  try {
    const _client = require('apollo-boost/lib/index').default;

    const headers = {}
    if(authToken) headers.authorization = authToken

    const client = new _client({uri, headers})
    const query = gql(queryString)
    const result = await client.query({query})
    return result.data
  } catch (e) {
    console.log(queryString, e)
    return null
  }
}

module.exports = {queryApollo}