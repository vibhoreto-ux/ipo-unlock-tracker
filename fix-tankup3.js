const { readDB, writeDB } = require('./db.js');
const execSync = require('child_process').execSync;

async function run() {
    try {
        const rhpLink = 'https://www.tankup.co.in/wp-content/uploads/2025/08/FINAL-RHP-Tankup.pdf';
        console.log("USING RHP:", rhpLink);
        const db = readDB();
        const tankup = db.companies.find(c => c.companyName.includes('Tankup'));
        if (tankup) {
            tankup.rhpUrl = rhpLink;
            console.log("Extracting Pre-IPO from RHP...");
            const pyCmd = `venv/bin/python nlp_extractor.py --rhp "${rhpLink}" --company_name "Tankup Engineers Ltd."`;
            const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 });
            const nlpData = JSON.parse(out.trim());
            tankup.preIpoInvestors = nlpData.preIpoInvestors || [];
            console.log("Investors:", tankup.preIpoInvestors);
            writeDB(db);
            console.log("DB updated!");
        }
    } catch(e) {
        console.error(e.message);
    }
}
run();
