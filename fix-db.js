const fs = require('fs');
const dbPath = './data/unlock-data.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

let cleared = 0;
for (const company of db.companies) {
    if (company.rhpUrl && company.rhpUrl.toLowerCase().includes('drhp')) {
        company.rhpUrl = '';
        company.preIpoInvestors = [];
        cleared++;
    }
}
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`Cleared ${cleared} bad DRHP links from DB.`);
