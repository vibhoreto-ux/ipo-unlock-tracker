const fs = require('fs');
const scraper = require('./circular-scraper');

async function debug() {
    const buffer = fs.readFileSync('/tmp/solarium.pdf');
    const origLog = console.log;
    console.log = function(...args) {
        origLog(...args);
    };
    
    // Quick script to see what findDateNear returns when given a substring
    const p = require('pdf-parse');
    const data = await p(buffer);
    const text = data.text;
    
    // For 779400 block, the text near it is:
    const idx1 = text.indexOf('16129400');
    console.log("Date near 779400 (C = 16129400):", findDateNearLoc(text, idx1 + 8, 120));
    
    // For 783600 block (C = 16913000)
    const idx2 = text.indexOf('16913000');
    console.log("Date near 783600 (C = 16913000):", findDateNearLoc(text, idx2 + 8, 120));
}

function findDateNearLoc(text, startIndex, range) {
    let chunk = text.substring(startIndex, startIndex + range);
    const newlineIdx = chunk.indexOf('\n');
    if (newlineIdx > 0) {
        chunk = chunk.substring(0, newlineIdx);
    }
    const dateRegex = /(\d{1,2})-(\w{3,})-(\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
    let match;
    const dates = [];
    while ((match = dateRegex.exec(chunk)) !== null) {
        const d = parseBSEDateLoc(match[0]);
        if (d && d.getFullYear() > 2000) dates.push({ date: d, index: match.index });
    }
    return { chunk, dates };
}

function parseBSEDateLoc(dateStr) {
    if (!dateStr) return null;

    let match = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
        const dayStr = match[1] || match[4];
        const monthStr = match[2] || match[5];
        const yearStr = match[3] || match[6];
        const day = parseInt(dayStr, 10);
        const month = parseInt(monthStr, 10) - 1; // 0-indexed
        const year = parseInt(yearStr, 10);
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        return new Date(year, month, day);
    }
    return null;
}
debug();
