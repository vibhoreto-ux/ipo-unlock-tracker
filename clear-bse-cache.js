const fs = require('fs');
const dbPath = './data/unlock-data.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

let clearedCount = 0;
for (const company of db.companies) {
    if (db.circularData[company.companyName]) {
        // wipe all of them so everything recalculates freshly with our perfect math codes
        delete db.circularData[company.companyName];
        clearedCount++;
    }
}
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`Successfully cleared cached ALL circular data for ${clearedCount} companies!`);
