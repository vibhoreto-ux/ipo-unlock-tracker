/**
 * Exchange Circular Scraper (BSE + NSE)
 * 
 * Fetches Annexure-I lock-in data from NSE or BSE listing circulars.
 * 
 * Strategy:
 *   1. NSE API first (fast, structured JSON, works for all NSE-listed companies)
 *   2. BSE direct notice scanning as fallback (for BSE-only companies)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');
const AdmZip = require('adm-zip');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
};

// ─── NSE Scraper ───────────────────────────────────────────────────────────────

/**
 * Search NSE circulars API for a company's listing notice.
 * 
 * @param {string} companyName - Company name to search for
 * @param {string} listingDateISO - ISO date string of the listing date
 * @returns {{ circNumber: string, zipUrl: string, subject: string } | null}
 */
async function findNSECircular(companyName, listingDateISO) {
    if (!companyName || !listingDateISO) return null;

    const listDate = new Date(listingDateISO);
    if (isNaN(listDate.getTime())) return null;

    // Build date range: ±10 days around listing date (DD-MM-YYYY format for NSE API)
    const fromDate = new Date(listDate);
    fromDate.setDate(fromDate.getDate() - 10);
    const toDate = new Date(listDate);
    toDate.setDate(toDate.getDate() + 10);

    const fromStr = `${String(fromDate.getDate()).padStart(2, '0')}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${fromDate.getFullYear()}`;
    const toStr = `${String(toDate.getDate()).padStart(2, '0')}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${toDate.getFullYear()}`;

    // Normalize company name for matching
    const normalizedSearch = companyName
        .toUpperCase()
        .replace(/ (LTD|LIMITED|INDIA|PRIVATE|PVT)\.?$/g, '')
        .replace(/ (LTD|LIMITED|INDIA|PRIVATE|PVT)\.? /g, ' ')
        .replace(/[^A-Z0-9 ]/g, '')
        .trim();

    // Extract key words (skip very short ones)
    const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length >= 3);

    console.log(`[NSE] Searching for "${companyName}" in circulars from ${fromStr} to ${toStr}`);

    try {
        const resp = await axios.get('https://www.nseindia.com/api/circulars', {
            params: {
                keyword: '',
                department: 'CML',
                fromDate: fromStr,
                toDate: toStr
            },
            headers: {
                ...HEADERS,
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        if (!resp.data || !resp.data.data) {
            console.log('[NSE] No data in API response');
            return null;
        }

        // Filter for listing circulars matching our company
        const circulars = resp.data.data.filter(c => {
            // Must be CML department with zip file (contains Annexure PDFs)
            if (c.fileDept !== 'CML' || c.fileExt !== 'zip') return false;

            // Subject must mention "Listing of Equity Shares"
            const sub = (c.sub || '').toUpperCase();
            if (!sub.includes('LISTING OF EQUITY SHARES')) return false;

            // Check if company name words appear in subject
            const normalizedSub = sub.replace(/[^A-Z0-9 ]/g, '');
            const matchCount = searchWords.filter(w => normalizedSub.includes(w)).length;
            return matchCount >= Math.min(searchWords.length, 2); // At least 2 words match (or all if < 2)
        });

        if (circulars.length === 0) {
            console.log(`[NSE] No matching listing circular found for "${companyName}"`);
            return null;
        }

        // Take the first (most relevant) match
        const match = circulars[0];
        console.log(`[NSE] Found circular: ${match.circDisplayNo} — ${match.sub}`);

        return {
            circNumber: match.circNumber,
            zipUrl: match.circFilelink,
            subject: match.sub,
            displayNo: match.circDisplayNo
        };

    } catch (err) {
        console.error(`[NSE] API error: ${err.message}`);
        return null;
    }
}

/**
 * Download an NSE circular ZIP, extract the Annexure-I / lock-in PDF from inside.
 * 
 * NSE ZIPs contain:
 *   - CMLxxxxx.pdf (the main circular with Annexure-I lock-in table)
 *   - SHP_SYMBOL.pdf (shareholding pattern)
 * 
 * @param {string} zipUrl - URL to the ZIP file
 * @returns {Buffer | null} PDF buffer containing lock-in data
 */
async function downloadNSEAnnexure(zipUrl) {
    console.log(`[NSE] Downloading ZIP: ${zipUrl}`);

    const resp = await axios.get(zipUrl, {
        responseType: 'arraybuffer',
        headers: HEADERS,
        timeout: 30000
    });

    const zip = new AdmZip(Buffer.from(resp.data));
    const entries = zip.getEntries();

    console.log(`[NSE] ZIP contains: ${entries.map(e => e.entryName).join(', ')}`);

    // Priority: CML*.pdf (the circular with Annexure-I), not SHP_*.pdf (shareholding)
    let annexurePdf = entries.find(e =>
        e.entryName.toLowerCase().startsWith('cml') && e.entryName.toLowerCase().endsWith('.pdf')
    );

    // Fallback: any PDF that's not SHP
    if (!annexurePdf) {
        annexurePdf = entries.find(e =>
            e.entryName.toLowerCase().endsWith('.pdf') && !e.entryName.toLowerCase().startsWith('shp')
        );
    }

    if (!annexurePdf) {
        console.log('[NSE] No suitable PDF found in ZIP');
        return null;
    }

    console.log(`[NSE] Using PDF: ${annexurePdf.entryName}`);
    return zip.readFile(annexurePdf);
}

// ─── BSE Scraper (Fallback) ────────────────────────────────────────────────────

const BSE_BASE = 'https://www.bseindia.com/markets/MarketInfo';

/**
 * Find a BSE listing notice by scanning notice IDs near the listing date.
 * Used as fallback for BSE-only companies not on NSE.
 * 
 * @param {string} companyName - Company name
 * @param {string} listingDateISO - ISO listing date
 * @returns {{ noticeId: string, annexureUrl: string, title: string } | null}
 */
async function findBSENotice(companyName, listingDateISO) {
    if (!companyName || !listingDateISO) return null;

    const listDate = new Date(listingDateISO);
    if (isNaN(listDate.getTime())) return null;

    const normalizedSearch = companyName
        .toUpperCase()
        .replace(/ (LTD|LIMITED|INDIA|PRIVATE|PVT)\.?/g, '')
        .replace(/[^A-Z0-9 ]/g, '')
        .trim();

    console.log(`[BSE] Searching for "${normalizedSearch}" near ${listDate.toISOString().slice(0, 10)}`);

    // Scan ±10 days around listing date
    const datesToScan = [];
    for (let offset = 0; offset <= 10; offset++) {
        const d = new Date(listDate);
        d.setDate(d.getDate() + offset);
        datesToScan.push(formatDateForNotice(d));
        if (offset > 0) {
            const d2 = new Date(listDate);
            d2.setDate(d2.getDate() - offset);
            datesToScan.push(formatDateForNotice(d2));
        }
    }

    const uniqueDates = [...new Set(datesToScan)];

    for (const dateStr of uniqueDates) {
        console.log(`[BSE] Scanning notices for date: ${dateStr}`);
        const result = await scanNoticesOnDate(dateStr, normalizedSearch);
        if (result) return result;
    }

    console.log(`[BSE] No listing notice found for "${companyName}"`);
    return null;
}

function formatDateForNotice(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

async function scanNoticesOnDate(dateStr, normalizedSearch) {
    const BATCH_SIZE = 10;
    const MAX_ID = 60;

    for (let start = 1; start <= MAX_ID; start += BATCH_SIZE) {
        const batch = [];
        for (let i = start; i < start + BATCH_SIZE && i <= MAX_ID; i++) {
            batch.push(`${dateStr}-${i}`);
        }

        const results = await Promise.allSettled(
            batch.map(id => checkNotice(id, normalizedSearch))
        );

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                return result.value;
            }
        }
    }

    return null;
}

async function checkNotice(noticeId, normalizedSearch) {
    try {
        const url = `${BSE_BASE}/DispNewNoticesCirculars.aspx?page=${noticeId}`;
        const resp = await axios.get(url, {
            headers: HEADERS,
            timeout: 10000,
            insecureHTTPParser: true
        });

        const $ = cheerio.load(resp.data);
        const bodyText = $('body').text().toUpperCase();

        const isListing = bodyText.includes('LISTING OF EQUITY SHARES') ||
            bodyText.includes('LISTING OF THE EQUITY SHARES');

        if (!isListing) return null;

        const normalizedBody = bodyText.replace(/[^A-Z0-9 ]/g, '');
        if (!normalizedBody.includes(normalizedSearch)) return null;

        let annexureUrl = null;
        let title = '';

        $('a').each((_, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';
            if (text.toLowerCase().includes('annexure-i') && !text.toLowerCase().includes('annexure-ii')) {
                annexureUrl = href;
            } else if (text.toLowerCase() === 'annexure-i.pdf') {
                annexureUrl = href;
            }
        });

        if (!annexureUrl) {
            $('a').each((_, el) => {
                const text = $(el).text().trim().toLowerCase();
                const href = $(el).attr('href') || '';
                if (text.includes('annexure') && text.includes('.pdf') && !text.includes('annexure-ii') && !text.includes('annexure_')) {
                    annexureUrl = href;
                }
            });
        }

        // Also check for "Annexure I.pdf" pattern (without hyphen)
        if (!annexureUrl) {
            $('a').each((_, el) => {
                const text = $(el).text().trim().toLowerCase();
                const href = $(el).attr('href') || '';
                if ((text.includes('annexure i') || text.includes('annexure 1')) && !text.includes('annexure ii') && href.includes('.pdf')) {
                    annexureUrl = href;
                }
            });
        }

        if (!annexureUrl) return null;

        const titleMatch = bodyText.match(/LISTING OF (?:THE )?EQUITY SHARES OF ([A-Z\s]+(?:LIMITED|LTD))/);
        if (titleMatch) title = titleMatch[1].trim();

        console.log(`[BSE] Found notice ${noticeId}: ${title} (annexure: YES)`);

        return { noticeId, annexureUrl, title };

    } catch (err) {
        return null;
    }
}

async function downloadBSEPDF(pdfUrl) {
    console.log(`[BSE] Downloading PDF: ${pdfUrl.substring(0, 100)}...`);
    const resp = await axios.get(pdfUrl, {
        headers: {
            ...HEADERS,
            'Referer': 'https://www.bseindia.com/'
        },
        responseType: 'arraybuffer',
        timeout: 30000
    });
    return Buffer.from(resp.data);
}

// ─── PDF Parsing (Common) ──────────────────────────────────────────────────────

/**
 * Parse lock-in data from an Annexure-I PDF (works for both BSE and NSE formats).
 * 
 * NSE format example:
 *   8723813 | 1 | 8723813 | 20-Sep-2025
 *   3242    | ...        | Free
 * 
 * BSE format: 
 *   "Fully Paid" segments with lock-in dates/categories
 * 
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {{ totalShares: number, unlockEvents: Array }}
 */
async function parseLockInData(pdfBuffer) {
    const data = await pdf(pdfBuffer);
    let text = data.text;

    console.log(`[Parser] PDF text length: ${text.length} chars, ${data.numpages} pages`);

    // Normalize: join line-broken dates (e.g., "12-\nFeb-2026")
    text = text.replace(/(\d{1,2})-\s*\n\s*(\w{3,})-\s*\n?\s*(\d{4})/g, '$1-$2-$3');
    text = text.replace(/(\d{1,2})-\s*\n\s*(\w{3,})-(\d{4})/g, '$1-$2-$3');

    // Normalize whitespace
    const norm = text.replace(/\s+/g, ' ');

    // Detect format: NSE has "Lock in up to" header, BSE uses "Fully Paid" segments
    const isNSEFormat = norm.includes('Lock in up to') || norm.includes('Lock in upto');

    if (isNSEFormat) {
        return parseNSEFormat(norm);
    } else {
        return parseBSEFormat(norm);
    }
}

/**
 * Parse NSE Annexure-I format:
 * 
 *   No. of Equity Shares | Distinctive Nos. From | To | Lock in up to | Fully Paid-up
 *   8723813 1 8723813 20-Sep-2025
 *   3242 17447641 17450882 Free
 */
function parseNSEFormat(text) {
    console.log('[Parser] Using NSE format parser');

    // Find the Annexure-I / lock-in section
    const annexureStart = text.search(/Annexure[\s-]*I?\b/i);
    const lockInStart = text.search(/Lock[\s-]*in[\s]*(?:up[\s]*to|details)/i);
    const startPos = Math.max(annexureStart, lockInStart, 0);
    const section = text.substring(startPos);

    const lockInEntries = [];
    let totalShares = 0;

    // Match patterns: {shares} {from} {to} {date or Free}
    // Date format: DD-Mon-YYYY or "Free"
    const lineRegex = /([\d,]+)\s+[\d,]+\s+[\d,]+\s+((?:\d{1,2}-\w{3,}-\d{4})|Free)/gi;
    let match;

    while ((match = lineRegex.exec(section)) !== null) {
        const shares = parseIndianNumber(match[1]);
        const lockInfo = match[2].trim();

        if (shares <= 0) continue;
        totalShares += shares;

        if (lockInfo.toLowerCase() === 'free') {
            lockInEntries.push({ shares, isLocked: false, unlockDate: null });
        } else {
            const unlockDate = parseBSEDate(lockInfo);
            lockInEntries.push({
                shares,
                isLocked: true,
                unlockDate: unlockDate ? unlockDate.toISOString() : null
            });
        }
    }

    // If regex didn't find enough entries, try an alternative approach
    if (lockInEntries.length < 2) {
        console.log('[Parser] Trying alternative NSE parse...');
        return parseNSEFallback(section, totalShares, lockInEntries);
    }

    console.log(`[Parser] Parsed ${lockInEntries.length} NSE entries, total shares: ${totalShares.toLocaleString()}`);
    return buildUnlockEvents(lockInEntries, totalShares);
}

/**
 * Fallback NSE parser: scan for all share counts and dates
 */
function parseNSEFallback(text, existingTotal, existingEntries) {
    console.log('[Parser] NSE fallback parser');

    // Find all dates and "Free" markers with preceding share counts
    const entries = existingEntries.length > 0 ? [...existingEntries] : [];
    let total = existingTotal;

    // Split by lines and look for patterns with numbers followed by dates
    const segments = text.split(/\n/);
    for (const seg of segments) {
        const nums = seg.match(/[\d,]{3,}/g);
        const dateMatch = seg.match(/(\d{1,2}-\w{3,}-\d{4})/);
        const isFree = /\bFree\b/i.test(seg);

        if (nums && nums.length >= 1 && (dateMatch || isFree)) {
            const shares = parseIndianNumber(nums[0]);
            if (shares <= 0) continue;

            total += shares;

            if (isFree) {
                entries.push({ shares, isLocked: false, unlockDate: null });
            } else if (dateMatch) {
                const unlockDate = parseBSEDate(dateMatch[1]);
                entries.push({
                    shares,
                    isLocked: true,
                    unlockDate: unlockDate ? unlockDate.toISOString() : null
                });
            }
        }
    }

    console.log(`[Parser] Fallback parsed ${entries.length} entries, total shares: ${total.toLocaleString()}`);
    return buildUnlockEvents(entries, total);
}

/**
 * Parse BSE Annexure-I format (existing "Fully Paid" based parser)
 */
function parseBSEFormat(norm) {
    console.log('[Parser] Using BSE format parser');

    // Find all "Fully Paid" positions
    const fpPositions = [];
    const fpRegex = /Fully Paid/gi;
    let m;
    while ((m = fpRegex.exec(norm)) !== null) {
        fpPositions.push(m.index);
    }

    console.log(`[Parser] Found ${fpPositions.length} "Fully Paid" entries`);

    const lockInEntries = [];
    let totalSharesParsed = 0;

    for (let idx = 0; idx < fpPositions.length; idx++) {
        const pos = fpPositions[idx];
        const nextPos = idx < fpPositions.length - 1 ? fpPositions[idx + 1] : norm.length;
        const prevPos = idx > 0 ? fpPositions[idx - 1] : 0;
        const beforeText = norm.substring(prevPos, pos);
        const afterText = norm.substring(pos, nextPos);

        const isNotLocked = /Not Under Lock|Lock-in Not A|Not.?Locked|Lock.?in.?Not/i.test(afterText);
        const isLocked = /Under Lock|Locked.?in|Lock.?in.?Period|Lock.?in.?Appli/i.test(afterText) && !isNotLocked;

        // If neither pattern found, treat as not-locked (many SME PDFs omit explicit status)
        const effectiveNotLocked = !isLocked;

        let cleanBefore = beforeText.replace(/\d{1,2}-\w{3,}-\d{4}/g, '');
        cleanBefore = cleanBefore.replace(/(?<![,\d])\b\d{1,2}\b(?![,\d])/g, '');
        cleanBefore = cleanBefore.replace(/Fully Paid[^0-9]*/gi, '');
        cleanBefore = cleanBefore.replace(/(Demat|Phvsical|Physical|Lock-in|Applicable|ESOP|AIF|IPO Public)[^\d]*/gi, '');

        const nums = cleanBefore.match(/[\d,]{3,}/g);
        if (!nums || nums.length === 0) continue;

        let shares = 0;
        if (nums.length >= 3) {
            shares = parseIndianNumber(nums[nums.length - 3]);
        } else if (nums.length === 2) {
            shares = parseIndianNumber(nums[0]);
        } else {
            shares = parseIndianNumber(nums[0]);
        }

        if (shares <= 0) continue;
        totalSharesParsed += shares;

        if (effectiveNotLocked) {
            lockInEntries.push({ shares, isLocked: false, unlockDate: null });
            continue;
        }

        const dates = [];
        const dateRegex = /(\d{1,2})-(\w{3,})-(\d{4})/g;
        let dm;
        while ((dm = dateRegex.exec(afterText)) !== null) {
            const parsed = parseBSEDate(dm[0]);
            if (parsed) dates.push(parsed);
        }

        let unlockDate = null;
        if (dates.length >= 2) {
            dates.sort((a, b) => a.getTime() - b.getTime());
            unlockDate = dates[dates.length - 1];
        } else if (dates.length === 1) {
            unlockDate = dates[0];
        }

        lockInEntries.push({
            shares,
            isLocked: true,
            unlockDate: unlockDate ? unlockDate.toISOString() : null
        });
    }

    console.log(`[Parser] Parsed ${lockInEntries.length} BSE entries, total shares: ${totalSharesParsed.toLocaleString()}`);
    return buildUnlockEvents(lockInEntries, totalSharesParsed);
}

/**
 * Build unlock events from parsed lock-in entries
 */
function buildUnlockEvents(lockInEntries, totalShares) {
    const unlockMap = new Map();
    let notLockedShares = 0;

    for (const entry of lockInEntries) {
        if (!entry.isLocked) {
            notLockedShares += entry.shares;
            continue;
        }
        if (!entry.unlockDate) continue;

        const dateKey = entry.unlockDate.substring(0, 10);
        unlockMap.set(dateKey, (unlockMap.get(dateKey) || 0) + entry.shares);
    }

    const unlockEvents = Array.from(unlockMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, shares]) => ({
            date,
            shares,
            percentage: totalShares > 0
                ? Math.round((shares / totalShares) * 1000) / 10
                : 0
        }));

    if (notLockedShares > 0) {
        unlockEvents.unshift({
            date: null,
            shares: notLockedShares,
            percentage: totalShares > 0
                ? Math.round((notLockedShares / totalShares) * 1000) / 10
                : 0,
            label: 'Not under lock-in'
        });
    }

    console.log(`[Parser] Unlock events:`, unlockEvents.map(e =>
        `${e.date || 'Free'}: ${e.shares.toLocaleString()} (${e.percentage}%)`
    ));

    return {
        totalShares,
        unlockEvents
    };
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

