const cheerio = require('cheerio');
const { readDB, writeDB } = require('./db.js');
const execSync = require('child_process').execSync;

async function run() {
    const url = "https://www.hemsecurities.com/investor-relations/offer-documents";
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        const $ = cheerio.load(html);
        let tankupLink = null;
        
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().toLowerCase();
            if (href.includes('tankup') || text.includes('tankup')) {
                if (href.includes('rhp') || text.includes('rhp') || text.includes('red')) {
                    tankupLink = href;
                }
                // fallback to any pdf
                if (!tankupLink && href.endsWith('.pdf')) tankupLink = href;
            }
        });
        
        if (tankupLink) {
            if (!tankupLink.startsWith('http')) {
                tankupLink = 'https://www.hemsecurities.com' + (tankupLink.startsWith('/') ? '' : '/') + tankupLink;
            }
            console.log(`FOUND TANKUP RHP: ${tankupLink}`);
            
            const db = readDB();
            const tankup = db.companies.find(c => c.companyName.includes('Tankup'));
            if (tankup) {
                tankup.rhpUrl = tankupLink;
                console.log("Extracting Pre-IPO from RHP...");
                const pyCmd = `venv/bin/python nlp_extractor.py --rhp "${tankupLink}"`;
                const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 });
                const nlpData = JSON.parse(out.trim());
                tankup.preIpoInvestors = nlpData.preIpoInvestors || [];
                console.log("Investors:", tankup.preIpoInvestors);
                writeDB(db);
                console.log("DB updated!");
            }
        } else {
            console.log("Tankup RHP not found on HEM Securities.");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}
run();
