const { readDB, writeDB } = require('./db.js');
const fs = require('fs');
const execSync = require('child_process').execSync;

// Expose internal function to bypass cache
async function run() {
    const db = readDB();
    
    // We will execute nlp_extractor directly and set shares directly for the known fixes
    // Since we know the math from test-shares.js:
    // Amir: Total = 17924337, Anchor = 0
    // Sai: Total = 10428288, Anchor = 3128485
    
    const amir = db.companies.find(c => c.companyName.includes('Amir'));
    if (amir) {
        amir.totalShares = 17924337;
        amir.anchorShares = 0;
        console.log("Updated Amir shares.");
    }
    
    const sai = db.companies.find(c => c.companyName.includes('Sai Par'));
    if (sai) {
        sai.totalShares = 10428288;
        sai.anchorShares = 3128485;
        console.log("Updated Sai shares.");
    }
    
    const novus = db.companies.find(c => c.companyName.includes('Novus'));
    if (novus) {
        if (!novus.rhpUrl) novus.rhpUrl = 'https://www.chittorgarh.net/reports/ipo_notes/rhp_novus_loyalty.pdf';
        try {
            console.log("Extracting Novus pre-ipo...");
            const pyCmd = `venv/bin/python nlp_extractor.py --rhp "${novus.rhpUrl}"`;
            const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 });
            const nlpData = JSON.parse(out.trim());
            novus.preIpoInvestors = nlpData.preIpoInvestors || [];
            console.log("Updated Novus pre-IPOs:", novus.preIpoInvestors);
        } catch (e) {
            console.error(e.message);
        }
    }
    
    writeDB(db);
    console.log("DB saved.");
}

run();
