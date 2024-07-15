const express = require('express')
const { fetchProvidersPositionComposition } = require('./src/v3-amm/positions-composition-snapshot')

const app = express()
const port = process.env.PORT || 3000

app.get('/v3-composition/:pool/:block', async (req, res) => {
  const pool = req.params.pool;
  const block = req.params.block;
  const data = await fetchProvidersPositionComposition(pool, block, false)

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data))
})

app.get('/', (req, res) => {
  res.send("/")
})

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})