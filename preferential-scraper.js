const axios = require('axios');
const pdf = require('pdf-parse');
const { format, subDays, addDays, isBefore, parseISO } = require('date-fns');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── NSE Equity list (for dedup) ─────────────────────────────────────────────
const NSE_EQUITY_CACHE = path.join(__dirname, 'nse-equity-list.json');
let _nseEquityNamesCache = null;

async function getNSEListedNames() {
    if (_nseEquityNamesCache) return _nseEquityNamesCache;
    // Load from disk if fresh (<24h)
    try {
        if (fs.existsSync(NSE_EQUITY_CACHE)) {
            const saved = JSON.parse(fs.readFileSync(NSE_EQUITY_CACHE, 'utf8'));
            if (Date.now() - new Date(saved.savedAt).getTime() < 24 * 60 * 60 * 1000) {
                _nseEquityNamesCache = new Set(saved.names);
                console.log(`[NSE] Equity list loaded from disk (${_nseEquityNamesCache.size} companies)`);
                return _nseEquityNamesCache;
            }
        }
    } catch { }
    // Download fresh
    try {
        const resp = await axios.get('https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36' },
            timeout: 15000, responseType: 'text'
        });
        const suffixRe = /\s*(limited|ltd|technologies|tech|services|pvt|private|industries|corporation|corp|group|ventures|holdings|&?\s*co\.?)\.*$/gi;
        const norm = s => s.toLowerCase().replace(suffixRe, '').replace(/[^a-z0-9]/g, '').trim();
        const names = resp.data.split('\n').slice(1)
            .map(line => { const cols = line.split(','); return norm(cols[1] || ''); })
            .filter(Boolean);
        _nseEquityNamesCache = new Set(names);
        fs.writeFileSync(NSE_EQUITY_CACHE, JSON.stringify({ names: [...names], savedAt: new Date().toISOString() }));
        console.log(`[NSE] Equity list fetched: ${_nseEquityNamesCache.size} companies`);
    } catch (e) {
        console.warn('[NSE] Could not fetch equity list:', e.message);
        _nseEquityNamesCache = new Set();
    }
    return _nseEquityNamesCache;
}

// ── Disk cache ───────────────────────────────────────────────────────────────
const CACHE_FILE = path.join(__dirname, 'pref-nse-cache.json');

function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            console.log(`[NSE] Loaded ${raw.results?.length || 0} cached results from disk (last scan: ${raw.lastScanDate || 'unknown'})`);
            return raw;
        }
    } catch (e) {
        console.warn('[NSE] Failed to load cache:', e.message);
    }
    return { results: [], lastScanDate: null };
}

function saveCache(results, lastScanDate) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ results, lastScanDate, savedAt: new Date().toISOString() }, null, 2));
        console.log(`[NSE] Saved ${results.length} results to disk`);
    } catch (e) {
        console.warn('[NSE] Failed to save cache:', e.message);
    }
}

// ── NSE session ──────────────────────────────────────────────────────────────
let nseCookieJar = '';

