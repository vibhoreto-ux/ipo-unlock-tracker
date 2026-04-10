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

        if (candidates.length === 0) return await fetchRHPFallback(company.companyName);
        candidates.sort((a, b) => a.priority - b.priority);
        return candidates[0].href;
    } catch (e) {
        return await fetchRHPFallback(company.companyName);
    }
}

async function fetchRHPFallback(companyName) {
    console.log(`[Auto-RHP] Fallback DDG search for: ${companyName}`);
    try {
        const res = await axios.post('https://lite.duckduckgo.com/lite/', 
            `q=${encodeURIComponent('"' + companyName + '" RHP OR DRHP filetype:pdf')}&kl=in-en`, 
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            }
        );
        const $ = cheerio.load(res.data);
        const candidates = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('http') && href.toLowerCase().endsWith('.pdf')) {
                const isNSE = href.includes('nseindia.com');
                const isBSE = href.includes('bseindia.com');
                const isSEBI = href.includes('sebi.gov.in');
                
                let score = 0;
                if (isSEBI) score += 10;
                if (isNSE || isBSE) score += 5;
                if (href.toLowerCase().includes('rhp')) score += 3;
                if (href.toLowerCase().includes('drhp')) score += 1;
                
                candidates.push({ href, score });
            }
        });
        
        if (candidates.length === 0) return null;
        candidates.sort((a,b) => b.score - a.score);
        return candidates[0].href;
    } catch (e) {
        console.error(`[Auto-RHP] Fallback failed for ${companyName}:`, e.message);
        return null;
    }
}

async function autoFetchMissingRHP() {
    let db = readDB();
    const now = new Date();
    const missingURL = db.companies.filter(c => {
        if (c.rhpUrl) return false;
        const ipoDate = c.allotmentDate ? new Date(c.allotmentDate.original || c.allotmentDate.adjusted) : null;
        if (!ipoDate) return true; // always target recent TBD IPOs
        return (now.getTime() - ipoDate.getTime()) < 730 * 24 * 3600000; // past 2 years only to avoid ban limits
    });
    
    // Prioritize upcoming IPOs (future allotment dates) over historical backfills
    missingURL.sort((a, b) => {
        const aFut = a.allotmentDate && new Date(a.allotmentDate.original) > now;
        const bFut = b.allotmentDate && new Date(b.allotmentDate.original) > now;
        if (aFut && !bFut) return -1;
        if (!aFut && bFut) return 1;
        return 0;
    });
    
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
        missingNLP.sort((a, b) => {
            const aFut = a.allotmentDate && new Date(a.allotmentDate.original) > now;
            const bFut = b.allotmentDate && new Date(b.allotmentDate.original) > now;
            if (aFut && !bFut) return -1;
            if (!aFut && bFut) return 1;
            return 0;
        });

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
                console.log(`Extracting Pre-IPO from RHP: ${company.rhpUrl}...`);
                const safelyEscapedName = company.companyName.replace(/"/g, '\\"');
                const pyCmd = `venv/bin/python nlp_extractor.py --rhp "${company.rhpUrl}" --company_name "${safelyEscapedName}"`;
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
