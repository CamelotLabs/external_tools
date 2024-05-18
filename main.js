const { fetchProvidersPositionComposition, fetchPositionsPendingFees } = require('./src/v3-amm/positions-composition-snapshot')
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
    if(args._[0] === 'posCompV3') {
        const activeOnly = !!args.activeOnly
        result = await fetchProvidersPositionComposition(args.pool, args.block, activeOnly)
    }
    if(args._[0] === 'posPendingFeeV3') {
        const activeOnly = !!args.activeOnly
        result = await fetchPositionsPendingFees(args.pool, args.block, activeOnly)
    }
    if(args.output) exportResult(result, args.output)
}

main().then(() => console.log("done"))