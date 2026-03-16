const { scrapeWithBrowser } = require('./browser-scraper.js');

async function test() {
    // Actually we can't easily isolate fetchRHPUrl because it's not exported.
    // Let's copy it here exactly as it is in browser-scraper.js
    const axios = require('axios');
    const cheerio = require('cheerio');
    const chittorgarhUrl = 'https://www.chittorgarh.com/ipo/skyways-air-ipo/2510/';
    
    const resp = await axios.get(chittorgarhUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
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
    candidates.sort((a, b) => a.priority - b.priority);
    console.log(candidates);
    console.log("BEST:", candidates.length > 0 ? candidates[0].href : null);
}
test();
