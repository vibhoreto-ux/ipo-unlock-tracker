const { readDB, writeDB } = require('./db.js');
const cheerio = require('cheerio');
const { execSync } = require('child_process');

async function run() {
    const targetName = process.argv[2];
    if (!targetName) return;

    const db = readDB();
    const company = db.companies.find(c => c.companyName === targetName);
    if (!company) return;

    if (company.rhpUrl && company.preIpoInvestors !== undefined) return;

    console.log(`[Priority-Fetch] Start for ${targetName}...`);
    
    // 1. Check Chittorgarh
    let bestLink = null;
    if (company.chittorgarhUrl && !company.rhpUrl) {
        try {
            const res = await fetch(company.chittorgarhUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (res.ok) {
                const html = await res.text();
                const $ = cheerio.load(html);
                const candidates = [];
                $('a').each((i, el) => {
                    const href = $(el).attr('href') || '';
                    if (href.startsWith('http') && href.toLowerCase().endsWith('.pdf')) {
                        const text = $(el).text().toLowerCase();
                        if (text.includes('rhp') || text.includes('prospectus') || href.toLowerCase().includes('rhp')) {
                            candidates.push(href);
                        }
                    }
                });
                if (candidates.length > 0) bestLink = candidates[0];
            }
        } catch(e) {}
    }

    // 2. Fallback DDG
    if (!bestLink && !company.rhpUrl) {
        try {
            const params = new URLSearchParams();
            params.append('q', `"${targetName}" "Red Herring Prospectus" filetype:pdf`);
            params.append('kl', 'in-en');
            const res = await fetch('https://lite.duckduckgo.com/lite/', {
                method: 'POST',
                headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });
            if (res.ok) {
                const html = await res.text();
                const $ = cheerio.load(html);
                $('a').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.startsWith('http') && href.toLowerCase().endsWith('.pdf') && !bestLink) {
                        bestLink = href;
                    }
                });
            }
        } catch(e) {}
    }

    if (bestLink) {
        company.rhpUrl = bestLink;
    }

    if (company.rhpUrl) {
        try {
            console.log(`[Priority-Fetch] Extracting NLP for ${targetName}...`);
            const pythonBin = process.env.PYTHON_BIN || 'python3';
            const safelyEscapedName = targetName.replace(/"/g, '\\"');
            const pyCmd = `${pythonBin} nlp_extractor.py --rhp "${company.rhpUrl}" --company_name "${safelyEscapedName}"`;
            const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 });
            const nlpData = JSON.parse(out.trim());
            company.preIpoInvestors = nlpData.preIpoInvestors || [];
            console.log(`[Priority-Fetch] Found ${company.preIpoInvestors.length} investors for ${targetName}`);
        } catch(e) {
            console.error(`[Priority-Fetch] Extractor failed: ${e.message}`);
            company.preIpoInvestors = []; // mark 0 so we don't infinitely retry
        }
    } else {
        console.log(`[Priority-Fetch] Could not find RHP for ${targetName}`);
        company.preIpoInvestors = []; // mark 0 so we don't infinitely retry
    }

    writeDB(db);
    console.log(`[Priority-Fetch] Saved ${targetName}.`);
}

run();
