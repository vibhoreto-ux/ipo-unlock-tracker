const fs = require('fs');
const { parseLockInData } = require('./circular-scraper');

async function test() {
    const pdfBuffer = fs.readFileSync('/tmp/malpani.pdf');
    try {
        const result = await parseLockInData(pdfBuffer);
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    }
}
test();
