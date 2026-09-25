const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const cheerio = require('cheerio');

const DB_PATH = path.join(__dirname, 'data', 'unlock-data.json');
let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

function getNextWeekRange() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) + 7;
    const start = new Date(now.setDate(diff));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

const { start, end } = getNextWeekRange();
console.log(`[NextWeek-Batch] Range: ${start.toDateString()} to ${end.toDateString()}`);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.chittorgarh.com/',
    'Origin': 'https://www.chittorgarh.com',
};

async function fetchRHPForCompany(company) {
    if (company.rhpUrl) return company.rhpUrl;
    if (!company.chittorgarhUrl) return await fetchRHPFallback(company.companyName);

    const targetUrl = company.chittorgarhUrl.startsWith('http') 
        ? company.chittorgarhUrl 
        : `https://www.chittorgarh.com${company.chittorgarhUrl}`;

    try {
        console.log(`[NextWeek-Batch] Fetching Chittorgarh page for: ${company.companyName}`);
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
                    let basePriority = (isRHP && !isDRHP) ? 10 : 20;
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
    console.log(`[NextWeek-Batch] Fallback DDG search for: ${companyName}`);
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
        console.error(`[NextWeek-Batch] Fallback failed for ${companyName}:`, e.message);
        return null;
    }
}

async function main() {
    const nextWeekCompanies = db.companies.filter(c => {
        const dates = [];
        if (c.anchor30) dates.push(new Date(c.anchor30.adjusted || c.anchor30.original));
        if (c.anchor90) dates.push(new Date(c.anchor90.adjusted || c.anchor90.original));
        if (c.preIPO) dates.push(new Date(c.preIPO.expiryDate || c.preIPO.originalDate));
        return dates.some(d => d >= start && d <= end);
    });

    console.log(`[NextWeek-Batch] Found ${nextWeekCompanies.length} Next Week companies.`);

    let venvPython = 'python3';
    if (fs.existsSync(path.join(__dirname, 'venv', 'bin', 'python'))) {
        venvPython = path.join(__dirname, 'venv', 'bin', 'python');
    }
    const pyScript = path.join(__dirname, 'nlp_extractor.py');

    for (let i = 0; i < nextWeekCompanies.length; i++) {
        const company = nextWeekCompanies[i];
        console.log(`\n--- [${i+1}/${nextWeekCompanies.length}] Processing: ${company.companyName} ---`);

        // Skip InvITs / REITs if no RHP exists
        if (company.companyName.toLowerCase().includes('invit') || company.companyName.toLowerCase().includes('trust')) {
            console.log(`Skipping Trust / InvIT`);
            continue;
        }

        // 1. Ensure RHP URL
        if (!company.rhpUrl) {
            const rhp = await fetchRHPForCompany(company);
            if (rhp) {
                console.log(`Found RHP: ${rhp}`);
                company.rhpUrl = rhp;
            }
        }

        // 2. Extract Pre-IPO investors if missing or empty
        if (company.rhpUrl && (!company.preIpoInvestors || company.preIpoInvestors.length === 0)) {
            try {
                console.log(`Extracting NLP Pre-IPO data for ${company.companyName}...`);
                const safelyEscapedName = company.companyName.replace(/"/g, '\\"');
                const pyCmd = `${venvPython} ${pyScript} --rhp "${company.rhpUrl}" --company_name "${safelyEscapedName}"`;
                const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 120000 });
                const nlpData = JSON.parse(out.trim());
                if (nlpData.preIpoInvestors && nlpData.preIpoInvestors.length > 0) {
                    company.preIpoInvestors = nlpData.preIpoInvestors;
                    console.log(`-> Extracted ${company.preIpoInvestors.length} Pre-IPO investors.`);
                } else {
                    console.log(`-> 0 Pre-IPO investors found in Capital Structure (Promoter/Clean).`);
                    company.preIpoInvestors = [];
                }
                if (nlpData.waca !== undefined && nlpData.waca !== null) {
                    company.preIpoWaca = nlpData.waca;
                    console.log(`-> WACA: ₹${company.preIpoWaca}`);
                }
                if (nlpData.peerComparison) {
                    company.peerComparison = nlpData.peerComparison;
                }
            } catch (err) {
                console.error(`NLP Extraction failed for ${company.companyName}:`, err.message);
            }
        } else {
            console.log(`Pre-IPO investors already present: ${(company.preIpoInvestors || []).length} investors, WACA: ${company.preIpoWaca}`);
        }

        // 3. Cache notice lock-in details from server if running
        try {
            const detailRes = await axios.get(`http://localhost:3000/api/unlock-details/${encodeURIComponent(company.companyName)}`, {
                timeout: 30000
            });
            if (detailRes.data && detailRes.data.found) {
                console.log(`-> Notice Lock-ins cached: ${(detailRes.data.lockIns || []).length} entries.`);
            }
        } catch (e) {
            // Server call optional
        }

        // Save progress after each company
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }

    console.log(`\n[NextWeek-Batch] Finished processing all Next Week candidates!`);
}

main().catch(err => console.error('Batch failed:', err));
