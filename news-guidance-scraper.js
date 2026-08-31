/**
 * news-guidance-scraper.js
 * ========================
 * Scrapes Google News for forward-looking guidance on upcoming IPOs.
 */

const https = require('https');
const http = require('http');
const cheerio = require('cheerio'); // Using cheerio if available, or simple regex

function fetchUrl(urlStr, depth = 0) {
    if (depth > 5) return Promise.resolve({ status: 999, data: '' });
    const mod = urlStr.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
        const req = mod.get(urlStr, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                const loc = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : urlStr.match(/^https?:\/\/[^/]+/)[0] + res.headers.location;
                return resolve(fetchUrl(loc, depth + 1));
            }
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function stripHtml(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function extractNewsGuidance(companyName) {
    const clean = companyName.replace(/(?:ltd\.?|limited|trust|invit|ipo|incorporation|inc\.?)\b/gi, '').trim();
    const query = encodeURIComponent(`"${clean}" IPO management (guidance OR target OR capacity OR FY27 OR margin)`);
    const searchUrl = 'https://news.google.com/rss/search?q=' + query + '&hl=en-IN&gl=IN&ceid=IN:en';
    
    try {
        const { status, data } = await fetchUrl(searchUrl);
        if (status !== 200 || !data) return [];

        const items = [...data.matchAll(/<item>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<link>([^<]+)<\/link>/g)];
        const guidance = [];
        const keywords = ['guidance', 'target', 'capacity', 'fy27', 'margin', 'crore', 'expect', 'project', 'expand'];

        for (const item of items.slice(0, 3)) {
            let title = stripHtml(item[1]).replace(/\s*-\s*[^-]+$/, '');
            const lowerTitle = title.toLowerCase();
            
            // Try to fetch the article and extract paragraphs with guidance keywords
            try {
                const articleRes = await fetchUrl(item[2]);
                if (articleRes.status === 200) {
                    const paras = [...articleRes.data.matchAll(/<p[^>]*>([\s\S]+?)<\/p>/gi)]
                        .map(m => stripHtml(m[1]));
                    
                    let foundDetailed = false;
                    for (const p of paras) {
                        const lowerP = p.toLowerCase();
                        if (p.length > 50 && p.length < 500 && keywords.some(k => lowerP.includes(k))) {
                            if (lowerP.includes(clean.toLowerCase().split(' ')[0])) {
                                guidance.push(`📰 News Guidance: ${p}`);
                                foundDetailed = true;
                                break; // Take the best paragraph from this article
                            }
                        }
                    }
                    if (!foundDetailed && keywords.some(k => lowerTitle.includes(k))) {
                        guidance.push(`📰 News Headline: ${title}`);
                    }
                }
            } catch (e) {
                if (keywords.some(k => lowerTitle.includes(k))) {
                    guidance.push(`📰 News Headline: ${title}`);
                }
            }
        }
        
        return guidance;
    } catch (e) {
        console.error('News Guidance error:', e.message);
        return [];
    }
}

if (require.main === module) {
    extractNewsGuidance('Cube Highways').then(console.log);
}

module.exports = { extractNewsGuidance };
