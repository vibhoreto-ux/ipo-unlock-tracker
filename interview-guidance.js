/**
 * interview-guidance.js
 * =====================
 * Extracts meaningful management guidance for upcoming IPOs by:
 * 1. Searching X (Twitter) via Puppeteer for management posts & targets.
 * 2. Scraping Google News for paragraphs with forward-looking statements.
 * 3. Searching YouTube for management interview links (no blocked transcripts).
 *
 * NOTE: Past financials are specifically excluded per user request.
 *
 * Run standalone: node interview-guidance.js --company "Cube Highways Trust"
 */

const https = require('https');
const http = require('http');
const { extractXGuidance } = require('./x-scraper-puppeteer');
const { extractNewsGuidance } = require('./news-guidance-scraper');

/**
 * Fetch a URL following redirects, returning the final response body.
 */
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
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#8377;/g, '₹')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Scrape Chittorgarh IPO page for Moat (Strengths) and Capacity Expansion details
 */
async function scrapeChittorgarhForMoat(chittUrl) {
    try {
        const { status, data } = await fetchUrl(chittUrl);
        if (status !== 200 || !data) return [];

        const highlights = [];
        
        // Extract "About Company" strengths (bullet points)
        const aboutMatch = data.match(/About\s+[\w\s]+?<\/h2>([\s\S]{100,3000}?)(?=<h2|<\/section|<div id=)/i);
        if (aboutMatch) {
            const raw = aboutMatch[1];
            // Extract bullet items (li tags)
            let bullets = [...raw.matchAll(/<li[^>]*>([\s\S]+?)<\/li>/gi)]
                .map(m => stripHtml(m[1]).trim())
                .filter(b => b.length > 20 && b.length < 250);

            // If no bullets, try paragraphs
            if (bullets.length === 0) {
                bullets = [...raw.matchAll(/<p[^>]*>([\s\S]+?)<\/p>/gi)]
                    .map(m => stripHtml(m[1]).trim())
                    .filter(p => p.length > 40 && p.length < 350);
            }

            let capacityFound = false;
            let moatFound = false;

            // Prioritize bullets with capacity, manufacturing, moat, competitive keywords
            for (const b of bullets) {
                const lower = b.toLowerCase();
                if (lower.includes('capacity') || lower.includes('expand') || lower.includes('manufacturing facility')) {
                    if (!capacityFound) {
                        highlights.push('🏗️ Capacity & Expansion: ' + b.replace(/\+\s*Read More.*/, '').trim());
                        capacityFound = true;
                    }
                } else if (lower.includes('competitive') || lower.includes('strength') || lower.includes('leadership') || lower.includes('moat')) {
                    if (!moatFound) {
                        highlights.push('🛡️ Company Moat: ' + b.replace(/\+\s*Read More.*/, '').trim());
                        moatFound = true;
                    }
                }
            }

            // Fallback if no specific keywords were matched but we have bullets
            if (!capacityFound && !moatFound && bullets.length > 0) {
                highlights.push('🛡️ Company Strengths: ' + bullets[0].replace(/\+\s*Read More.*/, '').trim());
            }
        }

        return highlights;
    } catch (e) {
        console.error(`Chittorgarh scrape error: ${e.message}`);
        return [];
    }
}

/**
 * Search YouTube for management interview videos. Returns top video URL.
 * (Transcripts blocked by 429, so we return link only)
 */
async function findYouTubeInterview(companyName) {
    try {
        // Clean company name
        const clean = companyName
            .replace(/(?:ltd\.?|limited|trust|invit|ipo|incorporation|inc\.?)\b/gi, '')
            .replace(/\s+/g, ' ').trim();

        const SEARCH_QUERIES = [
            `"${clean}" IPO CMD interview`,
            `"${clean}" IPO CEO management interview fy27 target`,
        ];

        for (const query of SEARCH_QUERIES) {
            const q = encodeURIComponent(query);
            const { status, data } = await fetchUrl('https://www.youtube.com/results?search_query=' + q);
            if (status !== 200) continue;

            const m = data.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script/s);
            if (!m) continue;

            try {
                const yd = JSON.parse(m[1]);
                const contents = yd?.contents?.twoColumnSearchResultsRenderer
                    ?.primaryContents?.sectionListRenderer?.contents ?? [];

                const POSITIVE = ['interview', 'management', 'cmd', 'md', 'ceo', 'promoter', 'ipo', 'target', 'fy27'];
                const NEGATIVE = ['review', 'analysis', 'gmp', 'allotment', 'subscription', 'kotak',
                    'hindi', 'explained', 'should you', 'worth', '#short', 'csr', 'listing ceremony'];

                let bestVid = null;
                let bestScore = -100;

                for (const section of contents) {
                    const items = section?.itemSectionRenderer?.contents ?? [];
                    for (const item of items) {
                        const vr = item?.videoRenderer;
                        if (!vr) continue;
                        const id = vr.videoId;
                        const title = vr.title?.runs?.[0]?.text ?? '';
                        const tl = title.toLowerCase();
                        const score = POSITIVE.reduce((s, kw) => s + (tl.includes(kw) ? 2 : 0), 0)
                            - NEGATIVE.reduce((s, kw) => s + (tl.includes(kw) ? 3 : 0), 0);
                        if (score > bestScore) {
                            bestScore = score;
                            bestVid = { id, title };
                        }
                    }
                }

                if (bestVid && bestScore > -5) {
                    const words = clean.split(' ').filter(w => w.length > 3);
                    const titleLower = bestVid.title.toLowerCase();
                    const nameMatch = words.some(w => titleLower.includes(w.toLowerCase()));
                    if (nameMatch) {
                        return { id: bestVid.id, title: bestVid.title, url: `https://www.youtube.com/watch?v=${bestVid.id}` };
                    }
                }
            } catch (_) {}
        }
    } catch (e) {
        console.error(`YouTube search error: ${e.message}`);
    }
    return null;
}

/**
 * Main extraction function — combines X and YouTube sources for forward guidance.
 */
async function extractGuidance(companyName) {
    const results = { highlights: [], sourceUrl: null, videoTitle: null };

    console.log(`[Guidance] Searching X (Twitter) for ${companyName}...`);
    try {
        const xData = await extractXGuidance(companyName);
        if (xData && xData.tweets && xData.tweets.length > 0) {
            xData.tweets.forEach(t => results.highlights.push(`🐦 X Post: ${t}`));
        }
    } catch (e) {
        console.error('[Guidance] X scraping failed:', e.message);
    }

    console.log(`[Guidance] Searching YouTube for ${companyName}...`);
    const yt = await findYouTubeInterview(companyName);
    if (yt) {
        results.sourceUrl = yt.url;
        results.videoTitle = yt.title;
        results.highlights.push(`🎥 Management Interview: "${yt.title}" — Watch: ${yt.url}`);
    }

    // Add a fallback if nothing is found
    if (results.highlights.length === 0) {
        results.highlights.push(`ℹ️ No forward guidance, moat details, or interviews found on X or YouTube for ${companyName}.`);
    }

    return results;
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const nameIdx = args.indexOf('--company');
    const companyName = nameIdx >= 0 ? args[nameIdx + 1] : 'Cube Highways';

    extractGuidance(companyName).then(result => {
        console.log(JSON.stringify(result, null, 2));
    }).catch(e => {
        console.error(e.message);
        process.exit(1);
    });
}

module.exports = { extractGuidance };
