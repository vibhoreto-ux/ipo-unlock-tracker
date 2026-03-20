const { readDB, writeDB } = require('./db');
const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'Referer': 'https://www.chittorgarh.com/',
    'Origin': 'https://www.chittorgarh.com',
};

async function fetchRHPForCompany(company) {
    if (!company.chittorgarhUrl) return null;
    const targetUrl = company.chittorgarhUrl.startsWith('http') 
        ? company.chittorgarhUrl 
        : `https://www.chittorgarh.com${company.chittorgarhUrl}`;

    try {
        const res = await axios.get(targetUrl, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);
        const candidates = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().toLowerCase().trim();
            if (!href) return;
            if (href.startsWith('http') && href.toLowerCase().endsWith('.pdf')) {
                const isPdf = href.toLowerCase().endsWith('.pdf');
                const isRHP = text.includes('rhp') || text.includes('red herring') || href.toLowerCase().includes('rhp');
                const isDRHP = text.includes('drhp') || href.toLowerCase().includes('drhp');
                const isBSESME = href.includes('bsesme.com');
                const isBSE = href.includes('bseindia.com');
                if (isPdf && (isRHP || isDRHP)) {
                    let basePriority = (isRHP && !isDRHP) ? 10 : 20; // Final RHP beats DRHP
                    let domainPriority = isBSESME ? 1 : isBSE ? 2 : 3;
                    candidates.push({ href, priority: basePriority + domainPriority });
                }
            }
        });

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.priority - b.priority);
        return candidates[0].href;
    } catch (e) {
        return null;
    }
}

async function autoFetchMissingRHP() {
    let db = readDB();
    const missingURL = db.companies.filter(c => c.chittorgarhUrl && !c.rhpUrl);
    
    let updated = 0;
    if (missingURL.length > 0) {
        console.log(`[Auto-RHP] Found ${missingURL.length} companies missing RHP links. Fetching in background...`);
        for (const company of missingURL.slice(0, 10)) {
            const link = await fetchRHPForCompany(company);
            if (link) {
                company.rhpUrl = link;
                updated++;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        
        if (updated > 0) {
            writeDB(db);
            console.log(`[Auto-RHP] Saved ${updated} new RHP links to database.`);
        }
    }

    // Phase 2: Missing NLP Pre-IPO Extractions
    db = readDB(); // refresh db reference safely
    const missingNLP = db.companies.filter(c => c.rhpUrl && c.preIpoInvestors === undefined);
    
    if (missingNLP.length > 0) {
        console.log(`[Auto-RHP] Found ${missingNLP.length} companies missing Pre-IPO NLP data. Executing Python queue...`);
        const { execSync } = require('child_process');
        const path = require('path');
        // Point to the dedicated venv python executable
        const venvPython = path.join(__dirname, 'venv', 'bin', 'python');
        const pyScript = path.join(__dirname, 'nlp_extractor.py');
        
        let nlpUpdated = 0;
        // Restrict to 5 so we process sequentially without memory blowouts in the background
        for (const company of missingNLP.slice(0, 5)) {
            try {
                const pyCmd = `${venvPython} ${pyScript} --rhp "${company.rhpUrl}"`;
                console.log(`[Auto-RHP] Extracting Pre-IPO from RHP: ${company.companyName}`);
                const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 });
                const nlpData = JSON.parse(out.trim());
                company.preIpoInvestors = nlpData.preIpoInvestors || [];
                nlpUpdated++;
            } catch (e) {
                console.error(`[Auto-RHP] Pre-IPO failed on ${company.companyName}:`, e.message);
                // Assign empty array to prevent an infinite loop failure trap 
                company.preIpoInvestors = [];
                nlpUpdated++;
            }
        }
        
        if (nlpUpdated > 0) {
            writeDB(db);
            console.log(`[Auto-RHP] Saved ${nlpUpdated} new NLP Pre-IPO extractions to database.`);
        }
    }
}

module.exports = { autoFetchMissingRHP };
