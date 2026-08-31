const { readDB, writeDB } = require('./db');
const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'Referer': 'https://www.chittorgarh.com/',
    'Origin': 'https://www.chittorgarh.com',
};

function isValidRHPUrl(url) {
    if (!url) return false;
    const l = url.toLowerCase();
    if (l.includes('keyword/rhp-detail')) return false;
    return l.endsWith('.pdf') || l.endsWith('.zip');
}

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
            if (href.startsWith('http') && (href.toLowerCase().endsWith('.pdf') || href.toLowerCase().endsWith('.zip'))) {
                const isPdf = href.toLowerCase().endsWith('.pdf');
                const isZip = href.toLowerCase().endsWith('.zip');
                const isRHP = text.includes('rhp') || text.includes('red herring') || href.toLowerCase().includes('rhp');
                const isDRHP = text.includes('drhp') || href.toLowerCase().includes('drhp');
                const isBSESME = href.includes('bsesme.com');
                const isBSE = href.includes('bseindia.com');
                if ((isPdf || isZip) && (isRHP || isDRHP)) {
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
            if (href && href.startsWith('http') && (href.toLowerCase().endsWith('.pdf') || href.toLowerCase().endsWith('.zip'))) {
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
        if (isValidRHPUrl(c.rhpUrl)) return false;
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
    // Try capital structure PDF first (small, fast), then fall back to full RHP
    db = readDB(); // refresh db reference safely
    // Expanded scope: include companies missing preIpoInvestors even without RHP URL,
    // since IPO Premium capital structure PDFs can be found independently.
    const missingNLP = db.companies.filter(c => {
        if (c.preIpoInvestors !== undefined) return false;
        // Must have either an RHP URL or a recent allotment date (to try capital structure)
        const ipoDate = c.allotmentDate ? new Date(c.allotmentDate.original || c.allotmentDate.adjusted) : null;
        if (isValidRHPUrl(c.rhpUrl)) return true;
        if (!ipoDate) return true; // TBD IPOs
        return (now.getTime() - ipoDate.getTime()) < 730 * 24 * 3600000; // past 2 years
    });
    
    if (missingNLP.length > 0) {
        missingNLP.sort((a, b) => {
            const aFut = a.allotmentDate && new Date(a.allotmentDate.original) > now;
            const bFut = b.allotmentDate && new Date(b.allotmentDate.original) > now;
            if (aFut && !bFut) return -1;
            if (!aFut && bFut) return 1;
            return 0;
        });

        console.log(`[Auto-RHP] Found ${missingNLP.length} companies missing Pre-IPO NLP data.`);
        const { execSync } = require('child_process');
        const path = require('path');
        let pythonBin = process.env.PYTHON_BIN || 'python3';
        const fs = require('fs');
        if (fs.existsSync(path.join(__dirname, 'venv', 'bin', 'python'))) {
            pythonBin = path.join(__dirname, 'venv', 'bin', 'python');
        }
        const pyScript = path.join(__dirname, 'nlp_extractor.py');

        // Import capital structure scraper (lazy)
        let capStructScraper;
        try {
            capStructScraper = require('./capital-structure-scraper');
        } catch (e) {
            console.error('[Auto-RHP] Capital structure scraper not available:', e.message);
        }
        
        let nlpUpdated = 0;
        // Restrict to 5 so we process sequentially without memory blowouts in the background
        for (const company of missingNLP.slice(0, 5)) {
            let extracted = false;

            // --- Strategy 1: Try Capital Structure PDF (fast, small) ---
            if (capStructScraper) {
                try {
                    console.log(`[Auto-RHP] Trying capital structure PDF for: ${company.companyName}...`);
                    const csResult = await capStructScraper.extractFromCapitalStructure(company.companyName);
                    
                    if (csResult.preIpoInvestors && csResult.preIpoInvestors.length > 0) {
                        company.preIpoInvestors = csResult.preIpoInvestors;
                        if (csResult.waca !== undefined && csResult.waca !== null) {
                            company.preIpoWaca = csResult.waca;
                        }
                        if (csResult.peerComparison) {
                            company.peerComparison = csResult.peerComparison;
                        }
                        nlpUpdated++;
                        extracted = true;
                        console.log(`[Auto-RHP] ✅ Capital structure extracted ${csResult.preIpoInvestors.length} pre-IPO investors for ${company.companyName}`);
                    }
                } catch (e) {
                    console.warn(`[Auto-RHP] Capital structure failed for ${company.companyName}:`, e.message);
                }
            }

            // --- Strategy 2: Fall back to full RHP PDF ---
            if (!extracted && isValidRHPUrl(company.rhpUrl)) {
                try {
                    console.log(`[Auto-RHP] Falling back to full RHP: ${company.rhpUrl}...`);
                    const safelyEscapedName = company.companyName.replace(/"/g, '\\"');
                    const pyCmd = `${pythonBin} ${pyScript} --rhp "${company.rhpUrl}" --company_name "${safelyEscapedName}"`;
                    const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 });
                    const nlpData = JSON.parse(out.trim());
                    company.preIpoInvestors = nlpData.preIpoInvestors || [];
                    if (nlpData.waca !== undefined && nlpData.waca !== null) {
                        company.preIpoWaca = nlpData.waca;
                    }
                    if (nlpData.peerComparison) {
                        company.peerComparison = nlpData.peerComparison;
                    }
                    nlpUpdated++;
                    extracted = true;
                } catch (e) {
                    console.error(`[Auto-RHP] Full RHP failed on ${company.companyName}:`, e.message);
                }
            }

            // --- Mark as empty if both strategies failed (prevent infinite retry loop) ---
            if (!extracted) {
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
