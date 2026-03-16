const scraper = require('./circular-scraper');
const fs = require('fs');
scraper.parseLockInData(fs.readFileSync('/tmp/solarium.pdf')).then(() => {});
