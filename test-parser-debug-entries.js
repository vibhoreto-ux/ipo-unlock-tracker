const fs = require('fs');
const scraper = require('./circular-scraper');

async function debug() {
    const origLog = console.log;
    console.log = function(...args){
        if (args.join(' ').includes('[Parser] Unlock events')) origLog(...args);
    };
    
    // intercept buildUnlockEvents to print lockInEntries
    const rawParser = scraper.parseUniversalBSEFormat || require('./circular-scraper').__get__('parseUniversalBSEFormat'); 
    // Wait, I can't easily intercept a private function inside another module. I'll just print buildUnlockEvents input if I can, but I can't.
    // Instead I'll rewrite the parser core in an eval or just use grep/sed to modify the local file temporarily.
}
debug();
