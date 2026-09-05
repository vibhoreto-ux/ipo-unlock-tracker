/**
 * capital-structure-scraper.js
 * 
 * Scrapes IPO Premium (ipopremium.in) to fetch capital structure PDFs
 * for each IPO. These small PDFs (~20 pages) contain "History of Equity
 * Share Capital" tables that list pre-IPO investors, shares, and prices.
 * 
 * This is dramatically faster and more reliable than parsing full RHP PDFs (400+ pages).
 * 
 * Uses Puppeteer to bypass Cloudflare protection on ipopremium.in.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'data', 'ipopremium-cache.json');

// Shared browser instance (reused across calls within the same process)
let sharedBrowser = null;
let browserLastUsed = 0;
const BROWSER_TTL = 120000; // Close browser after 2 minutes of inactivity

/**
 * Get or launch a shared Puppeteer browser instance.
 */
async function getBrowser() {
    if (sharedBrowser && sharedBrowser.connected) {
        browserLastUsed = Date.now();
        return sharedBrowser;
    }
    
    console.log('[CapStruct] Launching Puppeteer browser...');
    sharedBrowser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    browserLastUsed = Date.now();
    
    // Auto-close browser after TTL of inactivity
    const checkInterval = setInterval(() => {
        if (Date.now() - browserLastUsed > BROWSER_TTL) {
            if (sharedBrowser && sharedBrowser.connected) {
                sharedBrowser.close().catch(() => {});
                sharedBrowser = null;
            }
            clearInterval(checkInterval);
        }
    }, 30000);
    if (checkInterval.unref) checkInterval.unref();
    
    return sharedBrowser;
}

/**
 * Read the cached IPO Premium lookup from disk.
 * Format: { lastUpdated, companies: { normalizedName: { name, detailUrl, capitalStructureUrl, anchorPdfUrl } } }
 */
function readCache() {
    try {
        if (fs.existsSync(CACHE_PATH)) {
            return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('[CapStruct] Cache read error:', e.message);
    }
    return { lastUpdated: null, companies: {} };
}

function writeCache(cache) {
    try {
        const dir = path.dirname(CACHE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
        console.error('[CapStruct] Cache write error:', e.message);
    }
}

/**
 * Normalize a company name for fuzzy matching.
 */
function normalize(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/\s*\((?:nse\s*sme|bse\s*sme|mainboard|mainline|sme)\)\s*/gi, '')
        .replace(/\s+ipo\s*$/i, '')
        .replace(/ ltd\.?| limited| india| private| pvt\.?| inc\.?/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Scrape the IPO Premium homepage using Puppeteer to build a lookup
 * of company name → detail page URL. Intercepts the /ipo JSON response.
 * Returns an updated cache object.
 */
async function scrapeHomepageIndex() {
    console.log('[CapStruct] Scraping IPO Premium homepage via Puppeteer...');
    
    const browser = await getBrowser();
    let page;
    
    try {
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        
        let apiIpos = [];
        page.on('response', async res => {
            if (res.url().includes('/ipo') && res.request().method() === 'POST') {
                try {
                    const json = await res.json();
                    if (json && Array.isArray(json.data)) {
                        apiIpos.push(...json.data);
                    }
                } catch (e) {}
            }
        });
        
        await page.goto('https://www.ipopremium.in/', {
            waitUntil: 'networkidle2',
            timeout: 60000,
        });
        
        await new Promise(r => setTimeout(r, 2000));
        
        const cache = readCache();
        let count = 0;
        
        // 1. Process items from the intercepted /ipo API response
        for (const item of apiIpos) {
            if (!item.id || !item.slug) continue;
            
            // Strip HTML from name (e.g. "<a ...>Company Name (Mainboard)</a>")
            let rawName = item.slug.replace(/-/g, ' ');
            if (item.name) {
                const match = item.name.match(/>([^<]+)</);
                if (match) rawName = match[1];
            }
            
            const cleanName = rawName.replace(/\s*\((?:NSE\s*SME|BSE\s*SME|MAINBOARD|Mainboard|SME)\)\s*/gi, '').trim();
            const fullUrl = `https://www.ipopremium.in/view/ipo/${item.id}/${item.slug}`;
            const key = normalize(cleanName);
            
            if (!key) continue;
            
            if (!cache.companies[key]) {
                cache.companies[key] = {
                    name: cleanName,
                    id: item.id,
                    slug: item.slug,
                    detailUrl: fullUrl,
                    capitalStructureUrl: null,
                    anchorPdfUrl: null,
                };
            } else {
                cache.companies[key].detailUrl = fullUrl;
                cache.companies[key].name = cleanName;
            }
            count++;
        }
        
        // 2. Also extract directly from rendered DOM links as a backup
        const domLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => ({
                href: a.getAttribute('href') || a.href || '',
                text: a.textContent.trim(),
            })).filter(l => l.href.includes('/view/ipo/') && l.text.length > 0);
        });
        
        for (const { href, text } of domLinks) {
            let name = text.replace(/\s*\((?:NSE\s*SME|BSE\s*SME|MAINBOARD|Mainboard|SME)\)\s*/gi, '').trim();
            name = name.replace(/\s+IPO\s*$/i, '').trim();
            if (!name) continue;
            
            const fullUrl = href.startsWith('http') ? href : `https://www.ipopremium.in${href}`;
            const key = normalize(name);
            if (!key) continue;
            
            if (!cache.companies[key]) {
                cache.companies[key] = {
                    name: name,
                    detailUrl: fullUrl,
                    capitalStructureUrl: null,
                    anchorPdfUrl: null,
                };
                count++;
            }
        }
        
        cache.lastUpdated = new Date().toISOString();
        writeCache(cache);
        console.log(`[CapStruct] Indexed ${Object.keys(cache.companies).length} total IPOs in cache`);
        return cache;
        
    } catch (e) {
        console.error('[CapStruct] Homepage scrape error:', e.message);
        return readCache();
    } finally {
        if (page) await page.close().catch(() => {});
    }
}

