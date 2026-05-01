const fs = require('fs');
const db = JSON.parse(fs.readFileSync('./data/unlock-data.json', 'utf8'));
const today = new Date();
today.setHours(0,0,0,0);

const isUpcoming = c => {
    if (c.companyName.toLowerCase().includes('invit')) return false;
    const listDateStr = c.allotmentDate ? (c.allotmentDate.original || c.allotmentDate.adjusted) : null;
    if (!listDateStr) return true;
    const listDate = new Date(listDateStr);
    listDate.setHours(0,0,0,0);
    return listDate > today;
};

const allUpcoming = db.companies.filter(c => {
    if (c.companyName.toLowerCase().includes('invit')) return false;
    const listDateStr = c.allotmentDate ? (c.allotmentDate.original || c.allotmentDate.adjusted) : null;
    if (!listDateStr) return true;
    const listDate = new Date(listDateStr);
    listDate.setHours(0,0,0,0);
    return listDate > today;
});
console.log("Global Upcoming IPOs:", allUpcoming.length);
allUpcoming.forEach(c => {
    console.log(`- ${c.companyName} | Date: ${c.allotmentDate ? c.allotmentDate.original : 'null'}`);
});
