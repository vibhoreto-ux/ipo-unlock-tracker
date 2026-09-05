const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { scrapeUnlockData } = require('./scraper');
const { scrapeWithBrowser, fetchAnchorInvestorNames } = require('./browser-scraper');
const { autoFetchMissingRHP } = require('./auto-rhp');
const { readDB, writeDB, mergeCompanies, getCircularData, saveCircularData } = require('./db');
const { scanPreferential } = require('./preferential-scraper');
const { fetchCapitalStructureUrl, extractFromCapitalStructure, batchScrapeCapitalStructureUrls, scrapeDetailPage } = require('./capital-structure-scraper');
const { syncAllCapitalStructures, matchesCompany } = require('./scripts/sync_all_capital_structures');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

const { getNextBusinessDay, calculatePreIPOLockin } = require('./holidays');
const axios = require('axios');
const cheerio = require('cheerio');
const unzipper = require('unzipper');

/**
 * GET /api/nse-pdf
 * Downloads an NSE ZIP file on the fly, extracts the primary CML*.pdf document containing lock-in data,
 * and streams it directly to the browser to view natively instead of downloading a ZIP.
 */
app.get('/api/nse-pdf', async (req, res) => {
    try {
        const zipUrl = req.query.url;
        if (!zipUrl) {
            return res.status(400).send('Missing url parameter');
        }

        console.log(`[NSE Proxy] Fetching ZIP from: ${zipUrl}`);

        // Setup axios to get stream
        const response = await axios({
            method: 'get',
            url: zipUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/zip',
                'Referer': 'https://www.nseindia.com/'
            },
            timeout: 30000
        });

        // Parse ZIP directly from stream
        response.data.pipe(unzipper.Parse())
            .on('entry', function (entry) {
                const fileName = entry.path;

                // CMLxxxx.pdf is the NSE lock-in circular. Ignore SHP_*.pdf
                if (fileName.toLowerCase().startsWith('cml') && fileName.toLowerCase().endsWith('.pdf')) {
                    console.log(`[NSE Proxy] Extracting and serving PDF: ${fileName}`);
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
                    entry.pipe(res);
                } else if (fileName.toLowerCase().endsWith('.pdf') && !res.headersSent) {
                    // Fallback to any PDF if no CML is found
                    console.log(`[NSE Proxy] Fallback: serving PDF: ${fileName}`);
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
                    entry.pipe(res);
                } else {
                    entry.autodrain(); // Skip other files
                }
            })
            .on('close', () => {
                if (!res.headersSent) {
                    // If ZIP finished but no PDF was returned
                    if (!res.writableEnded) res.status(404).send('No valid PDF found inside ZIP');
                }
            })
            .on('error', err => {
                console.error(`[NSE Proxy] Unzip error:`, err);
                if (!res.headersSent && !res.writableEnded) {
                    res.status(500).send('Error extracting ZIP');
                }
            });

    } catch (error) {
        console.error(`[NSE Proxy] Error fetching zip: ${error.message}`);
        if (!res.headersSent && !res.writableEnded) {
            if (error.response && error.response.status === 404) {
                res.status(404).send('NSE ZIP archive no longer available (404 Not Found)');
            } else {
                res.status(500).send(`Error downloading NSE Zip: ${error.message}`);
            }
        }
    }
});

/**
 * GET /api/bse-page-proxy
 * Relays a BSE HTML page via server-side curl (bypasses CORS + Akamai WAF).
 * The browser calls this instead of fetching bseindia.com directly.
 * Query param: url (must be a bseindia.com or bsesme.com URL)
 */
