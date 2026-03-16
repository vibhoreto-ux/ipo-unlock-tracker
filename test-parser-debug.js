const fs = require('fs');
const pdf = require('pdf-parse');
const scraper = require('./circular-scraper');

async function debug() {
    const buffer = fs.readFileSync('/tmp/solarium.pdf');
    const data = await pdf(buffer);
    const text = data.text;
    console.log("=== Original Text ===");
    console.log(text);
    
    let textForNums = text.replace(/(\d{1,2})-(\w{3,})-(\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/g, match => ' '.repeat(match.length));
    console.log("=== Scrubbed Text ===");
    console.log(textForNums);

    const numRegex = /(?<![\d,])(\d{1,3}(?:,\d{2,3})+|\d+)(?![\d,])/g;
    const nums = [];
    let m;
    while ((m = numRegex.exec(textForNums)) !== null) {
        nums.push({ valStr: m[1], index: m.index });
    }
    console.log("=== Nums extracted ===");
    console.log(nums);
}
debug();
