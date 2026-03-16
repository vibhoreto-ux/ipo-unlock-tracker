const fs = require('fs');
const pdf = require('pdf-parse');
const scraper = require('./circular-scraper');

async function test() {
    const data = await pdf(fs.readFileSync('/tmp/shanmuga.pdf'));
    let text = data.text;
    text = text.replace(/(\d{1,2})-\s*\n\s*(\w{3,})-\s*\n?\s*(\d{4})/g, '$1-$2-$3');
    text = text.replace(/(\d{1,2})-\s*\n\s*(\w{3,})-(\d{4})/g, '$1-$2-$3');
    const result = scraper.parseLockInData(fs.readFileSync('/tmp/shanmuga.pdf'));
    result.then(r => console.log(JSON.stringify(r))).catch(e => console.error(e));
}
test();