app.get('/api/bse-page-proxy', async (req, res) => {
    const { execSync } = require('child_process');
    try {
        const targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send('Missing url parameter');

        // Validate: only allow BSE domains
        if (!targetUrl.includes('bseindia.com') && !targetUrl.includes('bsesme.com')) {
            return res.status(403).send('Only BSE domains are allowed');
        }

        console.log(`[BSE Proxy] Fetching: ${targetUrl.substring(0, 100)}`);

        const escapedUrl = targetUrl.replace(/'/g, "'\\''");
        const html = execSync(
            `curl -s -L --max-time 20 ` +
            `-H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' ` +
            `-H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' ` +
            `-H 'Accept-Language: en-US,en;q=0.9' ` +
            `-H 'Referer: https://www.bseindia.com/' ` +
            `'${escapedUrl}'`,
            { maxBuffer: 10 * 1024 * 1024, timeout: 25000 }
        ).toString('utf8');

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(html);

    } catch (err) {
        console.error(`[BSE Proxy] Error: ${err.message}`);
        res.status(502).send(`BSE proxy error: ${err.message}`);
    }
});

/**
 * GET /api/bse-pdf-proxy
 * Relays a BSE PDF file via server-side curl (bypasses CORS + Akamai WAF).
 * The browser calls this instead of fetching the PDF directly.
 * Query param: url (must be a bseindia.com URL)
 */
app.get('/api/bse-pdf-proxy', async (req, res) => {
    const { execSync } = require('child_process');
    try {
        const targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send('Missing url parameter');

        if (!targetUrl.includes('bseindia.com') && !targetUrl.includes('bsesme.com')) {
            return res.status(403).send('Only BSE domains are allowed');
        }

        console.log(`[BSE PDF Proxy] Downloading: ${targetUrl.substring(0, 100)}`);

        const escapedUrl = targetUrl.replace(/'/g, "'\\''");
        const pdfBuffer = execSync(
            `curl -s -L --max-time 30 ` +
            `-H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' ` +
            `-H 'Accept: application/pdf,*/*' ` +
            `-H 'Referer: https://www.bseindia.com/' ` +
            `'${escapedUrl}'`,
            { maxBuffer: 20 * 1024 * 1024, timeout: 35000, encoding: 'buffer' }
        );

        if (!pdfBuffer || pdfBuffer.length < 100) {
            return res.status(502).send('BSE returned empty PDF response');
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Disposition', 'inline; filename="annexure.pdf"');
        res.send(pdfBuffer);

    } catch (err) {
        console.error(`[BSE PDF Proxy] Error: ${err.message}`);
        res.status(502).send(`BSE PDF proxy error: ${err.message}`);
    }
});

/**
 * POST /api/import-data
 * Accepts scraped anchor + IPO data from browser, processes it, merges into DB
 * Body: { anchorData: [...], ipoData: [...], year: number }
 */
app.post('/api/import-data', (req, res) => {
    try {
        const { anchorData = [], ipoData = [], year } = req.body;
        console.log(`\nImporting data: ${anchorData.length} anchor records, ${ipoData.length} IPO records (year: ${year})`);

        // Process IPO data - build company records
        const companies = [];
        const seenNames = new Set();

        for (const ipo of ipoData) {
            const name = ipo.companyName || ipo.company || '';
            if (!name || seenNames.has(name)) continue;
            seenNames.add(name);

            const listingAt = ipo.listingAt || ipo.exchange || '';
            // Determine issue type from exchange field first
            let issueType = listingAt.includes('SME') ? 'SME' : 'Mainboard';
            // Cross-reference with anchor data's issueType if available
            const nameSimpleForType = name.toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();
            const anchorTypeMatch = anchorData.find(a => {
                const aName = (a.companyName || '').toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();
                return nameSimpleForType.includes(aName) || aName.includes(nameSimpleForType);
            });
            if (anchorTypeMatch && anchorTypeMatch.issueType) {
                issueType = anchorTypeMatch.issueType;
            }
            // Normalize: anchor data uses 'Mainline', we use 'Mainboard'
            if (issueType === 'Mainline') issueType = 'Mainboard';

            // Parse the close date as proxy for allotment date
            const closeDateStr = ipo.closeDate || '';
            const closeDate = parseImportDate(closeDateStr);
            let allotmentDate = null;
            if (closeDate) {
                const adjusted = getNextBusinessDay(closeDate);
                allotmentDate = {
                    original: closeDate.toISOString(),
                    adjusted: adjusted.toISOString(),
                    isAdjusted: closeDate.getTime() !== adjusted.getTime()
                };
            }

            // Find anchor match
            const nameSimple = name.toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();
            const anchorMatch = anchorData.find(a => {
                const aName = (a.companyName || '').toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();
                return nameSimple.includes(aName) || aName.includes(nameSimple);
            });

            let anchor30 = null, anchor90 = null;
            if (anchorMatch) {
                const d30 = parseImportDate(anchorMatch.date30);
                const d90 = parseImportDate(anchorMatch.date90);
                if (d30) {
                    const adj30 = getNextBusinessDay(d30);
                    anchor30 = { original: d30.toISOString(), adjusted: adj30.toISOString(), isAdjusted: d30.getTime() !== adj30.getTime() };
                }
                if (d90) {
                    const adj90 = getNextBusinessDay(d90);
                    anchor90 = { original: d90.toISOString(), adjusted: adj90.toISOString(), isAdjusted: d90.getTime() !== adj90.getTime() };
                }
            }

            companies.push({
                companyName: name,
                issueType,
                exchange: listingAt,
                allotmentDate,
                anchor30,
                anchor90,
                preIPO: calculatePreIPOLockin(
                    allotmentDate ? (allotmentDate.adjusted || allotmentDate.original) : null,
                    issueType
                )
            });
        }

        // Also add any anchor-only companies not in IPO list
        for (const anchor of anchorData) {
            const name = anchor.companyName || '';
            if (!name || seenNames.has(name)) continue;
            seenNames.add(name);

            let issueType = anchor.issueType || 'Mainboard';
            if (issueType === 'Mainline') issueType = 'Mainboard';
            const exchange = anchor.exchange || '';
            const allotDate = parseImportDate(anchor.allotmentDate);
            let allotmentDate = null;
            if (allotDate) {
                const adjusted = getNextBusinessDay(allotDate);
                allotmentDate = {
                    original: allotDate.toISOString(),
                    adjusted: adjusted.toISOString(),
                    isAdjusted: allotDate.getTime() !== adjusted.getTime()
                };
            }

            const d30 = parseImportDate(anchor.date30);
            const d90 = parseImportDate(anchor.date90);
            let anchor30 = null, anchor90 = null;
            if (d30) {
                const adj30 = getNextBusinessDay(d30);
                anchor30 = { original: d30.toISOString(), adjusted: adj30.toISOString(), isAdjusted: d30.getTime() !== adj30.getTime() };
            }
            if (d90) {
                const adj90 = getNextBusinessDay(d90);
                anchor90 = { original: d90.toISOString(), adjusted: adj90.toISOString(), isAdjusted: d90.getTime() !== adj90.getTime() };
            }

            companies.push({
                companyName: name,
                issueType,
                exchange,
                allotmentDate,
                anchor30,
                anchor90,
                preIPO: calculatePreIPOLockin(
                    allotmentDate ? (allotmentDate.adjusted || allotmentDate.original) : null,
                    issueType
                )
            });
        }

        console.log(`Processed ${companies.length} companies from import`);

        // Merge into DB
        const db = readDB();
        const merged = mergeCompanies(db.companies, companies);
        const now = new Date().toISOString();
        writeDB({
            companies: merged,
            lastUpdated: now,
            lastScraped: {
                time: now,
                importedAnchor: anchorData.length,
                importedIPO: ipoData.length,
                year: year
            }
        });

        res.json({
            success: true,
            imported: companies.length,
            totalInDB: merged.length,
            message: `Imported ${companies.length} companies (${anchorData.length} anchor + ${ipoData.length} IPO records)`
        });

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: error.message });
    }
});

function parseImportDate(dateStr) {
    if (!dateStr || dateStr === '--' || dateStr === '') return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

// ---------- Async preferential scan job system ----------
let prefScanJob = { status: 'idle', results: [], error: null, startedAt: null, message: '' };

// GET to load cached data instantly (no scan) — used on tab switch / page load
app.get('/api/pref-cache', (req, res) => {
    const _fs = require('fs');
    const _path = require('path');
    const COMBINED_CACHE = _path.join(__dirname, 'pref-cache.json');
    try {
        if (_fs.existsSync(COMBINED_CACHE)) {
            const raw = JSON.parse(_fs.readFileSync(COMBINED_CACHE, 'utf8'));
            return res.json({ status: 'ok', results: raw.results || [], savedAt: raw.savedAt });
        }
    } catch (e) { console.error('[pref-cache]', e.message); }
    return res.json({ status: 'empty', results: [] });
});


// POST to kick off a DELTA background scan (or force full refresh with ?force=true)
app.post('/api/scan-preferential/start', (req, res) => {
    if (prefScanJob.status === 'running') {
        return res.json({ status: 'running', message: 'Scan already in progress' });
    }
    // Start scan in background — delta by default, full if force=true
    const force = req.query.force === 'true';
    prefScanJob = { status: 'running', results: [], error: null, startedAt: Date.now(), message: 'Scanning...' };
    scanPreferential(force).then(results => {
        prefScanJob = { status: 'done', results, error: null, startedAt: prefScanJob.startedAt };
        console.log(`[PREF] Scan complete: ${results.length} results`);
    }).catch(err => {
        prefScanJob = { status: 'error', results: [], error: err.message, startedAt: prefScanJob.startedAt };
        console.error('[PREF] Scan error:', err.message);
    });
    res.json({ status: 'running', message: force ? 'Full scan started' : 'Delta scan started' });
});

// GET to poll scan status
app.get('/api/scan-preferential/status', (req, res) => {
    res.json({
        status: prefScanJob.status,
        count: prefScanJob.results.length,
        results: prefScanJob.status === 'done' ? prefScanJob.results : [],
        error: prefScanJob.error,
        message: prefScanJob.message || ''
    });
});


/**
 * GET /api/unlock-data
 * 
 * Without ?refresh: return data from local DB
 * With ?refresh=true: scrape fresh data, merge into DB, save, and return
 */
app.get('/api/unlock-data', async (req, res) => {
    try {
        const db = readDB();

        // If no refresh requested, return DB data
        if (!req.query.refresh) {
            return res.json({
                data: db.companies,
                source: 'database',
                lastRefreshed: db.lastUpdated,
                dbStats: {
                    totalCompanies: db.companies.length,
                    lastScraped: db.lastScraped
                }
            });
        }

        // Refresh: scrape and merge
        console.log('Fetching fresh unlock data via browser scraper...');
        const forceRefresh = req.query.refresh === 'true';

        let data2025, data2026;
        try {
            // Try browser scraper first (Axios)
            [data2025, data2026] = await Promise.all([
                scrapeWithBrowser(2025, db.companies, forceRefresh),
                scrapeWithBrowser(2026, db.companies, forceRefresh)
            ]);
            console.log('Browser scraper succeeded');
        } catch (browserErr) {
            console.log('Browser scraper failed, falling back to HTTP scraper:', browserErr.message);
            [data2025, data2026] = await Promise.all([
                scrapeUnlockData(2025),
                scrapeUnlockData(2026)
            ]);
        }

        // Combine scraped data
        let newData = [...data2025, ...data2026];

        // Dedup scraped data itself
        const seen = new Set();
        newData = newData.filter(item => {
            const key = `${item.companyName}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`Scraped ${newData.length} total companies (${data2025.length} from 2025, ${data2026.length} from 2026)`);

        // Merge into existing DB
        const merged = mergeCompanies(db.companies, newData);

        const now = new Date().toISOString();
        const updatedDB = {
            companies: merged,
            lastUpdated: now,
            lastScraped: {
                time: now,
                scraped2025: data2025.length,
                scraped2026: data2026.length,
                totalNew: newData.length
            }
        };

        // Save to DB
        writeDB(updatedDB);

        // Fast sync all Capital Structure links and unlisted upcoming companies
        await syncAllCapitalStructures({ extractPreIpo: false }).catch(err => console.error('[Auto-Sync-CS] Error:', err.message));
        const freshDb = readDB();

        // Trigger background RHP completion auto-healer
        autoFetchMissingRHP().catch(err => console.error('[Auto-RHP] Error:', err.message));

        // Trigger background Capital Structure pre-IPO healer
        syncAllCapitalStructures({ extractPreIpo: true }).catch(err => console.error('[Auto-Sync-CS] Error:', err.message));

        res.json({
            data: freshDb.companies,
            source: 'fresh',
            lastRefreshed: now,
            dbStats: {
                totalCompanies: freshDb.companies.length,
                lastScraped: updatedDB.lastScraped
            }
        });

    } catch (error) {
        console.error('API Error:', error);

        // On error, try to return DB data as fallback
        try {
            const db = readDB();
            if (db.companies.length > 0) {
                return res.json({
                    data: db.companies,
                    source: 'database-fallback',
                    lastRefreshed: db.lastUpdated,
                    error: 'Scrape failed, showing cached data'
                });
            }
        } catch (e) { /* ignore */ }

        res.status(500).json({ error: 'Failed to fetch unlock data' });
    }
});

/**
 * GET /api/db-status
 * Returns info about the local database
 */
app.get('/api/db-status', (req, res) => {
    const db = readDB();
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, 'data', 'unlock-data.json');

    let fileSize = 0;
    try {
        const stats = fs.statSync(dbPath);
        fileSize = stats.size;
    } catch (e) { /* file doesn't exist yet */ }

    res.json({
        totalCompanies: db.companies.length,
        lastUpdated: db.lastUpdated,
        lastScraped: db.lastScraped,
        fileSizeKB: (fileSize / 1024).toFixed(1)
    });
});

/**
 * POST /api/fetch-capital-structure
 * Fetch pre-IPO investors for a specific company using the IPO Premium capital structure PDF.
 * Body: { companyName: string }
 * Returns: { success, preIpoInvestors, waca, capitalStructureUrl }
 */
app.post('/api/fetch-capital-structure', async (req, res) => {
    try {
        const { companyName } = req.body;
        if (!companyName) return res.status(400).json({ error: 'Missing companyName' });

        console.log(`[CapStruct API] Fetching capital structure for: ${companyName}`);

        // Get the PDF URL
        const capitalStructureUrl = await fetchCapitalStructureUrl(companyName);
        if (!capitalStructureUrl) {
            return res.json({ success: false, error: 'No capital structure PDF found on IPO Premium' });
        }

        // Extract pre-IPO investors
        const result = await extractFromCapitalStructure(companyName, capitalStructureUrl);

        // Update DB if we got results
        if (result.preIpoInvestors && result.preIpoInvestors.length > 0) {
            const db = readDB();
            const company = db.companies.find(c => c.companyName === companyName);
            if (company) {
                company.preIpoInvestors = result.preIpoInvestors;
                if (result.waca !== undefined && result.waca !== null) {
                    company.preIpoWaca = result.waca;
                }
                if (result.peerComparison) {
                    company.peerComparison = result.peerComparison;
                }
                writeDB(db);
            }
        }

        res.json({
            success: true,
            capitalStructureUrl,
            preIpoInvestors: result.preIpoInvestors || [],
            waca: result.waca,
            peerComparison: result.peerComparison,
        });

    } catch (error) {
        console.error('[CapStruct API] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/batch-capital-structure
 * Batch-scrape capital structure PDF URLs from IPO Premium.
 * Query params: ?limit=50&force=false
 */
app.post('/api/batch-capital-structure', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const force = req.query.force === 'true';

        console.log(`[CapStruct API] Starting batch scrape (limit: ${limit}, force: ${force})`);
        const result = await batchScrapeCapitalStructureUrls(limit, force);

        res.json({
            success: true,
            ...result,
            message: `Scraped ${result.scraped} detail pages, found ${result.found} capital structure PDFs`,
        });
    } catch (error) {
        console.error('[CapStruct API] Batch error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Probe upcoming/open IPOs for missing Anchor and Pre-IPO data
 */
async function probeUpcomingData() {
    const db = readDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter upcoming unlisted companies (allotment date is in the future or not yet set)
    const upcoming = db.companies.filter(c => {
        if (c.companyName && c.companyName.toLowerCase().includes('invit')) return false;
        const listDateStr = c.allotmentDate ? (c.allotmentDate.original || c.allotmentDate.adjusted) : null;
        if (!listDateStr) return true;
        const listDate = new Date(listDateStr);
        listDate.setHours(0, 0, 0, 0);
        return listDate >= today;
    });

    console.log(`[ProbeUpcoming] Probing ${upcoming.length} upcoming IPOs for missing Anchor and Pre-IPO data...`);
    let updatedCount = 0;
    const probeLog = [];

    // Probe in parallel chunks of 4
    const CHUNK_SIZE = 4;
    for (let i = 0; i < upcoming.length; i += CHUNK_SIZE) {
        const chunk = upcoming.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (company) => {
            let changed = false;
            const name = company.companyName;

            // 1. Probe Anchors & True Total Shares if anchorInvestors is 0 or missing
            if (!company.anchorInvestors || company.anchorInvestors.length === 0 || !company.anchorShares || company.anchorShares === 0 || !company.totalShares || company.totalShares === 0) {
                try {
                    if (company.chittorgarhUrl) {
                        const parsed = await fetchAnchorInvestorNames(company.chittorgarhUrl);
                        if (parsed.investors && parsed.investors.length > 0) {
                            company.anchorInvestors = parsed.investors;
                            changed = true;
                        }
                        if (parsed.anchorShares > 0 && parsed.anchorShares !== company.anchorShares) {
                            company.anchorShares = parsed.anchorShares;
                            changed = true;
                        }
                        if (parsed.totalShares > 0 && parsed.totalShares !== company.totalShares) {
                            company.totalShares = parsed.totalShares;
                            changed = true;
                        }
                    }
                } catch (e) {
                    console.warn(`[ProbeUpcoming] Anchor error for ${name}: ${e.message}`);
                }
            }

            // Also clean numeric-only entries from anchorInvestors if any
            if (Array.isArray(company.anchorInvestors)) {
                const numericRow = company.anchorInvestors.find(inv => {
                    const str = typeof inv === 'string' ? inv : (inv && inv.name ? inv.name : '');
                    return /^\s*[\d,]+\s*$/.test(str);
                });
                if (numericRow) {
                    const numStr = typeof numericRow === 'string' ? numericRow : numericRow.name;
                    if (!company.anchorShares || company.anchorShares === 0) {
                        company.anchorShares = parseInt(numStr.replace(/,/g, '').trim(), 10);
                        changed = true;
                    }
                    company.anchorInvestors = company.anchorInvestors.filter(inv => {
                        const str = typeof inv === 'string' ? inv : (inv && inv.name ? inv.name : '');
                        return !/^\s*[\d,]+\s*$/.test(str);
                    });
                    changed = true;
                }
            }

            // 2. Probe Capital Structure, Anchor Doc & Pre-IPO Data
            const isCsMissingOrRhp = !company.capitalStructureUrl || 
                company.capitalStructureUrl.toLowerCase().includes('rhp') || 
                !company.capitalStructureUrl.toLowerCase().includes('capital_structure');
            const isPreIpoMissing = !company.preIpoInvestors || company.preIpoInvestors.length === 0;

            if (isCsMissingOrRhp || isPreIpoMissing || !company.anchorUrl) {
                try {
                    const docUrl = await resolveCompanyDocUrl(company, false);
                    if (docUrl && docUrl !== company.capitalStructureUrl) {
                        company.capitalStructureUrl = docUrl;
                        changed = true;
                    }

                    const targetDoc = (company.capitalStructureUrl && company.capitalStructureUrl.toLowerCase().includes('capital_structure')) 
                        ? company.capitalStructureUrl 
                        : null;
                    if (targetDoc && (!company.preIpoInvestors || company.preIpoInvestors.length === 0)) {
                        // Background non-blocking extraction so HTTP response returns fast
                        extractFromCapitalStructure(company.companyName, targetDoc).then(csRes => {
                            if (csRes && Array.isArray(csRes.preIpoInvestors) && csRes.preIpoInvestors.length > 0) {
                                const curDb = readDB();
                                const target = curDb.companies.find(c => c.companyName === company.companyName);
                                if (target) {
                                    target.preIpoInvestors = csRes.preIpoInvestors;
                                    if (csRes.waca) target.preIpoWaca = csRes.waca;
                                    if (csRes.peerComparison) target.peerComparison = csRes.peerComparison;
                                    writeDB(curDb);
                                }
                            }
                        }).catch(() => {});
                    }
                } catch (e) {
                    console.warn(`[ProbeUpcoming] Pre-IPO error for ${name}: ${e.message}`);
                }
            }

            // 3. Probe Pricing, Price Band & Dates from IPO Premium if missing or TBD
            const needsPricingOrDates = !company.priceBand || !company.issuePrice || !company.allotmentDate;
            if (needsPricingOrDates) {
                try {
                    const cachePath = path.join(__dirname, 'data', 'capital-structure-cache.json');
                    if (fs.existsSync(cachePath)) {
                        const csCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                        const normName = company.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const foundKey = Object.keys(csCache).find(k => {
                            const entry = csCache[k];
                            const eName = (entry.companyName || entry.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                            return eName === normName || k === normName || (entry.slug && normName.includes(entry.slug.replace(/[^a-z0-9]/g, '')));
                        });
                        const cachedEntry = foundKey ? csCache[foundKey] : null;
                        
                        if (cachedEntry) {
                            if (cachedEntry.priceBand && company.priceBand !== cachedEntry.priceBand) {
                                company.priceBand = cachedEntry.priceBand;
                                changed = true;
                            }
                            if (cachedEntry.issuePrice && company.issuePrice !== cachedEntry.issuePrice) {
                                company.issuePrice = cachedEntry.issuePrice;
                                changed = true;
                            }
                            if (cachedEntry.lotSize && company.lotSize !== cachedEntry.lotSize) {
                                company.lotSize = cachedEntry.lotSize;
                                changed = true;
                            }
                            if (cachedEntry.allotmentDate && (!company.allotmentDate || !company.allotmentDate.original)) {
                                company.allotmentDate = { original: cachedEntry.allotmentDate, adjusted: cachedEntry.allotmentDate, isAdjusted: false };
                                changed = true;
                            }
                            if (cachedEntry.listingDate && !company.listingDate) {
                                company.listingDate = cachedEntry.listingDate;
                                changed = true;
                            }
                            if (cachedEntry.openDate && !company.openDate) {
                                company.openDate = cachedEntry.openDate;
                                changed = true;
                            }
                            if (cachedEntry.closeDate && !company.closeDate) {
                                company.closeDate = cachedEntry.closeDate;
                                changed = true;
                            }

                            // If still missing key data, scrape the detail page live
                            if (((!company.priceBand || !company.issuePrice) || !company.openDate || !company.closeDate) && cachedEntry.detailUrl) {
                                const detailRes = await scrapeDetailPage(cachedEntry.detailUrl);
                                if (detailRes) {
                                    if (detailRes.priceBand) {
                                        company.priceBand = detailRes.priceBand;
                                        cachedEntry.priceBand = detailRes.priceBand;
                                        changed = true;
                                    }
                                    if (detailRes.issuePrice) {
                                        company.issuePrice = detailRes.issuePrice;
                                        cachedEntry.issuePrice = detailRes.issuePrice;
                                        changed = true;
                                    }
                                    if (detailRes.lotSize) {
                                        company.lotSize = detailRes.lotSize;
                                        cachedEntry.lotSize = detailRes.lotSize;
                                        changed = true;
                                    }
                                    if (detailRes.allotmentDate && (!company.allotmentDate || !company.allotmentDate.original)) {
                                        company.allotmentDate = { original: detailRes.allotmentDate, adjusted: detailRes.allotmentDate, isAdjusted: false };
                                        cachedEntry.allotmentDate = detailRes.allotmentDate;
                                        changed = true;
                                    }
                                    if (detailRes.listingDate && !company.listingDate) {
                                        company.listingDate = detailRes.listingDate;
                                        cachedEntry.listingDate = detailRes.listingDate;
                                        changed = true;
                                    }
                                    if (detailRes.openDate && !company.openDate) {
                                        company.openDate = detailRes.openDate;
                                        cachedEntry.openDate = detailRes.openDate;
                                        changed = true;
                                    }
                                    if (detailRes.closeDate && !company.closeDate) {
                                        company.closeDate = detailRes.closeDate;
                                        cachedEntry.closeDate = detailRes.closeDate;
                                        changed = true;
                                    }
                                    if (detailRes.totalShares && (!company.totalShares || company.totalShares === 0)) {
                                        company.totalShares = detailRes.totalShares;
                                        cachedEntry.totalShares = detailRes.totalShares;
                                        changed = true;
                                    }
                                    fs.writeFileSync(cachePath, JSON.stringify(csCache, null, 2), 'utf8');
                                }
                            }
                        }
                    }
                } catch (pe) {
                    console.warn(`[ProbeUpcoming] Pricing probe error for ${name}: ${pe.message}`);
                }
            }

            if (changed) {
                updatedCount++;
                probeLog.push({
                    company: name,
                    priceBand: company.priceBand,
                    issuePrice: company.issuePrice,
                    lotSize: company.lotSize,
                    anchorsCount: company.anchorInvestors ? company.anchorInvestors.length : 0,
                    preIpoCount: company.preIpoInvestors ? company.preIpoInvestors.length : 0,
                    totalShares: company.totalShares,
                    capitalStructureUrl: company.capitalStructureUrl
                });
            }
        }));
    }

    if (updatedCount > 0) {
        db.lastUpdated = new Date().toISOString();
        writeDB(db);
        console.log(`[ProbeUpcoming] Successfully saved ${updatedCount} updated upcoming companies to DB`);
    }

    return {
        totalProbed: upcoming.length,
        updatedCount,
        probeLog,
        companies: db.companies,
        lastRefreshed: db.lastUpdated
    };
}

/**
 * POST /api/probe-upcoming
 * Actively probes upcoming IPOs for newly released Anchor allotments and Pre-IPO capital structure data
 */
app.post('/api/probe-upcoming', async (req, res) => {
    try {
        // Fast sync: Attach all Capital Structure links, RHPs, anchors and discover new upcoming IPOs
        await syncAllCapitalStructures({ extractPreIpo: false }).catch(e => console.warn('[ProbeUpcoming] Sync warning:', e.message));
        const result = await probeUpcomingData();
        res.json({ success: true, ...result });

        // Trigger background pre-IPO extraction non-blocking
        syncAllCapitalStructures({ extractPreIpo: true }).catch(() => {});
    } catch (e) {
        console.error('[ProbeUpcoming API] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/probe-upcoming', async (req, res) => {
    try {
        await syncAllCapitalStructures({ extractPreIpo: false }).catch(e => console.warn('[ProbeUpcoming] Sync warning:', e.message));
        const result = await probeUpcomingData();
        res.json({ success: true, ...result });

        syncAllCapitalStructures({ extractPreIpo: true }).catch(() => {});
    } catch (e) {
        console.error('[ProbeUpcoming API] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    const db = readDB();
    console.log(`\n🔓 IPO Unlock Tracker running at http://localhost:${PORT}`);
    console.log(`📦 Database: ${db.companies.length} companies stored`);
    if (db.lastUpdated) {
        console.log(`⏰ Last updated: ${new Date(db.lastUpdated).toLocaleString()}`);
    } else {
        console.log('📭 No data yet — click "Refresh Data" to fetch');
    }
});

// ----- BSE Circular / Unlock Details -----
const { getUnlockPercentages, parseLockInData } = require('./circular-scraper');
const { getLivePrice } = require('./price-scraper');

// In-memory hot cache for circular data (backed by DB for persistence across restarts)
const circularCache = new Map();

// Fast document URL resolver for any company
async function resolveCompanyDocUrl(company, forceCheckDetailPage = false) {
    if (!company) return null;

    const cachePath = path.join(__dirname, 'data', 'capital-structure-cache.json');
    const ipoCachePath = path.join(__dirname, 'data', 'ipopremium-cache.json');
    let csCache = null;
    let ipoCache = null;

    try {
        if (fs.existsSync(cachePath)) csCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (e) {}
    try {
        if (fs.existsSync(ipoCachePath)) ipoCache = JSON.parse(fs.readFileSync(ipoCachePath, 'utf8'));
    } catch (e) {}

    let matchedItem = null;
    let matchedSlug = null;

    if (csCache) {
        for (const [slug, item] of Object.entries(csCache)) {
            if (matchesCompany(company.companyName, item.companyName || slug)) {
                matchedItem = item;
                matchedSlug = slug;
                break;
            }
        }
    }

    if (!matchedItem && ipoCache && ipoCache.companies) {
        for (const [slug, item] of Object.entries(ipoCache.companies)) {
            if (matchesCompany(company.companyName, item.name || slug)) {
                matchedItem = item;
                matchedSlug = slug;
                break;
            }
        }
    }

    // If we already have a genuine capital structure URL cached
    if (matchedItem && matchedItem.capitalStructureUrl && matchedItem.capitalStructureUrl.toLowerCase().includes('capital_structure')) {
        company.capitalStructureUrl = matchedItem.capitalStructureUrl;
        if (matchedItem.anchorPdfUrl && !company.anchorUrl) company.anchorUrl = matchedItem.anchorPdfUrl;
        if (matchedItem.rhpUrl && !company.rhpUrl) company.rhpUrl = matchedItem.rhpUrl;
        return matchedItem.capitalStructureUrl;
    }

    // If capital structure URL is missing in cache and forceCheckDetailPage is true, and detailUrl is available:
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const scrapedRecently = matchedItem && matchedItem.lastScrapedAt && (Date.now() - matchedItem.lastScrapedAt < ONE_DAY);
    if (matchedItem && matchedItem.detailUrl && !matchedItem.capitalStructureUrl && !scrapedRecently && forceCheckDetailPage) {
        try {
            matchedItem.lastScrapedAt = Date.now();
            console.log(`[resolveCompanyDocUrl] Probing IPO Premium detail page for ${company.companyName}: ${matchedItem.detailUrl}`);
            const scraped = await scrapeDetailPage(matchedItem.detailUrl);
            let cacheUpdated = false;

            if (scraped && scraped.capitalStructureUrl) {
                matchedItem.capitalStructureUrl = scraped.capitalStructureUrl;
                company.capitalStructureUrl = scraped.capitalStructureUrl;
                cacheUpdated = true;
            }
            if (scraped && scraped.anchorPdfUrl) {
                matchedItem.anchorPdfUrl = scraped.anchorPdfUrl;
                company.anchorUrl = scraped.anchorPdfUrl;
                cacheUpdated = true;
            }
            if (scraped && scraped.rhpUrl) {
                matchedItem.rhpUrl = scraped.rhpUrl;
                company.rhpUrl = scraped.rhpUrl;
                cacheUpdated = true;
            }

            if (cacheUpdated) {
                matchedItem.updatedAt = new Date().toISOString();
                if (csCache && matchedSlug) {
                    csCache[matchedSlug] = { ...(csCache[matchedSlug] || {}), ...matchedItem };
                    fs.writeFileSync(cachePath, JSON.stringify(csCache, null, 2), 'utf8');
                }
                if (ipoCache && ipoCache.companies && matchedSlug) {
                    ipoCache.companies[matchedSlug] = { ...(ipoCache.companies[matchedSlug] || {}), ...matchedItem };
                    fs.writeFileSync(ipoCachePath, JSON.stringify(ipoCache, null, 2), 'utf8');
                }
                if (company.capitalStructureUrl) return company.capitalStructureUrl;
            }
        } catch (e) {
            console.warn(`[resolveCompanyDocUrl] Scrape detail page failed for ${company.companyName}: ${e.message}`);
        }
    }

    // Fallback: If not in cache at all, try fetchCapitalStructureUrl
    if (!matchedItem && forceCheckDetailPage) {
        try {
            const fetchedUrl = await fetchCapitalStructureUrl(company.companyName);
            if (fetchedUrl) {
                company.capitalStructureUrl = fetchedUrl;
                return fetchedUrl;
            }
        } catch (e) {}
    }

    // If company already has a genuine capital structure url
    if (company.capitalStructureUrl && company.capitalStructureUrl.startsWith('http') && company.capitalStructureUrl.toLowerCase().includes('capital_structure')) {
        return company.capitalStructureUrl;
    }

    // 2. Fast Chittorgarh page lookup with 4s timeout
    if (company.chittorgarhUrl) {
        try {
            const chRes = await axios.get(company.chittorgarhUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
                timeout: 4000
            });
            const $ = cheerio.load(chRes.data);
            let foundCap = null;
            let foundRhp = null;
            for (const a of $('a').toArray()) {
                const href = $(a).attr('href') || '';
                const txt = $(a).text().trim().toLowerCase();
                if (href.includes('.pdf') || href.includes('.zip') || href.includes('sebi.gov.in') || href.includes('bseindia.com') || href.includes('nseindia.com')) {
                    if (txt.includes('capital structure') || href.toLowerCase().includes('capital_structure')) {
                        foundCap = href;
                    }
                    if (txt.includes('rhp') || txt.includes('prospectus') || href.toLowerCase().includes('rhp') || href.toLowerCase().includes('prospectus')) {
                        foundRhp = href;
                    }
                }
            }
            if (foundCap) {
                company.capitalStructureUrl = foundCap;
                if (foundRhp) company.rhpUrl = foundRhp;
                return foundCap;
            }
            if (foundRhp) {
                company.rhpUrl = foundRhp;
                // NEVER set company.capitalStructureUrl = foundRhp!
            }
        } catch (e) {}
    }

    return null;
}

/**
 * GET /api/unlock-details/:companyName
 * Fetches lock-in details from BSE/NSE Annexure-I for the given company.
 * Results are cached in DB (persists across server restarts).
 * Use ?force=true to bypass cache and re-fetch fresh data.
 */
app.get('/api/unlock-details/:companyName', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.companyName);
        const forceRefresh = req.query.force === 'true';

        // Find the company in DB — use fuzzy match: case-insensitive, ignore trailing dots/spaces
        const db = readDB();
        const normQ = companyName.toLowerCase().replace(/[\.\s]+$/, '');
        const company = db.companies.find(c =>
            c.companyName === companyName ||
            (c.companyName || '').toLowerCase().replace(/[\.\s]+$/, '') === normQ
        );

        // Common helper to inject live price before returning
        const respondWithPrices = async (basePayload) => {
            if (company) {
                // Ensure capitalStructureUrl is resolved quickly
                if (!company.capitalStructureUrl || !company.capitalStructureUrl.toLowerCase().includes('capital_structure')) {
                    const docUrl = await resolveCompanyDocUrl(company);
                    if (docUrl && docUrl.toLowerCase().includes('capital_structure')) {
                        company.capitalStructureUrl = docUrl;
                        writeDB(db);
                    }
                }

                // Smart auto-resolution of Anchor data on popup load!
                // If company has no anchorInvestors, has only raw string names, or anchorShares is missing:
                const needsAnchorEnrichment = !company.anchorInvestors || 
                    company.anchorInvestors.length === 0 || 
                    (company.anchorInvestors.length > 0 && typeof company.anchorInvestors[0] === 'string') ||
                    !company.anchorShares || company.anchorShares === 0;

                if (needsAnchorEnrichment && company.chittorgarhUrl) {
                    try {
                        const parsed = await fetchAnchorInvestorNames(company.chittorgarhUrl);
                        if (parsed && Array.isArray(parsed.investors) && parsed.investors.length > 0) {
                            company.anchorInvestors = parsed.investors;
                            if (parsed.anchorShares > 0) company.anchorShares = parsed.anchorShares;
                            if (parsed.totalShares > 0 && (!company.totalShares || company.totalShares < parsed.totalShares)) {
                                company.totalShares = parsed.totalShares;
                            }
                            writeDB(db);
                        }
                    } catch (ancErr) {
                        console.warn(`[UnlockDetails] Anchor auto-resolve error for ${company.companyName}:`, ancErr.message);
                    }
                }

                // If preIpoInvestors is missing/undefined, trigger background extraction non-blocking
                if (company.preIpoInvestors === undefined) {
                    const targetDoc = company.capitalStructureUrl || company.rhpUrl;
                    if (targetDoc) {
                        // Background non-blocking extraction
                        extractFromCapitalStructure(company.companyName, targetDoc).then(csRes => {
                            if (csRes && Array.isArray(csRes.preIpoInvestors)) {
                                company.preIpoInvestors = csRes.preIpoInvestors;
                                if (csRes.waca) company.preIpoWaca = csRes.waca;
                                if (csRes.peerComparison) company.peerComparison = csRes.peerComparison;
                            } else {
                                company.preIpoInvestors = [];
                            }
                            writeDB(db);
                        }).catch(() => {
                            company.preIpoInvestors = [];
                            writeDB(db);
                        });
                    } else {
                        company.preIpoInvestors = [];
                        writeDB(db);
                    }
                }
            }

            const liveData = await getLivePrice(companyName);
            return res.json({
                ...basePayload,
                anchorInvestors: company ? (company.anchorInvestors || []) : [],
                anchorShares: company ? company.anchorShares : undefined,
                anchorUrl: company ? company.anchorUrl : undefined,
                totalShares: company ? company.totalShares : undefined,
                preIpoInvestors: company ? (company.preIpoInvestors || []) : [],
                preIpoWaca: company ? (company.preIpoWaca || company.waca) : undefined,
                rhpUrl: company ? (company.capitalStructureUrl || company.rhpUrl) : undefined,
                capitalStructureUrl: company ? (company.capitalStructureUrl || company.rhpUrl) : undefined,
                peerComparison: company ? company.peerComparison : undefined,
                liveMarketPrice: liveData
            });
        };

        // Check caches (skip if force refresh)
        if (!forceRefresh) {
            // 1. Check in-memory hot cache
            if (circularCache.has(companyName)) {
                const cached = circularCache.get(companyName);
                return await respondWithPrices({ ...cached, fromCache: true });
            }

            // 2. Check DB persistent cache
            const dbCached = getCircularData(companyName);
            if (dbCached) {
                // Warm the in-memory cache
                circularCache.set(companyName, dbCached);
                return await respondWithPrices({ ...dbCached, fromCache: true });
            }
        }

        if (!company) {
            return res.status(404).json({ error: 'Company not found in database' });
        }


        const exchange = company.exchange || '';
        const listingDate = company.allotmentDate?.adjusted || company.allotmentDate?.original;

        if (!listingDate) {
            return res.status(400).json({ error: 'No listing date available for this company' });
        }

        console.log(`\n📄 Fetching circular for: ${companyName} (${exchange}, listed: ${listingDate.substring(0, 10)})${forceRefresh ? ' [FORCE REFRESH]' : ''}`);

        // Fetch from NSE first, then BSE fallback
        const result = await getUnlockPercentages(companyName, exchange, listingDate, company?.totalShares);

        if (!result) {
            // Don't cache "not found" — allow retry on next click
            return await respondWithPrices({ found: false, message: 'No circular data found for this company' });
        }

        // If result needs client-side fetch, return immediately without caching
        if (result.needsClientFetch) {
            return await respondWithPrices({ found: false, needsClientFetch: true, bseNoticeId: result.bseNoticeId });
        }

        // If result needs client-side BSE search (server couldn't find notice at all)
        if (result.needsBSESearch) {
            return await respondWithPrices({
                found: false,
                needsBSESearch: true,
                listingDate: result.listingDate,
                companyName: result.companyName
            });
        }

        // Cache the result in both memory and DB
        const response = { found: true, ...result };
        circularCache.set(companyName, response);
        saveCircularData(companyName, response);

        await respondWithPrices(response);

    } catch (error) {
        console.error('Unlock details error:', error.message);
        res.status(500).json({ error: 'Failed to fetch unlock details' });
    }
});

/**
 * POST /api/parse-bse-pdf
 * Client-assisted BSE PDF parsing.
 * The client browser fetches the BSE annexure PDF (bypassing WAF) and sends the raw binary here.
 */
app.post('/api/parse-bse-pdf', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    try {
        const companyName = req.query.company;
        const noticeId = req.query.noticeId;
        const pdfUrl = req.query.pdfUrl;
        const pdfBuffer = req.body;

        if (!pdfBuffer || pdfBuffer.length < 100) {
            return res.status(400).json({ error: 'No PDF data received' });
        }

        console.log(`[BSE/Client] Received PDF from client for ${companyName}: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

        const lockInData = await parseLockInData(pdfBuffer, 'BSE');

        const response = {
            found: true,
            ...lockInData,
            source: 'BSE',
            noticeId: noticeId || 'client-fetched',
            pdfUrl: pdfUrl || null,
            fetchedAt: new Date().toISOString()
        };

        // Cache the result
        if (companyName) {
            circularCache.set(companyName, response);
            saveCircularData(companyName, response);
        }

        res.json(response);

    } catch (error) {
        console.error('[BSE/Client] PDF parse error:', error.message);
        res.status(500).json({ error: 'Failed to parse PDF' });
    }
});
