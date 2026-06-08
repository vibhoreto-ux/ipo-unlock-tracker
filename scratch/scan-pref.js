const { scanPreferential } = require('../preferential-scraper.js');

async function main() {
    console.log('Starting full preferential unlock scan...');
    const results = await scanPreferential(true);
    console.log(`Scan completed. Total results: ${results.length}`);
}

main().catch(err => {
    console.error('Fatal error in preferential scan:', err);
});
