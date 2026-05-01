const cheerio = require('cheerio');
const { readDB, writeDB } = require('./db.js');
const execSync = require('child_process').execSync;

async function run() {
    try {
        const url = 'https://www.tankup.co.in/offer-documents/';
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await res.text();
        const $ = cheerio.load(html);
        let rhpLink = null;
        
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.endsWith('.pdf')) {
                const text = $(el).text().toLowerCase();
                console.log("PDF Link:", text, "->", href);
                // Check if it's the RHP
                if (text.includes('rhp') || text.includes('prospectus') || text.includes('red herring') || href.toLowerCase().includes('rhp')) {
                    rhpLink = href;
                }
                if (!rhpLink) rhpLink = href; // Default to the first PDF found just in case
            }
        });
        
        if (rhpLink) {
            console.log("USING RHP:", rhpLink);
            const db = readDB();
            const tankup = db.companies.find(c => c.companyName.includes('Tankup'));
            if (tankup) {
                tankup.rhpUrl = rhpLink;
                console.log("Extracting Pre-IPO from RHP...");
                const pyCmd = `venv/bin/python nlp_extractor.py --rhp "${rhpLink}"`;
                const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 });
                const nlpData = JSON.parse(out.trim());
                tankup.preIpoInvestors = nlpData.preIpoInvestors || [];
                console.log("Investors:", tankup.preIpoInvestors);
                writeDB(db);
                console.log("DB updated!");
            }
        } else {
            console.log("No PDFs found on the page.");
        }
    } catch(e) {
        console.error(e.message);
    }
}
run();
