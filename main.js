const { fetchProvidersPositionComposition } = require('./src/v3-amm/position-compositon-snapshot')
const fs = require('fs')
const minimist = require('minimist')

function exportResult(data, filename) {
    fs.writeFile(filename, JSON.stringify(data), function(err, result) {
        if(err) console.log('error', err);
    })
}

async function main() {
    const args = minimist(process.argv.slice(2), opts={'string': ['pool'] });
    let result = null
    if(args._[0] === 'v3Snapshort') {
        const activeOnly = args.activeOnly ? true : false
        result = await fetchProvidersPositionComposition(args.pool, 207201586, activeOnly)

    }
    if(args.output) exportResult(result, args.output)
}

main().then(() => console.log("done"))