function parseIndianNumber(str) {
    if (!str) return 0;
    return parseInt(str.replace(/,/g, ''), 10) || 0;
}

function parseBSEDate(dateStr) {
    if (!dateStr) return null;

    let cleaned = dateStr
        .replace(/Aul!\.?/i, 'Aug')
        .replace(/Mav/i, 'May')
        .replace(/Aoril/i, 'April')
        .replace(/[^\w\d-]/g, match => match === '-' ? '-' : '');

    const months = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    const match = cleaned.match(/(\d{1,2})-(\w{3,})-(\d{4})/);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const monthStr = match[2].toLowerCase().substring(0, 3);
    const year = parseInt(match[3], 10);
    const month = months[monthStr];

    if (month === undefined || isNaN(day) || isNaN(year)) return null;

    return new Date(year, month, day);
}

// ─── Main Orchestrator ─────────────────────────────────────────────────────────

/**
 * Get unlock percentages for a company.
 * 
 * Strategy:
 *   1. Try NSE API first (works for NSE, BSE+NSE, and NSE SME companies)
 *   2. Fall back to BSE direct notice scanning for BSE-only companies
 * 
 * @param {string} companyName - Company name
 * @param {string} exchange - Exchange info (e.g., "BSE, NSE" or "NSE SME")
 * @param {string} listingDateISO - ISO date string for listing date  
 * @returns {{ totalShares: number, unlockEvents: Array, source: string } | null}
 */