async function nseGet(url, params, opts = {}) {
    const resp = await axios.get(url, {
        params,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': opts.binary ? '*/*' : 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-announcements',
            ...(nseCookieJar ? { 'Cookie': nseCookieJar } : {})
        },
        timeout: opts.timeout || 20000,
        responseType: opts.binary ? 'arraybuffer' : 'json',
        validateStatus: () => true
    });

    const setCookies = resp.headers['set-cookie'];
    if (setCookies?.length > 0) {
        const map = {};
        (nseCookieJar ? nseCookieJar.split('; ') : [])
            .concat(setCookies.map(c => c.split(';')[0]))
            .forEach(c => {
                const eq = c.indexOf('=');
                if (eq > 0) map[c.substring(0, eq)] = c.substring(eq + 1);
            });
        nseCookieJar = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
    }
    return resp;
}

async function initNSESession() {
    try {
        await nseGet('https://www.nseindia.com', null, { timeout: 12000 });
        await new Promise(r => setTimeout(r, 1500));
        await nseGet('https://www.nseindia.com/companies-listing/corporate-filings-announcements', null, { timeout: 12000 });
        await new Promise(r => setTimeout(r, 800));
        console.log('[NSE] Session ready');
    } catch (err) {
        console.warn('[NSE] Session init warning:', err.message);
    }
}

async function fetchNSEAnnouncements(fromDate, toDate) {
    try {
        const resp = await nseGet('https://www.nseindia.com/api/corporate-announcements', {
            index: 'equities',
            from_date: fromDate,
            to_date: toDate
        });
        return Array.isArray(resp.data) ? resp.data : [];
    } catch (err) {
        console.warn(`[NSE] Fetch failed ${fromDate}-${toDate}:`, err.message);
        return [];
    }
}

function isNSETradingApproval(a) {
    const text = (a.attchmntText || '').toLowerCase();
    // Must mention trading approval
    if (!text.includes('trading approval')) return false;
    // Standard preferential pattern
    if (text.includes('preferential') || text.includes('allotted on')) return true;
    // Crown Lifters-style: "Trading Approval from Stock Exchanges pursuant to Regulation 30"
    if (text.includes('stock exchange') || text.includes('regulation 30') || text.includes('listing approval')) return true;
    // Generic "receipt of trading approval" or "listing & trading approval"
    if (text.includes('receipt of') || text.includes('listing and trading') || text.includes('listing & trading')) return true;
    return false;
}

// ── BSE via curl (bypasses TLS fingerprint WAF) ──────────────────────────────
const BSE_COOKIE_FILE = '/tmp/bse_session_cookies.txt';
let bseSessionValid = false;

function initBSESession() {
    try {
        execSync(
            `curl -s -L -c ${BSE_COOKIE_FILE} ` +
            `-H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36" ` +
            `-o /dev/null https://www.bseindia.com/`,
            { timeout: 15000 }
        );
        bseSessionValid = true;
        console.log('[BSE] Session initialized');
    } catch (e) {
        console.warn('[BSE] Session init failed:', e.message);
    }
}

function bseFetch(fromDt, toDt) {
    // fromDt / toDt: YYYYMMDD
    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=1&strCat=Company+Update&strPrevDate=${fromDt}&strScrip=&strSearch=P&strToDate=${toDt}&strType=C&subcategory=Preferential+Issue`;
    const outFile = `/tmp/bse_pref_${fromDt}.json`;
    try {
        execSync(
            `curl -s --max-time 15 -L ` +
            `-b ${BSE_COOKIE_FILE} ` +
            `-H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36' ` +
            `-H 'Accept: application/json' ` +
            `-H 'Referer: https://www.bseindia.com/corporates/ann.html' ` +
            `-H 'Origin: https://www.bseindia.com' ` +
            `-o ${outFile} ` +
            `'${url}'`,
            { timeout: 20000, shell: '/bin/sh' }
        );
        const raw = require('fs').readFileSync(outFile, 'utf8').trim();
        if (!raw) return [];
        const json = JSON.parse(raw);
        const rows = json.Table || (Array.isArray(json) ? json : []);
        // BSE trading approvals: HEADLINE/MORE contains 'LOD/PREF' (BSE letter number)
        // or 'granted listing approval' — the NEWSSUB is always a generic LODR title
        return rows.filter(r => {
            const combined = ((r.HEADLINE || '') + ' ' + (r.MORE || '')).toLowerCase();
            return combined.includes('lod/pref') ||
                combined.includes('granted listing approval') ||
                combined.includes('trading approval') ||
                combined.includes('listing of further issue');
        });

    } catch (e) {
        console.warn(`[BSE] Fetch ${fromDt}-${toDt} failed:`, e.message.substring(0, 100));
        return [];
    }
}

async function scanBSEPreferential(months = 12) {
    if (!bseSessionValid) initBSESession();

    const results = [];
    const seen = new Set();
    const today = new Date();

    for (let i = 0; i < months; i++) {
        const to = new Date(today);
        to.setMonth(to.getMonth() - i);
        const from = new Date(to);
        from.setMonth(from.getMonth() - 1);

        const toStr = to.toISOString().substring(0, 10).replace(/-/g, '');
        const fromStr = from.toISOString().substring(0, 10).replace(/-/g, '');

        console.log(`[BSE] Batch ${fromStr} → ${toStr}`);
        const rows = bseFetch(fromStr, toStr);

        for (const r of rows) {
            const key = String(r.SCRIP_CD || '');
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const pdfFile = r.ATTACHMENTNAME || '';
            // Extract shares from the inline MORE/HEADLINE text
            let shares = null;
            const moreText = r.MORE || r.HEADLINE || '';
            const sm = moreText.match(/(?:approval for|listing of)\s+([\d,]+)\s+Equity\s+Share/i) ||
                moreText.match(/([\d,]+)\s+Equity\s+Shares?\s+of\s+Rs/i);
            if (sm) { const v = parseInt(sm[1].replace(/,/g, ''), 10); if (v > 100) shares = v; }

            results.push({
                source: 'BSE',
                scrip_cd: key,
                company: r.SLONGNAME || '',
                symbol: r.SHORT_NAME || key,
                shares,
                listing_date: null,
                unlock_date: null,
                broadcast_dt: r.DT_TM ? r.DT_TM.substring(0, 10) : '',
                announcement_text: (r.HEADLINE || r.NEWSSUB || '').substring(0, 200),
                pdf_url: pdfFile ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${pdfFile}` : null
            });

        }

        await new Promise(r => setTimeout(r, 400));
    }

    console.log(`[BSE] Found ${results.length} preferential trading approvals`);
    return results;
}

// ── PDF Parsing ──────────────────────────────────────────────────────────────
async function parseTradingApprovalPDF(pdfUrl) {
    if (!pdfUrl) return null;
    try {
        const resp = await nseGet(pdfUrl, null, { binary: true, timeout: 25000 });
        if (resp.status !== 200) return null;

        const pdfData = await pdf(Buffer.from(resp.data));
        const text = pdfData.text.replace(/\u00AD/g, '-');

        const out = { symbol: null, series: 'EQ', shares: null, unlock_date: null, listing_date: null };

        let m = text.match(/\b([A-Z0-9&]{3,15})\s+EQ\s+([\d,]+)/);
        if (m) {
            out.symbol = m[1].trim();
            out.shares = parseInt(m[2].replace(/,/g, ''), 10);
        }

        // Lock-in date from Annexure I
        const lockInPatterns = [
            /Date\s+upto\s+which\s+lock.in[\s\S]{1,200}?(\d{1,2}[-\/]\w{3,}[-\/]\d{4})/i,
            /lock.in[\s\S]{1,300}?(\d{2}[-\/]\w{3,}[-\/]\d{4})/i,
            /\d{6,15}\s*to\s*\d{6,15}\s+(\d{1,2}[-\/]\w{3,}[-\/]\d{4})/i,
        ];
        for (const pat of lockInPatterns) {
            m = text.match(pat);
            if (m) { const d = tryParseDate(m[1].trim()); if (d) { out.unlock_date = d; break; } }
        }

        // Listing date
        const listingPatterns = [
            /effective\s+from\s+(?:\w+,\s*)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
            /admitted\s+to\s+dealings[^,]*(?:from|on)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
        ];
        for (const pat of listingPatterns) {
            m = text.match(pat);
            if (m) { const d = tryParseDate(m[1].trim()); if (d) { out.listing_date = d; break; } }
        }

        if (!out.shares) {
            m = text.match(/([\d,]{5,})\s+(?:Equity\s+)?(?:Shares?|Securities)/i);
            if (m) { const v = parseInt(m[1].replace(/,/g, ''), 10); if (v > 1000) out.shares = v; }
        }

        return out;
    } catch (e) {
        console.warn(`[NSE] PDF parse error for ${pdfUrl}:`, e.message);
        return null;
    }
}

// ── Combined persistent cache (NSE + BSE) ────────────────────────────────────
const COMBINED_CACHE = path.join(__dirname, 'pref-cache.json');

function loadCombinedCache() {
    try {
        if (fs.existsSync(COMBINED_CACHE)) {
            const raw = JSON.parse(fs.readFileSync(COMBINED_CACHE, 'utf8'));
            console.log(`[PREF] Loaded ${raw.results?.length || 0} cached results (NSE last: ${raw.lastNSEScan?.substring(0, 10) || 'none'}, BSE last: ${raw.lastBSEScan?.substring(0, 10) || 'none'})`);
            return raw;
        }
    } catch (e) { console.warn('[PREF] Cache load failed:', e.message); }
    return { results: [], lastNSEScan: null, lastBSEScan: null };
}

function saveCombinedCache(results, lastNSEScan, lastBSEScan) {
    try {
        fs.writeFileSync(COMBINED_CACHE, JSON.stringify({ results, lastNSEScan, lastBSEScan, savedAt: new Date().toISOString() }, null, 2));
        console.log(`[PREF] Saved ${results.length} combined results to disk`);
    } catch (e) { console.warn('[PREF] Cache save failed:', e.message); }
}

const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function tryParseDate(raw) {
    if (!raw) return null;
    raw = raw.replace(/[\u00AD\u2013\u2014]/g, '-').trim();

    let m = raw.match(/^(\d{1,2})[-\/]([A-Za-z]{3,})[-\/](\d{4})$/);
    if (m) {
        const mon = monthMap[m[2].substring(0, 3).toLowerCase()];
        if (mon) { const dt = new Date(Date.UTC(parseInt(m[3]), mon - 1, parseInt(m[1]))); if (!isNaN(dt)) return dt.toISOString().substring(0, 10); }
    }

    m = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
        const mon = monthMap[m[1].substring(0, 3).toLowerCase()];
        if (mon) { const dt = new Date(Date.UTC(parseInt(m[3]), mon - 1, parseInt(m[2]))); if (!isNaN(dt)) return dt.toISOString().substring(0, 10); }
    }

    m = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
    if (m) {
        let y = parseInt(m[3]); if (y < 100) y += 2000;
        const dt = new Date(Date.UTC(y, parseInt(m[2]) - 1, parseInt(m[1])));
        if (!isNaN(dt)) return dt.toISOString().substring(0, 10);
    }

    return null;
}

// ── Name normalizer (shared) ──────────────────────────────────────────────────
const SUFFIX_RE = /\s*(limited|ltd|ltd\.|technologies|tech|services|pvt|private|industries|corporation|corp|group|ventures|holdings|&?\s*co\.?)\.?$/gi;
const normName = s => (s || '').toLowerCase().replace(SUFFIX_RE, '').replace(/[^a-z0-9]/g, '').trim();

// ── Main scan ─────────────────────────────────────────────────────────────────
async function scanPreferential(force = false) {
    const today = new Date();
    const cache = loadCombinedCache();

    // Separate existing NSE and BSE from cache
    let cachedNSE = (cache.results || []).filter(r => r.source === 'NSE');
    let cachedBSE = (cache.results || []).filter(r => r.source === 'BSE');

    // ── NSE incremental scan ──
    const nseLastScan = cache.lastNSEScan ? new Date(cache.lastNSEScan) : null;
    const nseScanFrom = (nseLastScan && !force) ? subDays(nseLastScan, 2) : subDays(today, 365);
    console.log(`[NSE] Scanning from ${format(nseScanFrom, 'dd-MM-yyyy')} (${cachedNSE.length} cached)`);

    await initNSESession();

    let cur = new Date(nseScanFrom);
    let newAnnouncements = [];
    while (isBefore(cur, today)) {
        const batchEnd = new Date(Math.min(addDays(cur, 7).getTime(), today.getTime()));
        const fromStr = format(cur, 'dd-MM-yyyy');
        const toStr = format(batchEnd, 'dd-MM-yyyy');
        console.log(`[NSE] Batch ${fromStr} → ${toStr}`);
        const batch = await fetchNSEAnnouncements(fromStr, toStr);
        newAnnouncements = newAnnouncements.concat(batch);
        await new Promise(r => setTimeout(r, 700));
        cur = addDays(batchEnd, 1);
    }

    const newTAs = newAnnouncements.filter(isNSETradingApproval);
    const existingSeqIds = new Set(cachedNSE.map(r => r.seq_id).filter(Boolean));
    const trulyNew = newTAs.filter(a => !existingSeqIds.has(a.seq_id));
    console.log(`[NSE] ${trulyNew.length} new trading approvals`);

    const parsedNew = [];
    for (const a of trulyNew) {
        let parsed = {};
        if (a.attchmntFile) {
            parsed = await parseTradingApprovalPDF(a.attchmntFile) || {};
            await new Promise(r => setTimeout(r, 300));
        }
        const tm = (a.attchmntText || '').match(/([\d,]+)\s*(?:equity\s*)?shares?/i);
        const sharesFromText = tm ? parseInt(tm[1].replace(/,/g, ''), 10) : null;

        parsedNew.push({
            source: 'NSE',
            seq_id: a.seq_id || null,
            symbol: a.symbol || parsed.symbol || '',
            company: a.sm_name || '',
            isin: a.sm_isin || '',
            shares: parsed.shares || (sharesFromText > 1000 ? sharesFromText : null),
            listing_date: parsed.listing_date || null,
            unlock_date: parsed.unlock_date || null,
            broadcast_dt: a.an_dt ? a.an_dt.substring(0, 10) : '',
            announcement_text: (a.attchmntText || '').substring(0, 200),
            pdf_url: a.attchmntFile || null
        });
    }

    // Merge NSE: drop old entries with same seq_id, add newly parsed
    const newSeqIds = new Set(parsedNew.map(r => r.seq_id).filter(Boolean));
    const mergedNSE = [
        ...cachedNSE.filter(r => !newSeqIds.has(r.seq_id)),
        ...parsedNew
    ];

    // ── BSE scan ──
    // On first scan: full 12-month BSE; on refresh: last 35 days only (recent announcements)
    const bseLastScan = cache.lastBSEScan ? new Date(cache.lastBSEScan) : null;
    const bseIsFirstScan = !bseLastScan || force;
    console.log(`[BSE] ${bseIsFirstScan ? 'Full 12-month' : 'Delta 35-day'} BSE scan...`);

    const nseAllNames = await getNSEListedNames();
    const nseAllSymbols = new Set(mergedNSE.map(r => (r.symbol || '').toUpperCase()));
    const nseAllNamesFromResults = new Set(mergedNSE.map(r => normName(r.company)));

    const isBSEExcluded = r => {
        const name = normName(r.company);
        if (nseAllSymbols.has((r.symbol || '').toUpperCase())) return true;
        if (nseAllNamesFromResults.has(name)) return true;
        if (nseAllNames.has(name)) { console.log(`[BSE] Skip (NSE-listed): ${r.company}`); return true; }
        return false;
    };

    if (bseIsFirstScan) {
        // Full 12-month BSE scan — replaces existing BSE cache
        const freshBSE = await scanBSEPreferential(12);
        cachedBSE = freshBSE.filter(r => !isBSEExcluded(r));
    } else {
        // Delta: scan last 35 days, merge new BSE entries
        const deltaBSE = await scanBSEPreferential(2); // ~2 months
        const existingBSEKeys = new Set(cachedBSE.map(r => r.scrip_cd));
        const newBSE = deltaBSE
            .filter(r => !isBSEExcluded(r))
            .filter(r => !existingBSEKeys.has(r.scrip_cd)); // only truly new entries
        if (newBSE.length) {
            console.log(`[BSE] ${newBSE.length} new BSE entries`);
            cachedBSE = [...cachedBSE, ...newBSE];
        }
        // Also re-check old BSE entries against updated NSE list
        cachedBSE = cachedBSE.filter(r => !isBSEExcluded(r));
    }

    // Combine and sort
    const allResults = [...mergedNSE, ...cachedBSE];
    allResults.sort((a, b) => {
        const da = a.unlock_date || '9999-12-31';
        const db = b.unlock_date || '9999-12-31';
        return da.localeCompare(db);
    });

    // Persist combined results
    saveCombinedCache(allResults, today.toISOString(), today.toISOString());

    console.log(`[PREF] Done: ${allResults.length} total (${mergedNSE.length} NSE + ${cachedBSE.length} BSE)`);
    return allResults;
}

module.exports = { scanPreferential };
