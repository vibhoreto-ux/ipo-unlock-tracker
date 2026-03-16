const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Also include the scraper logic from browser-scraper
const axios = require('axios');
const cheerio = require('cheerio');

async function getUrl() {
    const chittorgarhUrl = 'https://www.chittorgarh.com/ipo/skyways-air-ipo/2510/';
    const resp = await axios.get(chittorgarhUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Referer': 'https://www.chittorgarh.com/'
        },
        timeout: 15000
    });
    const $ = cheerio.load(resp.data);
    const candidates = [];
    $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().toLowerCase().trim();
        if (!href) return;
        if (href.startsWith('http') && href.toLowerCase().endsWith('.pdf')) {
            const isPdf = true;
            const isRHP = text.includes('rhp') || text.includes('red herring') || href.toLowerCase().includes('rhp');
            const isDRHP = text.includes('drhp') || href.toLowerCase().includes('drhp');
            if (isRHP || isDRHP) {
                let basePriority = (isRHP && !isDRHP) ? 10 : 20; 
                let domainPriority = href.includes('bsesme') ? 1 : href.includes('bseindia') ? 2 : 3;
                candidates.push({ href, priority: basePriority + domainPriority });
            }
        }
    });
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates.length ? candidates[0].href : null;
}

async function forceSkyways() {
    const dbPath = './data/unlock-data.json';
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    const sky = db.companies.find(c => c.companyName.includes('Skyways'));
    if (!sky) return console.log('Not found');
    
    const rhpUrl = await getUrl();
    console.log("RHP FOR SKYWAYS:", rhpUrl);
    
    if (rhpUrl) {
        sky.rhpUrl = rhpUrl;
        const venvPython = path.join(__dirname, '..', 'unlock-tracker', 'venv', 'bin', 'python');
        const pyScript = path.join(__dirname, 'nlp_extractor.py');
        const pyCmd = `${venvPython} ${pyScript} --rhp "${rhpUrl}"`;
        console.log(`Executing: ${pyCmd}`);
        const out = execSync(pyCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 });
        const nlpData = JSON.parse(out.trim());
        sky.preIpoInvestors = nlpData.preIpoInvestors || [];
        console.log("Pre-IPO:", sky.preIpoInvestors);
        
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        console.log("DB saved");
    }
}
forceSkyways();
