const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = path.join(__dirname, 'data', 'unlock-data.json');
let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
const today = new Date();
today.setHours(0,0,0,0);

// Get the 13 upcoming companies exactly as UI defines them
const allUpcoming = db.companies.filter(c => {
    if (c.companyName.toLowerCase().includes('invit')) return false;
    const listDateStr = c.allotmentDate ? (c.allotmentDate.original || c.allotmentDate.adjusted) : null;
    if (!listDateStr) return true;
    const listDate = new Date(listDateStr);
    listDate.setHours(0,0,0,0);
    return listDate > today;
});

// Find which of these 13 are stuck in "Scanning RHP..." because of NO LINK
const missingLink = allUpcoming.filter(c => !c.rhpUrl);

console.log(`[Priority-RHP] Found ${missingLink.length} upcoming companies with NO RHP link:`);
missingLink.forEach(c => console.log(`- ${c.companyName}`));

console.log(`[Priority-RHP] Found ${missingNLP.length} upcoming companies missing NLP extractions.`);

if (missingNLP.length > 0) {
    const venvPython = path.join(__dirname, 'venv', 'bin', 'python');
    const pyScript = path.join(__dirname, 'nlp_extractor.py');

    for (const company of missingNLP) {
        try {
            console.log(`[Priority-RHP] Aggressively Scanning PDF: ${company.companyName}`);
            const pyCmd = `${venvPython} ${pyScript} --rhp "${company.rhpUrl}"`;
            const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 120000 });
            const nlpData = JSON.parse(out.trim());
            company.preIpoInvestors = nlpData.preIpoInvestors || [];
            console.log(`[Priority-RHP] Found: ${company.preIpoInvestors.length} Pre-IPO placements.`);
        } catch (e) {
            console.error(`[Priority-RHP] Failed on ${company.companyName}:`, e.message);
            company.preIpoInvestors = [];
        }
    }
    
    // Map them back into db.companies
    db.companies = db.companies.map(c => {
        const update = missingNLP.find(m => m.companyName === c.companyName);
        return update ? update : c;
    });
    
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log(`[Priority-RHP] Successfully saved specialized memory matrix. UI will now reflect 0 Pre-IPOs or Placements.`);
}
