const fs = require('fs');
const pdf = require('pdf-parse');
const scraper = require('./circular-scraper');

async function test() {
    const data = await pdf(fs.readFileSync('/tmp/shanmuga.pdf'));
    let text = data.text;
    
    // We will hook into console.log and print lockInEntries.
    // Wait, the easiest way is to intercept the parsed result!
    const result = await scraper.parseLockInData(fs.readFileSync('/tmp/shanmuga.pdf'));
    console.log(JSON.stringify(result, null, 2));
}
test();
