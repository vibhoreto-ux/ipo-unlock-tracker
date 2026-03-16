const fs = require('fs');
const pdf = require('pdf-parse');

async function debug() {
    const buffer = fs.readFileSync('/tmp/solarium.pdf');
    const data = await pdf(buffer);
    const norm = data.text;
    let text = norm.replace(/([A-Z][a-z]{2,8})\s+(\d{1,2}),\s+(\d{4})/g, '$2-$1-$3');
    let textForNums = text.replace(/(\d{1,2})-(\w{3,})-(\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/g, match => ' '.repeat(match.length));

    const numRegex = /(?<![\d,])(\d{1,3}(?:,\d{2,3})+|\d+)(?![\d,])/g;
    let m;
    while ((m = numRegex.exec(textForNums)) !== null) {
        let valStr = m[1];
        let endIdx = m.index + valStr.length;
        console.log(`[Num] ${valStr} ends at ${endIdx}. Text there: ${JSON.stringify(text.substring(endIdx, endIdx+20))}`);
    }
}
debug();
