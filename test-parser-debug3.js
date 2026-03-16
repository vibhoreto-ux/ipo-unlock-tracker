const fs = require('fs');
const scraper = require('./circular-scraper');

async function debug() {
    const buffer = fs.readFileSync('/tmp/solarium.pdf');
    const result = await scraper.parseLockInData(buffer);
    console.log(JSON.stringify(result, null, 2));
}
debug();
