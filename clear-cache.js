const fs = require('fs');
const dbPath = './data/unlock-data.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
if (db.circularData['Beezaasan Explotech Ltd.']) {
    delete db.circularData['Beezaasan Explotech Ltd.'];
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    console.log('Cleared Beezaasan Explotech cache!');
} else {
    console.log('Cache already cleared.');
}
