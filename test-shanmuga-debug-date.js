const fs = require('fs');
const pdf = require('pdf-parse');

function findDateNear(text, startIndex, range) {
    let chunk = text.substring(startIndex, startIndex + Math.min(range, 60));
    console.log(`[CHUNK START for idx ${startIndex}] -> ${JSON.stringify(chunk)}`);
    const newlineIdx = chunk.indexOf('\n');
    if (newlineIdx > 0) {
        chunk = chunk.substring(0, newlineIdx);
    }
    const dateRegex = /(\d{1,2})-(\w{3,}|\d{1,2})-(\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
    let match;
    const dates = [];
    while ((match = dateRegex.exec(chunk)) !== null) {
        dates.push({ date: match[0], index: match.index });
    }
    console.log(`Dates found in chunk:`, dates);
    return dates;
}

async function debug() {
    const data = await pdf(fs.readFileSync('/tmp/shanmuga.pdf'));
    let norm = data.text;
    let text = norm.replace(/([A-Z][a-z]{2,8})\s+(\d{1,2}),\s+(\d{4})/g, '$2-$1-$3');
    let textForNums = text.replace(/(\d{1,2})-(\w{3,}|\d{1,2})-(\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/g, match => ' '.repeat(match.length));

    const numRegex = /(?<![\d,])(\d{1,3}(?:,\d{2,3})+|\d+)(?![\d,])/g;
    let m;
    while ((m = numRegex.exec(textForNums)) !== null) {
        let valStr = m[1];
        let endIdx = m.index + valStr.length;
        console.log(`\nMatched ${valStr} at index ${m.index}. endIndex = ${endIdx}`);
        findDateNear(text, endIdx, 60);
    }
}
debug();
