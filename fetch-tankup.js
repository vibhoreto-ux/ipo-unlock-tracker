const { readDB, writeDB } = require('./db.js');
const cheerio = require('cheerio');
const execSync = require('child_process').execSync;

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'Referer': 'https://www.chittorgarh.com/',
    'Origin': 'https://www.chittorgarh.com',
};

async function run() {
    console.log("Locating Tankup Engineers...");
    const db = readDB();
    const tankup = db.companies.find(c => c.companyName.includes('Tankup'));
    if (!tankup) {
        console.log("Tankup not found in DB.");
        return;
    }
    
    // Fetch Chittorgarh page if we have no RHP
    if (!tankup.rhpUrl && tankup.chittorgarhUrl) {
        console.log(`Fetching from: ${tankup.chittorgarhUrl}`);
        const res = await fetch(tankup.chittorgarhUrl, { headers: HEADERS });
        const html = await res.text();
        const $ = cheerio.load(html);
        const candidates = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().toLowerCase().trim();
            if (href.startsWith('http') && href.toLowerCase().endsWith('.pdf')) {
                const isPdf = href.toLowerCase().endsWith('.pdf');
                const isRHP = text.includes('rhp') || text.includes('red herring') || href.toLowerCase().includes('rhp');
                const isDRHP = text.includes('drhp') || href.toLowerCase().includes('drhp');
                const isBSESME = href.includes('bsesme.com');
                const isBSE = href.includes('bseindia.com');
                if (isPdf && (isRHP || isDRHP)) {
                    let basePriority = (isRHP && !isDRHP) ? 10 : 20;
                    let domainPriority = isBSESME ? 1 : isBSE ? 2 : 3;
                    candidates.push({ href, priority: basePriority + domainPriority });
                }
            }
        });
        
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.priority - b.priority);
            tankup.rhpUrl = candidates[0].href;
            console.log(`Found RHP PDF: ${tankup.rhpUrl}`);
        } else {
            console.log("No RHP link found on Chittorgarh.");
        }
    }
    
    if (tankup.rhpUrl) {
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
    }
    
    writeDB(db);
    console.log("Database updated.");
}

run();
