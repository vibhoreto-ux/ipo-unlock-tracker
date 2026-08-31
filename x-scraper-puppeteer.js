/**
 * x-scraper-puppeteer.js
 * =======================
 * Uses Puppeteer with the user's actual Chrome profile (copied to temp)
 * to search X (Twitter) for forward-looking guidance on upcoming IPOs.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PROFILE = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function createTempProfile() {
    const tmpDir = path.join(os.tmpdir(), `x-pptr-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const srcDefault = path.join(CHROME_PROFILE, 'Default');
    const dstDefault = path.join(tmpDir, 'Default');
    fs.mkdirSync(dstDefault, { recursive: true });
    for (const f of ['Cookies', 'Login Data', 'Preferences', 'Local State']) {
        const src = path.join(srcDefault, f);
        if (fs.existsSync(src)) {
            try { fs.copyFileSync(src, path.join(dstDefault, f)); } catch (_) {}
        }
    }
    const ls = path.join(CHROME_PROFILE, 'Local State');
    if (fs.existsSync(ls)) {
        try { fs.copyFileSync(ls, path.join(tmpDir, 'Local State')); } catch (_) {}
    }
    return tmpDir;
}

async function extractXGuidance(companyName) {
    const clean = companyName.replace(/(?:ltd\.?|limited|trust|invit|ipo|incorporation|inc\.?)\b/gi, '').trim();
    const query = encodeURIComponent(`"${clean}" (guidance OR target OR FY27 OR capacity OR live OR moat)`);
    const url = `https://x.com/search?q=${query}&src=typed_query&f=top`;
    
    let browser;
    let tmpProfile;
    const tweets = [];

    try {
        tmpProfile = createTempProfile();
        browser = await puppeteer.launch({
            executablePath: CHROME_EXECUTABLE,
            userDataDir: tmpProfile,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for tweets to load
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 }).catch(() => {});
        
        // Extract tweets
        const extracted = await page.$$eval('article[data-testid="tweet"]', articles => {
            return articles.map(article => {
                const textEl = article.querySelector('div[data-testid="tweetText"]');
                return textEl ? textEl.innerText.replace(/\n/g, ' ') : null;
            }).filter(Boolean);
        });

        // Filter for forward guidance and moat keywords
        const keywords = ['guidance', 'target', 'fy27', 'expect', 'capacity', 'margin', 'crore', 'live', 'moat', 'advantage', 'expansion'];
        for (const t of extracted) {
            const lower = t.toLowerCase();
            if (keywords.some(k => lower.includes(k))) {
                tweets.push(t);
            }
        }

        await browser.close();
        if (tmpProfile) {
            try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
        }

        return { tweets: tweets.slice(0, 3) };

    } catch (e) {
        if (browser) await browser.close().catch(() => {});
        if (tmpProfile) {
            try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
        }
        return { tweets: [] };
    }
}

if (require.main === module) {
    const name = process.argv[2] || 'Cube Highways';
    extractXGuidance(name).then(console.log).catch(console.error);
}

module.exports = { extractXGuidance };