async function getUnlockPercentages(companyName, exchange, listingDateISO) {
    try {
        if (!listingDateISO) {
            console.log(`[Scraper] Skipping ${companyName} — no listing date`);
            return null;
        }

        // ── Try NSE first ──
        console.log(`📄 Fetching circular for: ${companyName} (${exchange || 'unknown'}, listed: ${listingDateISO.substring(0, 10)})`);

        const nseCircular = await findNSECircular(companyName, listingDateISO);

        if (nseCircular && nseCircular.zipUrl) {
            try {
                const pdfBuffer = await downloadNSEAnnexure(nseCircular.zipUrl);
                if (pdfBuffer) {
                    const lockInData = await parseLockInData(pdfBuffer);
                    if (lockInData.unlockEvents.length > 0) {
                        return {
                            ...lockInData,
                            source: 'NSE',
                            noticeId: nseCircular.displayNo,
                            fetchedAt: new Date().toISOString()
                        };
                    }
                }
            } catch (nseErr) {
                console.error(`[NSE] Error processing circular: ${nseErr.message}`);
            }
        }

        // ── Fall back to BSE ──
        if (exchange && exchange.includes('BSE')) {
            console.log(`[Scraper] NSE failed, trying BSE fallback for ${companyName}`);

            const bseNotice = await findBSENotice(companyName, listingDateISO);
            if (bseNotice && bseNotice.annexureUrl) {
                const pdfBuffer = await downloadBSEPDF(bseNotice.annexureUrl);
                const lockInData = await parseLockInData(pdfBuffer);

                return {
                    ...lockInData,
                    source: 'BSE',
                    noticeId: bseNotice.noticeId,
                    fetchedAt: new Date().toISOString()
                };
            }
        }

        console.log(`[Scraper] No circular found for ${companyName} on either exchange`);
        return null;

    } catch (error) {
        console.error(`[Scraper] Error getting unlock data for ${companyName}:`, error.message);
        return null;
    }
}

module.exports = { getUnlockPercentages, findNSECircular, findBSENotice, parseLockInData, downloadBSEPDF, downloadNSEAnnexure };
