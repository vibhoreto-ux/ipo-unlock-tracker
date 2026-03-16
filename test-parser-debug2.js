const fs = require('fs');
const scraper = require('./circular-scraper');
const pdf = require('pdf-parse');

async function debug() {
    const buffer = fs.readFileSync('/tmp/solarium.pdf');
    // I will mock the console.log in circular-scraper to intercept triplet data
    const origLog = console.log;
    console.log = (...args) => {
        if (args.join(' ').includes('[Parser] Found valid triplet')) {
             origLog(...args);
        } else if (args[0] && typeof args[0] === 'string' && args[0].includes('Parsed')) {
             origLog(...args);
        } else if (args[0] && typeof args[0] === 'string' && args[0].includes('Unlock events')) {
             origLog(...args);
        } else {
             // origLog(...args);
        }
    };
    try {
        const result = await scraper.parseLockInData(buffer);
        origLog(JSON.stringify(result, null, 2));
    } catch(e) { origLog(e); }
}
debug();
