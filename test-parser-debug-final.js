const fs = require('fs');
const pdf = require('pdf-parse');
async function debug() {
    const data = await pdf(fs.readFileSync('/tmp/solarium.pdf'));
    let norm = data.text;
    let text = norm.replace(/([A-Z][a-z]{2,8})\s+(\d{1,2}),\s+(\d{4})/g, '$2-$1-$3');
    let textForNums = text.replace(/(\d{1,2})-(\w{3,})-(\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/g, match => ' '.repeat(match.length));
    
    console.log("length of text is", text.length);
    console.log("length of textForNums is", textForNums.length);

    const numRegex = /(?<![\d,])(\d{1,3}(?:,\d{2,3})+|\d+)(?![\d,])/g;
    let m;
    while ((m = numRegex.exec(textForNums)) !== null) {
        let valStr = m[1];
        console.log(`Matched ${valStr} at index ${m.index}. endIndex = ${m.index + valStr.length}`);
    }
}
debug();
