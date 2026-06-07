const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const cheerio = require('cheerio');

const DB_PATH = path.join(__dirname, 'data', 'unlock-data.json');
let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
const today = new Date();
today.setHours(0,0,0,0);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.chittorgarh.com/',
    'Origin': 'https://www.chittorgarh.com',
};

async function fetchRHPForCompany(company) {
    if (!company.chittorgarhUrl) return null;
    const targetUrl = company.chittorgarhUrl.startsWith('http') 
        ? company.chittorgarhUrl 
        : `https://www.chittorgarh.com${company.chittorgarhUrl}`;

    try {
        console.log(`[Priority-RHP] Fetching Chittorgarh page for: ${company.companyName}`);
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
    console.log(`[Priority-RHP] Fallback DDG search for: ${companyName}`);
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
        console.error(`[Priority-RHP] Fallback failed for ${companyName}:`, e.message);
        return null;
    }
}

async function main() {
    // 1. Get the upcoming companies
    const allUpcoming = db.companies.filter(c => {
        if (c.companyName.toLowerCase().includes('invit')) return false;
        const listDateStr = c.allotmentDate ? (c.allotmentDate.original || c.allotmentDate.adjusted) : null;
        if (!listDateStr) return true;
        const listDate = new Date(listDateStr);
        listDate.setHours(0,0,0,0);
        return listDate > today;
    });

    console.log(`[Priority-RHP] Found ${allUpcoming.length} upcoming companies in database.`);

    // 2. Fetch missing RHP links
    for (const company of allUpcoming) {
        if (!company.rhpUrl) {
            const link = await fetchRHPForCompany(company);
            if (link) {
                console.log(`[Priority-RHP] Found RHP URL for ${company.companyName}: ${link}`);
                company.rhpUrl = link;
            } else {
                console.log(`[Priority-RHP] No RHP URL found for ${company.companyName}`);
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Save database with URLs first
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

    // 3. Extract NLP Pre-IPO Extractions
    const missingNLP = allUpcoming.filter(c => c.rhpUrl && (c.preIpoInvestors === undefined || c.preIpoInvestors.length === 0));
    console.log(`[Priority-RHP] Found ${missingNLP.length} upcoming companies to extract Pre-IPO NLP data for.`);

    if (missingNLP.length > 0) {
        let venvPython = 'python3';
        if (fs.existsSync(path.join(__dirname, 'venv', 'bin', 'python'))) {
            venvPython = path.join(__dirname, 'venv', 'bin', 'python');
        }
        const pyScript = path.join(__dirname, 'nlp_extractor.py');

        for (const company of missingNLP) {
            try {
                console.log(`[Priority-RHP] Extracting NLP for ${company.companyName}...`);
                const safelyEscapedName = company.companyName.replace(/"/g, '\\"');
                const pyCmd = `${venvPython} ${pyScript} --rhp "${company.rhpUrl}" --company_name "${safelyEscapedName}"`;
                const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 120000 });
                const nlpData = JSON.parse(out.trim());
                company.preIpoInvestors = nlpData.preIpoInvestors || [];
                console.log(`[Priority-RHP] Found: ${company.preIpoInvestors.length} Pre-IPO placements.`);
            } catch (e) {
                console.error(`[Priority-RHP] Failed on ${company.companyName}:`, e.message);
                company.preIpoInvestors = [];
            }
        }

        // Map them back into db.companies
        db.companies = db.companies.map(c => {
            const update = allUpcoming.find(m => m.companyName === c.companyName);
            return update ? update : c;
        });

        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        console.log(`[Priority-RHP] Successfully saved specialized memory matrix. UI will now reflect Pre-IPOs.`);
    }
}

main().catch(err => {
    console.error('[Priority-RHP] Fatal error:', err);
});