/**
 * Fetch capital structure, anchor PDF, RHP, pricing, and dates for a given IPO by visiting its detail page.
 * Uses Puppeteer to bypass Cloudflare.
 * 
 * @param {string} detailUrl - Full URL to the IPO detail page
 * @returns {{ capitalStructureUrl: string|null, anchorPdfUrl: string|null, rhpUrl: string|null, priceBand: string|null, issuePrice: number|null, lotSize: number|null, totalShares: number|null, openDate: string|null, closeDate: string|null, allotmentDate: string|null, listingDate: string|null }}
 */
async function scrapeDetailPage(detailUrl) {
    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        
        await page.goto(detailUrl, {
            waitUntil: 'networkidle2',
            timeout: 35000,
        });
        
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 1000));
        
        const result = await page.evaluate(() => {
            let capitalStructureUrl = null;
            let anchorPdfUrl = null;
            let rhpUrl = null;
            
            const allLinks = Array.from(document.querySelectorAll('a'));
            for (const a of allLinks) {
                const href = a.href || '';
                const text = (a.textContent || '').trim().toLowerCase();
                
                // Capital structure PDF
                if (!capitalStructureUrl && (href.includes('capital_structure') || text.includes('capital structure')) && href.includes('.pdf')) {
                    capitalStructureUrl = href;
                }
                
                // Anchor PDF
                if (!anchorPdfUrl && (href.includes('anchor') || text.includes('anchor')) && href.includes('.pdf')) {
                    anchorPdfUrl = href;
                }

                // RHP PDF
                if (!rhpUrl && (href.includes('rhp') || href.includes('prospectus') || text.includes('rhp') || text.includes('dhrp')) && href.includes('.pdf')) {
                    rhpUrl = href;
                }
            }

            // Fallback: regex search on full body
            const pdfs = Array.from(new Set(document.body.innerHTML.match(/https?:\/\/[^"'\s<>]+\.pdf/g) || []));
            for (const p of pdfs) {
                if (p.includes('capital_structure') && !capitalStructureUrl) capitalStructureUrl = p;
                if (p.includes('anchor') && !anchorPdfUrl) anchorPdfUrl = p;
                if ((p.includes('rhp') || p.includes('prospectus')) && !rhpUrl) rhpUrl = p;
            }

            // Extract Price Band, Issue Price, Dates, Lot Size, and Total Shares
            const bodyText = document.body.innerText;
            let priceBand = null;
            let issuePrice = null;
            let lotSize = null;
            let openDate = null;
            let closeDate = null;
            let allotmentDate = null;
            let listingDate = null;
            let totalShares = null;

            // Price Band matching: "PRICE BAND\n₹384–404" or "Price Band: ₹384-404"
            const pbMatch = bodyText.match(/PRICE\s*BAND\s*\n\s*₹?\s*([\d,]+)\s*[–\-\—\to]+\s*₹?\s*([\d,]+)/i) ||
                            bodyText.match(/Price\s*Band\s*[:\t]?\s*₹?\s*([\d,]+)\s*[–\-\—\to]+\s*₹?\s*([\d,]+)/i);
            if (pbMatch) {
                priceBand = `₹${pbMatch[1]}–${pbMatch[2]}`;
                issuePrice = parseFloat(pbMatch[2].replace(/,/g, ''));
            } else {
                const ipMatch = bodyText.match(/(?:Issue|Offer)\s*Price\s*[:\t\n]?\s*₹?\s*([\d,]+(?:\.\d+)?)/i);
                if (ipMatch) {
                    issuePrice = parseFloat(ipMatch[1].replace(/,/g, ''));
                }
            }

            // Lot size: "LOT SIZE\n37"
            const lotMatch = bodyText.match(/LOT\s*SIZE\s*\n\s*(\d+)/i) ||
                             bodyText.match(/Lot\s*Size\s*[:\t]?\s*(\d+)/i);
            if (lotMatch) {
                lotSize = parseInt(lotMatch[1], 10);
            }

            // Total Issue Size: "3,10,80,977 shares"
            const sharesMatch = bodyText.match(/Total\s*Issue\s*Size\s*[:\t\n]?\s*([\d,]+)\s*shares/i);
            if (sharesMatch) {
                totalShares = parseInt(sharesMatch[1].replace(/,/g, ''), 10);
            }

            // Dates: Open, Close, Allotment, Listing (e.g. "Open\nSep 9", "Listing\nSep 17")
            const openM = bodyText.match(/Open\s*\n\s*([A-Za-z]+ \d+)/i);
            const closeM = bodyText.match(/Close\s*\n\s*([A-Za-z]+ \d+)/i);
            const allotM = bodyText.match(/Allotment\s*\n\s*([A-Za-z]+ \d+)/i);
            const listM = bodyText.match(/Listing\s*\n\s*([A-Za-z]+ \d+)/i);

            const parseDate2026 = (str) => {
                if (!str) return null;
                const year = new Date().getFullYear();
                const d = new Date(`${str} ${year} 00:00:00 GMT+0530`);
                return isNaN(d.getTime()) ? null : d.toISOString();
            };

            if (openM) openDate = parseDate2026(openM[1]);
            if (closeM) closeDate = parseDate2026(closeM[1]);
            if (allotM) allotmentDate = parseDate2026(allotM[1]);
            if (listM) listingDate = parseDate2026(listM[1]);

            return {
                capitalStructureUrl,
                anchorPdfUrl,
                rhpUrl,
                priceBand,
                issuePrice,
                lotSize,
                totalShares,
                openDate,
                closeDate,
                allotmentDate,
                listingDate
            };
        });
        
        return result;
        
    } catch (e) {
        console.error(`[CapStruct] Detail page scrape error for ${detailUrl}:`, e.message);
        return {
            capitalStructureUrl: null,
            anchorPdfUrl: null,
            rhpUrl: null,
            priceBand: null,
            issuePrice: null,
            lotSize: null,
            totalShares: null,
            openDate: null,
            closeDate: null,
            allotmentDate: null,
            listingDate: null
        };
    } finally {
        if (page) await page.close().catch(() => {});
    }
}

/**
 * Look up the capital structure PDF URL for a given company name.
 * Uses cached index first. If not found, tries to scrape the homepage.
 * If detail page URL is found but no capital structure URL, scrapes the detail page.
 * 
 * @param {string} companyName - The company name to look up
 * @returns {string|null} Capital structure PDF URL
 */
async function fetchCapitalStructureUrl(companyName) {
    let cache = readCache();
    const key = normalize(companyName);
    
    // Try exact match first
    let entry = cache.companies[key];
    
    // Fuzzy match: try partial matching if exact fails
    if (!entry) {
        for (const [cachedKey, cachedEntry] of Object.entries(cache.companies)) {
            if (cachedKey.includes(key) || key.includes(cachedKey)) {
                entry = cachedEntry;
                break;
            }
        }
    }
    
    // Fallback: search key words (e.g. "Ashutosh", "Skyways", "Anondita")
    if (!entry) {
        const words = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !['limited', 'private', 'india', 'tech', 'medicare'].includes(w));
        if (words.length > 0) {
            const firstWord = words[0];
            for (const [cachedKey, cachedEntry] of Object.entries(cache.companies)) {
                if (cachedKey.includes(firstWord)) {
                    entry = cachedEntry;
                    break;
                }
            }
        }
    }
    
    if (!entry) {
        console.log(`[CapStruct] No IPO Premium entry found for: ${companyName}`);
        return null;
    }
    
    // If we already have the capital structure URL cached, return it
    if (entry.capitalStructureUrl) {
        return entry.capitalStructureUrl;
    }
    
    // Otherwise, scrape the detail page
    console.log(`[CapStruct] Fetching detail page for ${entry.name}: ${entry.detailUrl}`);
    const result = await scrapeDetailPage(entry.detailUrl);
    
    if (result.capitalStructureUrl) {
        entry.capitalStructureUrl = result.capitalStructureUrl;
        if (result.anchorPdfUrl) {
            entry.anchorPdfUrl = result.anchorPdfUrl;
        }
        writeCache(cache);
        console.log(`[CapStruct] Found capital structure PDF: ${result.capitalStructureUrl}`);
        return result.capitalStructureUrl;
    }
    
    console.log(`[CapStruct] No capital structure PDF found for: ${companyName}`);
    return null;
}

/**
 * Extract pre-IPO investors from a company's capital structure PDF.
 * Downloads the PDF and runs the Python NLP extractor on it.
 * 
 * @param {string} companyName - The company name
 * @param {string} [capitalStructureUrl] - Optional direct PDF URL (skips lookup)
 * @returns {{ preIpoInvestors: string[], waca: number|null, peerComparison: Object|null }}
 */
async function extractFromCapitalStructure(companyName, capitalStructureUrl) {
    const url = capitalStructureUrl || await fetchCapitalStructureUrl(companyName);
    
    if (!url) {
        return { preIpoInvestors: null, waca: null, peerComparison: null };
    }
    
    console.log(`[CapStruct] Extracting pre-IPO investors from: ${url}`);
    
    try {
        const { exec } = require('child_process');
        let pythonBin = process.env.PYTHON_BIN || 'python3';
        if (fs.existsSync(path.join(__dirname, 'venv', 'bin', 'python'))) {
            pythonBin = path.join(__dirname, 'venv', 'bin', 'python');
        }
        const pyScript = path.join(__dirname, 'nlp_extractor.py');
        const safelyEscapedName = companyName.replace(/"/g, '\\"');
        
        const pyCmd = `${pythonBin} ${pyScript} --rhp "${url}" --company_name "${safelyEscapedName}"`;
        return new Promise((resolve) => {
            exec(pyCmd, { encoding: 'utf8', timeout: 45000 }, (err, stdout) => {
                if (err || !stdout) {
                    return resolve({ preIpoInvestors: [], waca: null, peerComparison: null });
                }
                try {
                    const nlpData = JSON.parse(stdout.trim());
                    resolve({
                        preIpoInvestors: nlpData.preIpoInvestors || [],
                        waca: nlpData.waca !== undefined ? nlpData.waca : null,
                        peerComparison: nlpData.peerComparison || null,
                    });
                } catch (e) {
                    resolve({ preIpoInvestors: [], waca: null, peerComparison: null });
                }
            });
        });
    } catch (e) {
        console.error(`[CapStruct] Extraction failed for ${companyName}:`, e.message);
        return { preIpoInvestors: [], waca: null, peerComparison: null };
    }
}

/**
 * Batch-scrape all detail pages to pre-populate capital structure URLs.
 * 
 * @param {number} [limit=50] - Max number of detail pages to scrape per run
 * @param {boolean} [forceRefreshIndex=false] - Force re-scrape of homepage even if cache is fresh
 * @returns {{ scraped: number, found: number }}
 */
async function batchScrapeCapitalStructureUrls(limit = 50, forceRefreshIndex = false) {
    let cache = readCache();
    
    if (forceRefreshIndex || !cache.lastUpdated || Object.keys(cache.companies).length === 0) {
        cache = await scrapeHomepageIndex();
    }
    
    const entries = Object.entries(cache.companies);
    const needScraping = entries.filter(([, v]) => v.detailUrl && !v.capitalStructureUrl);
    
    console.log(`[CapStruct] Batch scrape: ${needScraping.length} detail pages need scraping (limit: ${limit})`);
    
    let scraped = 0;
    let found = 0;
    
    for (const [key, entry] of needScraping.slice(0, limit)) {
        try {
            const result = await scrapeDetailPage(entry.detailUrl);
            if (result.capitalStructureUrl) {
                entry.capitalStructureUrl = result.capitalStructureUrl;
                found++;
            }
            if (result.anchorPdfUrl) {
                entry.anchorPdfUrl = result.anchorPdfUrl;
            }
            scraped++;
            
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            console.error(`[CapStruct] Batch error for ${entry.name}:`, e.message);
        }
    }
    
    writeCache(cache);
    console.log(`[CapStruct] Batch complete: scraped ${scraped}, found ${found} capital structure PDFs`);
    return { scraped, found };
}

module.exports = {
    fetchCapitalStructureUrl,
    extractFromCapitalStructure,
    scrapeDetailPage,
    scrapeHomepageIndex,
    batchScrapeCapitalStructureUrls,
    normalize,
};
