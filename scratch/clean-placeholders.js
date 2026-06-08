const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'unlock-data.json');
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

let cleaned = 0;
db.companies.forEach(c => {
    if (c.rhpUrl && c.rhpUrl.includes('keyword/rhp-detail')) {
        c.rhpUrl = null;
        c.preIpoInvestors = undefined;
        cleaned++;
    }
});

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
console.log(`Successfully cleaned ${cleaned} placeholder RHP entries in database.`);
