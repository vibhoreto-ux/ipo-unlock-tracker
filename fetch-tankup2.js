const { readDB, writeDB } = require('./db.js');
const cheerio = require('cheerio');
const execSync = require('child_process').execSync;

async function run() {
    console.log("Locating Tankup Engineers...");
    const db = readDB();
    const tankup = db.companies.find(c => c.companyName.includes('Tankup'));
    if (!tankup) return;
    
    // Fallback: search using DuckDuckGo
    console.log("Searching DDG...");
    const params = new URLSearchParams();
    params.append('q', '"Tankup Engineers Ltd." RHP filetype:pdf');
    params.append('kl', 'in-en');
    
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
    });
    
    const html = await res.text();
    const $ = cheerio.load(html);
    let bestLink = null;
    
    $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && href.toLowerCase().endsWith('.pdf')) {
            bestLink = href;
        }
    });

    if (bestLink) {
        console.log("Found RHP:", bestLink);
        tankup.rhpUrl = bestLink;
        
        try {
            console.log("Extracting Pre-IPO from RHP Python parser...");
            const pyCmd = `venv/bin/python nlp_extractor.py --rhp "${tankup.rhpUrl}"`;
            const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 });
            const nlpData = JSON.parse(out.trim());
            tankup.preIpoInvestors = nlpData.preIpoInvestors || [];
            console.log("Successfully extracted Pre-IPO investors:", tankup.preIpoInvestors);
        } catch(e) {
            console.error("Python extraction failed:", e.message);
            tankup.preIpoInvestors = []; // Set empty so it doesn't get retried immediately
        }
        
        writeDB(db);
        console.log("Database updated.");
    } else {
        console.log("No result on DDG either!");
        tankup.preIpoInvestors = [];
        writeDB(db);
    }
}
run();
