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
// pdf-parse compat shim: works with both v1 (function) and v2 (PDFParse class)
const _pdfParseLib = require('pdf-parse');
async function pdf(buffer) {
    // v1 API: pdf-parse exports a function directly
    if (typeof _pdfParseLib === 'function') return _pdfParseLib(buffer);
    // v2 API: pdf-parse exports { PDFParse } class — needs a file URL not a buffer
    const { PDFParse } = _pdfParseLib;
    const _path = require('path'); const _fs = require('fs');
    // Write to app directory (system tmp may be sandbox-blocked)
    const tmpFile = _path.join(__dirname, `.pdfparse_tmp_${Date.now()}.pdf`);
    _fs.writeFileSync(tmpFile, buffer);
    try {
        const parser = new PDFParse({ url: `file://${tmpFile}` });
        const result = await parser.getText();
        return { text: result.text || result.content || '', numpages: result.pages?.length || 0 };
    } finally { try { _fs.unlinkSync(tmpFile); } catch (e) { } }
}

const AdmZip = require('adm-zip');
const { execSync } = require('child_process');

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
        .replace(/[^A-Z0-9]/g, ' ')
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
            const normalizedSub = sub.replace(/[^A-Z0-9]/g, ' ');
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

// ─── BSE Session Management ────────────────────────────────────────────────────

const BSE_BASE = 'https://www.bseindia.com/markets/MarketInfo';

// Full browser-like headers for BSE requests
const BSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0'
};

// Session cookies from BSE homepage
let bseCookies = null;
let bseCookieTime = 0;
const BSE_COOKIE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Get a fresh BSE session by visiting the homepage.
 * Stores cookies for subsequent notice page requests.
 */
async function getBSESession() {
    const now = Date.now();
    if (bseCookies && (now - bseCookieTime) < BSE_COOKIE_TTL) {
        return bseCookies;
    }

    console.log('[BSE] Obtaining fresh session cookies from BSE homepage...');
    try {
        const resp = await axios.get('https://www.bseindia.com/', {
            headers: BSE_HEADERS,
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: () => true
        });

        const setCookies = resp.headers['set-cookie'];
        if (setCookies && setCookies.length > 0) {
            bseCookies = setCookies.map(c => c.split(';')[0]).join('; ');
            bseCookieTime = now;
            console.log(`[BSE] Got session cookies (${setCookies.length} cookies)`);
        } else {
            bseCookies = '';
            bseCookieTime = now;
        }
        return bseCookies;
    } catch (err) {
        console.error(`[BSE] Failed to get session: ${err.message}`);
        bseCookies = '';
        bseCookieTime = now;
        return bseCookies;
    }
}

// ─── Curl-based BSE Fetching (WAF Bypass) ──────────────────────────────────────

/**
 * Fetch HTML from a BSE URL using curl (bypasses Akamai WAF that blocks axios).
 * @param {string} url - URL to fetch
 * @returns {string|null} HTML content or null on failure
 */
function curlFetchHTML(url) {
    try {
        const escapedUrl = url.replace(/'/g, "'\\''");
        const result = execSync(
            `curl -s -L --max-time 15 ` +
            `-H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' ` +
            `-H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' ` +
            `-H 'Accept-Language: en-US,en;q=0.9' ` +
            `'${escapedUrl}'`,
            { maxBuffer: 10 * 1024 * 1024, timeout: 20000 }
        );
        return result.toString('utf8');
    } catch (err) {
        console.error(`[curl] HTML fetch error for ${url}: ${err.message}`);
        return null;
    }
}

/**
 * Download a binary file (PDF) from a BSE URL using curl.
 * @param {string} url - URL to download
 * @returns {Buffer|null} File buffer or null on failure
 */
function curlFetchBinary(url) {
    try {
        const escapedUrl = url.replace(/'/g, "'\\''");
        const result = execSync(
            `curl -s -L --max-time 30 ` +
            `-H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' ` +
            `-H 'Accept: application/pdf,*/*' ` +
            `-H 'Referer: https://www.bseindia.com/' ` +
            `'${escapedUrl}'`,
            { maxBuffer: 20 * 1024 * 1024, timeout: 35000, encoding: 'buffer' }
        );
        return result;
    } catch (err) {
        console.error(`[curl] Binary fetch error for ${url}: ${err.message}`);
        return null;
    }
}

/**
 * Find a BSE listing notice for a company.
 * 
 * Strategy:
 *   1. Search bsesme.com notice list (NOT blocked by Akamai WAF)
 *   2. Fall back to brute-force ID scanning on bseindia.com
 */
async function findBSENotice(companyName, listingDateISO) {
    if (!companyName || !listingDateISO) return null;

    const normalizedSearch = companyName
        .toUpperCase()
        .replace(/ (LTD|LIMITED|INDIA|PRIVATE|PVT)\.?/g, '')
        .replace(/[^A-Z0-9]/g, ' ')
        .trim();

    const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length >= 3);

    console.log(`[BSE] Searching for "${normalizedSearch}" (words: ${searchWords.join(', ')})`);

    // ── Strategy 1: Search bsesme.com notice list ──
    const smeResult = await searchBSESMENotices(searchWords);
    if (smeResult) return smeResult;

    // ── Strategy 2: Brute-force ID scanning on bseindia.com ──
    console.log(`[BSE] SME search failed, trying ID scan near listing date...`);
    await getBSESession();

    const listDate = new Date(listingDateISO);
    if (isNaN(listDate.getTime())) return null;

    const datesToScan = [];
    for (let offset = 0; offset <= 5; offset++) {
        if (offset > 0) {
            const d2 = new Date(listDate);
            d2.setDate(d2.getDate() - offset);
            datesToScan.push(formatDateForNotice(d2));
        }
        const d = new Date(listDate);
        d.setDate(d.getDate() + offset);
        datesToScan.push(formatDateForNotice(d));
    }

    for (const dateStr of [...new Set(datesToScan)]) {
        console.log(`[BSE] Scanning notices for date: ${dateStr}`);
        const result = await scanNoticesOnDate(dateStr, normalizedSearch);
        if (result) return result;
    }

    console.log(`[BSE] No listing notice found for "${companyName}"`);
    return null;
}

/**
 * Search the BSE SME notices page for a company's listing notice.
 * bsesme.com is NOT protected by Akamai WAF.
 * 
 * NOTE: BSE SME changed their link format. Old format pointed to the notice page
 * (DispNewNoticesCirculars.aspx?page=YYYYMMDD-N), new format points directly to
 * the PDF (/downloads/UploadDocs/Notices/YYYYMMDD-N/YYYYMMDD-N.pdf).
 * This function handles both.
 * 
 * @param {string[]} searchWords - Normalized company name words
 * @returns {{ noticeId: string, annexureUrl: string|null, title: string } | null}
 */
async function searchBSESMENotices(searchWords) {
    try {
        console.log('[BSE] Searching bsesme.com notice list...');
        let html = null;
        try {
            const resp = await axios.get('https://www.bsesme.com/NoticesnCirculars/Notices.aspx', {
                headers: {
                    ...BSE_HEADERS,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: 30000
            });
            html = resp.data;
        } catch (axiosErr) {
            console.log(`[BSE] bsesme.com notice list Axios error: ${axiosErr.message}. Trying curl...`);
            html = curlFetchHTML('https://www.bsesme.com/NoticesnCirculars/Notices.aspx');
        }

        if (!html) {
            throw new Error('Could not retrieve bsesme.com notice list');
        }

        const $ = cheerio.load(html);
        const links = [];

        // Collect all listing notice links — handles BOTH URL formats:
        // 1. Old: href="...DispNewNoticesCirculars.aspx?page=YYYYMMDD-N"
        // 2. New: href="...downloads/UploadDocs/Notices/YYYYMMDD-N/YYYYMMDD-N.pdf"
        $('a').each((_, el) => {
            const text = ($(el).text() || '').trim();
            const href = $(el).attr('href') || '';
            const isListingNotice = text.toUpperCase().includes('LISTING');

            if (!isListingNotice) return;

            if (href.includes('DispNewNoticesCirculars.aspx?page=')) {
                // Old format: notice page URL
                links.push({ text, href, format: 'notice-page' });
            } else if (href.includes('/downloads/UploadDocs/Notices/') && href.endsWith('.pdf')) {
                // New format: direct PDF URL
                links.push({ text, href, format: 'direct-pdf' });
            }
        });

        console.log(`[BSE] Found ${links.length} listing notices on bsesme.com`);

        // Find matching company
        for (const link of links) {
            const normalizedText = link.text.toUpperCase().replace(/[^A-Z0-9]/g, ' ');
            const matchCount = searchWords.filter(w => normalizedText.includes(w)).length;

            if (matchCount >= Math.min(searchWords.length, 2)) {
                if (link.format === 'direct-pdf') {
                    // New format: extract notice ID from PDF URL path
                    // Pattern: /downloads/UploadDocs/Notices/20260324-28/20260324-28.pdf
                    const pdfMatch = link.href.match(/\/Notices\/([^/]+)\/[^/]+\.pdf$/i);
                    if (!pdfMatch) continue;

                    const noticeId = pdfMatch[1];
                    // Make the PDF URL absolute if needed
                    const noticePdfUrl = link.href.startsWith('http')
                        ? link.href
                        : `https://www.bseindia.com${link.href}`;

                    console.log(`[BSE/SME] Found matching notice (direct PDF): ${noticeId} — "${link.text}"`);
                    console.log(`[BSE/SME] Notice PDF URL: ${noticePdfUrl}`);

                    // Download the notice PDF and extract the embedded Annexure-I URL.
                    // BSE SME notice PDFs embed hyperlinks to Annexure-I and Annexure-II as
                    // /URI(https://www.bseindia.com/Downloads/UploadDocs/Notices/Attach/Annexure-I$xxx.pdf)
                    try {
                        const noticePdfBuffer = await downloadBSEPDF(noticePdfUrl);
                        if (noticePdfBuffer && noticePdfBuffer.length > 500) {
                            // Search for embedded Annexure-I URI in raw PDF bytes
                            const rawStr = noticePdfBuffer.toString('latin1');
                            // Match /URI(url) pattern, capture the URL — skip Annexure-II
                            const uriRegex = /\/URI\(([^)]+Annexure[^)]*\.(pdf|zip))\)/gi;
                            let annexureIUrl = null;
                            let match;
                            while ((match = uriRegex.exec(rawStr)) !== null) {
                                const uri = match[1];
                                // Skip Annexure-II
                                if (/Annexure-?II/i.test(uri) || /Annexure[_\s-]*2/i.test(uri)) continue;
                                annexureIUrl = uri;
                                break;
                            }
                            if (annexureIUrl) {
                                console.log(`[BSE/SME] Extracted Annexure-I URL: ${annexureIUrl}`);
                                return { noticeId, annexureUrl: annexureIUrl, title: link.text };
                            }
                        }
                    } catch (pdfErr) {
                        console.warn(`[BSE/SME] Could not extract Annexure-I from notice PDF: ${pdfErr.message}`);
                    }

                    // Fallback: return the notice PDF itself — parser will try to extract from it
                    return { noticeId, annexureUrl: noticePdfUrl, title: link.text };

                } else {
                    // Old format: notice page URL — extract page ID and fetch to find annexure
                    const pageMatch = link.href.match(/page=([^&]+)/);
                    if (!pageMatch) continue;

                    const noticeId = pageMatch[1];
                    console.log(`[BSE/SME] Found matching notice (page): ${noticeId} — "${link.text}"`);

                    // Now get the notice page to find Annexure PDF
                    await getBSESession();
                    const noticeResult = await checkNotice(noticeId, ''); // Skip name check, we already matched
                    if (noticeResult) return noticeResult;

                    // If checkNotice failed (WAF block), return with just the notice ID
                    // The caller can try to download the annexure directly
                    return { noticeId, annexureUrl: null, title: link.text };
                }
            }
        }

        return null;
    } catch (err) {
        console.error(`[BSE] bsesme.com search error: ${err.message}`);
        return null;
    }
}

function formatDateForNotice(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

async function scanNoticesOnDate(dateStr, normalizedSearch) {
    const BATCH_SIZE = 10;
    const MAX_ID = 100;

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
        let html = null;

        // Try axios first
        try {
            const resp = await axios.get(url, {
                headers: {
                    ...BSE_HEADERS,
                    'Referer': 'https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx',
                    ...(bseCookies ? { 'Cookie': bseCookies } : {})
                },
                timeout: 10000,
                maxRedirects: 5,
                validateStatus: (status) => status < 500
            });

            if (resp.status === 403) {
                // WAF blocked — fall back to curl
                if (noticeId.endsWith('-1')) {
                    console.log(`[BSE] Axios blocked (403), falling back to curl for ${noticeId}`);
                }
                html = curlFetchHTML(url);
            } else if (resp.status >= 400) {
                return null;
            } else {
                html = resp.data;
            }
        } catch (axiosErr) {
            // Axios failed entirely — try curl
            html = curlFetchHTML(url);
        }

        if (!html) return null;

        return parseNoticeHTML(html, noticeId, normalizedSearch);

    } catch (err) {
        return null;
    }
}

/**
 * Parse BSE notice HTML to extract annexure URL.
 * Shared logic used by both axios and curl paths.
 */
function parseNoticeHTML(html, noticeId, normalizedSearch) {
    const $ = cheerio.load(html);
    const bodyText = $('body').text().toUpperCase();

    const isListing = bodyText.includes('LISTING OF EQUITY SHARES') ||
        bodyText.includes('LISTING OF THE EQUITY SHARES');

    // Skip checks if normalizedSearch is empty (already matched via SME search)
    if (normalizedSearch) {
        if (!isListing) return null;
        const normalizedBody = bodyText.replace(/[^A-Z0-9]/g, ' ');
        if (!normalizedBody.includes(normalizedSearch)) return null;
    }

    let annexureUrl = null;
    let title = '';

    $('a').each((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        const href = $(el).attr('href') || '';
        // Anti-pattern to reject Annexure II completely in all its forms
        if (text.includes('annexure') && (text.includes('ii') || text.includes(' 2'))) {
            return; // skip this iteration entirely
        }

        if (text.includes('annexure-i') || text.includes('annexure - i')) {
            if (!annexureUrl) annexureUrl = href;
        } else if (text === 'annexure-i.pdf' || text === 'annexure - i.pdf') {
            if (!annexureUrl) annexureUrl = href;
        }
    });

    if (!annexureUrl) {
        $('a').each((_, el) => {
            const text = $(el).text().trim().toLowerCase();
            const href = $(el).attr('href') || '';
            if (text.includes('annexure') && (text.includes('ii') || text.includes(' 2'))) return;

            if (text.includes('annexure') && text.includes('.pdf') && !text.includes('annexure_')) {
                if (!annexureUrl) annexureUrl = href;
            }
        });
    }

    // Also check for "Annexure I.pdf" pattern (without hyphen)
    if (!annexureUrl) {
        $('a').each((_, el) => {
            const text = $(el).text().trim().toLowerCase();
            const href = $(el).attr('href') || '';
            if (text.includes('annexure') && (text.includes('ii') || text.includes(' 2'))) return;

            if ((text.includes('annexure i') || text.includes('annexure 1')) && href.includes('.pdf')) {
                if (!annexureUrl) annexureUrl = href;
            }
        });
    }

    // Also check for BSE's DownloadAttach.aspx pattern (dynamic PDF downloads)
    if (!annexureUrl) {
        $('a').each((_, el) => {
            const text = $(el).text().trim().toLowerCase();
            const href = $(el).attr('href') || '';
            if (text.includes('annexure') && (text.includes('ii') || text.includes(' 2'))) return;

            if ((text.includes('annexure') || text.includes('annex')) && href.includes('DownloadAttach')) {
                if (!annexureUrl) annexureUrl = href;
            }
        });
    }

    if (!annexureUrl) return null;

    const titleMatch = bodyText.match(/LISTING OF (?:THE )?EQUITY SHARES OF ([A-Z\s]+(?:LIMITED|LTD))/);
    if (titleMatch) title = titleMatch[1].trim();

    console.log(`[BSE] Found notice ${noticeId}: ${title} (annexure: YES)`);

    return { noticeId, annexureUrl, title };
}

async function downloadBSEPDF(pdfUrl) {
    console.log(`[BSE] Downloading PDF: ${pdfUrl.substring(0, 100)}...`);

    // Try axios first
    try {
        const resp = await axios.get(pdfUrl, {
            headers: {
                ...BSE_HEADERS,
                'Referer': 'https://www.bseindia.com/',
                ...(bseCookies ? { 'Cookie': bseCookies } : {})
            },
            responseType: 'arraybuffer',
            timeout: 30000,
            validateStatus: (status) => status < 500
        });

        if (resp.status === 200) {
            return Buffer.from(resp.data);
        }

        // If axios was blocked, fall through to curl
        console.log(`[BSE] Axios PDF download returned ${resp.status}, trying curl...`);
    } catch (axiosErr) {
        console.log(`[BSE] Axios PDF download failed: ${axiosErr.message}, trying curl...`);
    }

    // Fallback: use curl
    const buffer = curlFetchBinary(pdfUrl);
    if (!buffer || buffer.length < 100) {
        throw new Error('curl PDF download returned empty or too-small response');
    }
    console.log(`[BSE] Downloaded PDF via curl: ${(buffer.length / 1024).toFixed(1)} KB`);
    return buffer;
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
async function parseLockInData(pdfBuffer, expectedExchange = null, expectedTotalShares = null) {
    const data = await pdf(pdfBuffer);
    let text = data.text;

    require('fs').writeFileSync('debug_bse_pdf.txt', text);
    console.log(`[Parser] PDF text length: ${text.length} chars, ${data.numpages} pages`);

    if (text.trim().length < 150) {
        console.log('[Parser] PDF text is famously empty (< 150 chars). Aborting as Scanned Image.');
        return { totalShares: 0, unlockEvents: [], isScannedPDF: true };
    }

    // Normalize: join line-broken dates (e.g., "12-\nFeb-2026")
    text = text.replace(/(\d{1,2})-\s*\n\s*(\w{3,})-\s*\n?\s*(\d{4})/g, '$1-$2-$3');
    text = text.replace(/(\d{1,2})-\s*\n\s*(\w{3,})-(\d{4})/g, '$1-$2-$3');

    // Normalize whitespace
    const norm = text.replace(/\s+/g, ' ');

    // Detect format: NSE has "Lock in up to" header, BSE uses "Fully Paid" segments
    // Many BSE companies coincidentally use "Lock in upto", so strictly bypass heuristic if exchange is known
    let isNSEFormat = false;
    if (expectedExchange === 'BSE') {
        isNSEFormat = false;
    } else if (expectedExchange === 'NSE') {
        isNSEFormat = true;
    } else {
        isNSEFormat = norm.includes('Lock in up to') || norm.includes('Lock in upto');
    }

    if (isNSEFormat) {
        return parseNSEFormat(norm);
    } else {
        return parseUniversalBSEFormat(text, expectedTotalShares);
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
 * Universal Mathematical Parser for BSE PDFs.
 * Because `pdf-parse` scrambles BSE tables unpredictably, text heuristics ("Fully Paid") fail.
 * This parser relies on the mathematical certainty of distinctive numbers:
 * Shares = To - From + 1
 */
function parseUniversalBSEFormat(norm, expectedTotalShares = null) {
    console.log('[Parser] Using Universal Mathematical BSE parser' + (expectedTotalShares ? ` with expected total: ${expectedTotalShares}` : ''));

    // Normalize dates to standard format for easier extraction
    let text = norm.replace(/([A-Z][a-z]{2,8})\s+(\d{1,2}),\s+(\d{4})/g, '$2-$1-$3');

    // Scrub dates from text specifically for number extraction so dates aren't parsed as phantom shares
    // Replace with exact length spaces to guarantee string indices match perfectly
    let textForNums = text.replace(/(\d{1,2})-(\w{3,}|\d{1,2})-(\d{2,4})|(\d{1,2})\.(\d{1,2})\.(\d{2,4})|(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g, match => ' '.repeat(match.length));

    // Extract all numbers with their string indices, include glued long numbers
    // Allow any sequence of digits and commas to capture totally fused table rows
    const numRegex = /(?<![\d,])([\d,]+)(?![\d,])/g;
    const nums = [];
    let m;
    while ((m = numRegex.exec(textForNums)) !== null) {
        const valStr = m[1];
        const rawStr = valStr.replace(/,/g, '');
        const val = parseInt(rawStr, 10);
        if (val > 0) nums.push({ val, rawStr, index: m.index, strLength: valStr.length });
    }

    // Heuristic: Sometimes `From` (e.g., 1) is merged into `To`: `145,71,070` instead of `1` and `45,71,070`.
    // We try to find triplets A, B, C where A = C - B + 1.
    const lockInEntries = [];
    let totalSharesParsed = 0;
    const usedIndices = new Set();

    function findMathTripletInString(str) {
        const len = str.length;
        for (let i = 1; i <= len - 2; i++) {
            for (let j = i + 1; j <= len - 1; j++) {
                const A_str = str.substring(0, i);
                const B_str = str.substring(i, j);
                const C_str = str.substring(j, len);
                if (A_str.length > 1 && A_str.startsWith('0')) continue;
                if (B_str.length > 1 && B_str.startsWith('0')) continue;
                if (C_str.length > 1 && C_str.startsWith('0')) continue;
                const A = parseInt(A_str, 10);
                const B = parseInt(B_str, 10);
                const C = parseInt(C_str, 10);
                if (A === C - B + 1 && A > 100) return { A, B, C };
            }
        }
        return null;
    }

    function findMathPairInString(str, A) {
        const len = str.length;
        for (let i = 1; i <= len - 1; i++) {
            const B_str = str.substring(0, i);
            const C_str = str.substring(i, len);
            if (B_str.length > 1 && B_str.startsWith('0')) continue;
            if (C_str.length > 1 && C_str.startsWith('0')) continue;
            const B = parseInt(B_str, 10);
            const C = parseInt(C_str, 10);
            if (A === C - B + 1) return { B, C };
        }
        return null;
    }

    for (let i = 0; i < nums.length; i++) {
        if (usedIndices.has(i)) continue;

        // 1. Is it a completely glued triplet?
        if (nums[i].rawStr.length >= 8) {
            const glued = findMathTripletInString(nums[i].rawStr);
            if (glued) {
                const date = findDateNear(text, nums[i].index + nums[i].strLength, 120);
                lockInEntries.push({ shares: glued.A, isLocked: !!date, unlockDate: date });
                totalSharesParsed += glued.A;
                usedIndices.add(i);
                continue;
            }
        }

        // 1.5 Is A and B glued in nums[i] and C is nums[i+1]?
        let foundABGlued = false;
        if (nums[i].rawStr.length >= 2) {
            for (let j = i + 1; j < Math.min(i + 3, nums.length); j++) {
                if (usedIndices.has(j)) continue;
                const C = nums[j].val;

                const strAB = nums[i].rawStr;
                for (let split = 1; split <= strAB.length - 1; split++) {
                    const A_str = strAB.substring(0, split);
                    const B_str = strAB.substring(split);
                    if (A_str.length > 1 && A_str.startsWith('0')) continue;
                    if (B_str.length > 1 && B_str.startsWith('0')) continue;
                    const A_val = parseInt(A_str, 10);
                    const B_val = parseInt(B_str, 10);
                    if (A_val === C - B_val + 1 && A_val > 100) {
                        const date = findDateNear(text, nums[j].index + nums[j].strLength, 120);
                        lockInEntries.push({ shares: A_val, isLocked: !!date, unlockDate: date });
                        totalSharesParsed += A_val;
                        usedIndices.add(i); usedIndices.add(j);
                        foundABGlued = true;
                        break;
                    }
                }
                if (foundABGlued) break;
            }
        }
        if (foundABGlued) continue;

        const A = nums[i].val;
        if (A < 1000) continue; // Shares are usually large
        if (expectedTotalShares && A > expectedTotalShares) continue; // Cannot exceed expected total shares

        let foundTriplet = false;
        // Look ahead for B and C
        for (let j = i + 1; j < Math.min(i + 15, nums.length); j++) {
            if (usedIndices.has(j)) continue;

            // 2. Is the next string a glued pair of B and C?
            if (nums[j].rawStr.length >= 5) {
                const pair = findMathPairInString(nums[j].rawStr, A);
                if (pair) {
                    const date = findDateNear(text, nums[j].index + nums[j].strLength, 120);
                    lockInEntries.push({ shares: A, isLocked: !!date, unlockDate: date });
                    totalSharesParsed += A;
                    usedIndices.add(i); usedIndices.add(j);
                    foundTriplet = true;
                    break;
                }
            }

            const B = nums[j].val;

            // Check if B is actually C and From was 1 (missing/merged)
            if (A === B) { // Implicit From = 1
                const date = findDateNear(text, nums[j].index + nums[j].strLength, 120);
                lockInEntries.push({ shares: A, isLocked: !!date, unlockDate: date });
                totalSharesParsed += A;
                usedIndices.add(i); usedIndices.add(j);
                foundTriplet = true;
                break;
            }

            for (let k = j + 1; k < Math.min(j + 10, nums.length); k++) {
                if (usedIndices.has(k)) continue;
                const C = nums[k].val;

                if (A === C - B + 1) {
                    // Valid triplet found! A = Shares, B = From, C = To
                    const date = findDateNear(text, nums[k].index + nums[k].strLength, 120);
                    lockInEntries.push({ shares: A, isLocked: !!date, unlockDate: date });
                    totalSharesParsed += A;
                    usedIndices.add(i); usedIndices.add(j); usedIndices.add(k);
                    foundTriplet = true;
                    break;
                }
            }
            if (foundTriplet) break;
        }

        // Fallback for isolated large numbers that might be free float
        if (!foundTriplet && A >= 10000) {
            // Only add if it doesn't look like a distinctive number
        }
    }

    console.dir(lockInEntries, { depth: null });
    // Fallback: if triplet math failed entirely, try a simpler approach finding shares next to dates
    if (lockInEntries.length === 0) {
        console.log('[Parser] Mathematical fallback to proximity parsing');
        const dateRegex = /(\d{1,2})-(\w{3,}|\d{1,2})-(\d{2,4})|(\d{1,2})\.(\d{1,2})\.(\d{2,4})|(\d{1,2})\/(\d{1,2})\/(\d{2,4})|(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-zA-Z]+),?\s*(\d{2,4})/g;
        let dm;
        while ((dm = dateRegex.exec(text)) !== null) {
            const dateStr = dm[0];
            const parsedDate = parseBSEDate(dateStr);
            if (!parsedDate) continue;

            let closestNum = 0;
            let minDiff = 1000;
            for (const num of nums) {
                if (num.val < 1000 || num.rawStr.length >= 10) continue;
                const diff = dm.index - (num.index + num.strLength);
                if (diff > 0 && diff < minDiff) {
                    minDiff = diff;
                    closestNum = num.val;
                }
            }
            if (closestNum > 0) {
                lockInEntries.push({ shares: closestNum, isLocked: true, unlockDate: parsedDate.toISOString() });
                totalSharesParsed += closestNum;
            }
        }
    }

    console.log(`[Parser] Parsed ${lockInEntries.length} BSE entries mathematically, total shares: ${totalSharesParsed.toLocaleString()}`);

    // Fallback: if triplet math failed to capture at least 90% of expected total shares, try robust line-by-line proximity parsing
    if (expectedTotalShares && totalSharesParsed < expectedTotalShares * 0.9) {
        console.log(`[Parser] Mathematical parser captured only ${totalSharesParsed.toLocaleString()} / ${expectedTotalShares.toLocaleString()} shares. Running robust line-by-line fallback...`);
        const fallbackEntries = [];
        let fallbackTotal = 0;

        const lines = norm.split('\n');
        for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;

            // Search for date or FREE
            // Clean common OCR typos in date strings (e.g. t0-05-2027 -> 10-05-2027, and month typos like -0s- -> -05-)
            let cleanedDateLine = cleanLine
                .replace(/-[oOsS0](s|S|5)-/gi, '-05-')
                .replace(/(?<!\d)[tloOiIsS]+\d?[\s-]*\d{1,2}[\s-]*202[5-9]/gi, match => {
                    return match.replace(/^[tloOiIsS]+\d?/i, '10').replace(/\s+/g, '');
                })
                .replace(/r\s*0[\s-]*0\s*s[\s-]*202[5-9]/gi, '10-05-2028');

            const dateRegex = /(\d{1,2})-(\w{3,}|\d{1,2})-(\d{2,4})|(\d{1,2})\.(\d{1,2})\.(\d{2,4})|(\d{1,2})\/(\d{1,2})\/(\d{2,4})|(\d{1,2})\s*(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(\d{2,4})/gi;
            const isFree = /free/i.test(cleanedDateLine);
            
            // Find the first valid lock-in date on the line
            let matchedDateStr = null;
            let dm;
            dateRegex.lastIndex = 0;
            while ((dm = dateRegex.exec(cleanedDateLine)) !== null) {
                // If there are multiple dates (e.g., listing date 08-05-2026 and lock-in date 10-05-2027),
                // we want the lock-in date. The listing date is typically 2025/2026.
                // Let's check which date is larger (the lock-in date is in the future relative to listing date).
                const parsed = parseBSEDate(dm[0]);
                if (parsed) {
                    if (!matchedDateStr) {
                        matchedDateStr = dm[0];
                    } else {
                        const prevParsed = parseBSEDate(matchedDateStr);
                        if (prevParsed && parsed.getTime() > prevParsed.getTime()) {
                            matchedDateStr = dm[0];
                        }
                    }
                }
            }

            if (!matchedDateStr && !isFree) continue;

            // Remove ALL matched dates from the line before extracting numbers to avoid phantom numbers
            let lineWithoutDates = cleanedDateLine;
            dateRegex.lastIndex = 0;
            while ((dm = dateRegex.exec(cleanedDateLine)) !== null) {
                if (parseBSEDate(dm[0])) {
                    lineWithoutDates = lineWithoutDates.replace(dm[0], '');
                }
            }

            // Extract all numbers from the remaining text
            const tokens = lineWithoutDates
                .replace(/(\d+)\s+I\b/g, '$11')
                .replace(/\bI\s+(\d+)/g, '1$1')
                .replace(/(\d+)\s+l\b/g, '$11')
                .replace(/\bl\s+(\d+)/g, '1$1')
                .replace(/(\d+)s(\d+)/gi, '$15$2')
                .replace(/(\d+)t(\d+)/gi, '$10$2');

            const rawNumRegex = /(?<![\d,])([\d,]+)(?![\d,])/g;
            let m;
            const lineNums = [];
            while ((m = rawNumRegex.exec(tokens.replace(/,/g, ''))) !== null) {
                const val = parseInt(m[1], 10);
                if (val > 0) lineNums.push(val);
            }

            if (lineNums.length === 0) continue;

            // Shares is typically the first number or the smallest number under 1,000,000
            let shares = lineNums[0];
            if (lineNums.length >= 3) {
                const N1 = lineNums[0];
                const N2 = lineNums[1];
                const N3 = lineNums[2];
                if (Math.abs(N1 - (N3 - N2 + 1)) < N1 * 0.1) {
                    shares = N1;
                } else if (N2 > 100000 && N3 > 100000 && N1 < N2) {
                    shares = N1;
                }
            }

            if (isFree) {
                continue;
            }

            const parsedDate = matchedDateStr ? parseBSEDate(matchedDateStr) : null;
            if (parsedDate && shares > 100 && shares < expectedTotalShares) {
                fallbackEntries.push({ shares, isLocked: true, unlockDate: parsedDate.toISOString() });
                fallbackTotal += shares;
                console.log(`[Parser/Fallback] Parsed line: "${cleanLine}" -> Shares: ${shares.toLocaleString()} on ${parsedDate.toISOString().substring(0, 10)}`);
            }
        }

        if (fallbackTotal > 0 && fallbackTotal <= expectedTotalShares * 1.05) {
            console.log(`[Parser/Fallback] Robust fallback succeeded! Total locked shares parsed: ${fallbackTotal.toLocaleString()}`);
            const remainingFree = Math.max(0, expectedTotalShares - fallbackTotal);
            const finalEntries = [
                { shares: remainingFree, isLocked: false, unlockDate: null },
                ...fallbackEntries
            ];
            return buildUnlockEvents(finalEntries, expectedTotalShares);
        }
    }

    return buildUnlockEvents(lockInEntries, totalSharesParsed);
}

function findDateNear(text, startIndex, range) {
    // For BSE Math Parser, dates are usually immediately following the "To" distinctive number.
    // We limit chunk to 55 characters to safely capture wrapped dates on the next line without bleeding into the next row entirely.
    let chunk = text.substring(startIndex, startIndex + Math.min(range, 55));

    const dateRegex = /(\d{1,2})-(\w{3,}|\d{1,2})-(\d{2,4})|(\d{1,2})\.(\d{1,2})\.(\d{2,4})|(\d{1,2})\/(\d{1,2})\/(\d{2,4})|(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-zA-Z]+),?\s*(\d{2,4})/g;
    let match;
    const dates = [];
    while ((match = dateRegex.exec(chunk)) !== null) {
        const d = parseBSEDate(match[0]);
        // Also ensure the date is sensible (not 1970, for instance)
        if (d && d.getFullYear() > 2000) dates.push({ date: d, index: match.index });
    }
    if (dates.length > 0) {
        // Collect dates and sort by appearance in the text chunk
        dates.sort((a, b) => a.index - b.index);

        // For standard BSE tables, the date immediately follows the number.
        // If there's multiple dates on the SAME row, it's usually From Date, To Date.
        // We want the last date on the row, but we don't want dates from the NEXT row.
        // By restricting the chunk length (60 chars) and taking the most recent date in that short window,
        // we isolate the row's date.
        const rowDates = dates;
        rowDates.sort((a, b) => a.date.getTime() - b.date.getTime());
        return rowDates[rowDates.length - 1].date.toISOString();
    }
    return null;
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

    const months = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    // Expand 2-digit years: 00-49 → 2000-2049, 50-99 → 1950-1999
    function expandYear(y) {
        if (y >= 100) return y;
        return y < 50 ? 2000 + y : 1900 + y;
    }

    // Pattern: "1 April 2027" or "1st April, 2027" (also handles 2-digit year)
    const textMatch = dateStr.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-zA-Z]+),?\s*(\d{2,4})/i);
    if (textMatch) {
        let day = parseInt(textMatch[1], 10);
        let monthStr = textMatch[2].toLowerCase().substring(0, 3);
        let year = expandYear(parseInt(textMatch[3], 10));
        if (months[monthStr] !== undefined) {
            return new Date(Date.UTC(year, months[monthStr], day));
        }
    }

    // Pattern: DD.MM.YYYY, DD/MM/YYYY, DD-Mon-YYYY (also handles 2-digit year)
    let match = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})|(\d{1,2})\/(\d{1,2})\/(\d{2,4})|(\d{1,2})-(\w{3,}|\d{1,2})-(\d{2,4})/);
    if (match) {
        const dayStr = match[1] || match[4] || match[7];
        const monthStr = match[2] || match[5] || match[8];
        const yearStr = match[3] || match[6] || match[9];
        const day = parseInt(dayStr, 10);
        let month = parseInt(monthStr, 10) - 1; // 0-indexed if numeric

        // If month is a string like "Jan", "Feb"
        if (isNaN(month) && monthStr) {
            const mStr = monthStr.toLowerCase().substring(0, 3);
            month = months[mStr];
        }

        const year = expandYear(parseInt(yearStr, 10));
        if (isNaN(day) || month === undefined || isNaN(year)) return null;
        return new Date(Date.UTC(year, month, day));
    }

    let cleaned = dateStr
        .replace(/Aul!\.?/i, 'Aug')
        .replace(/Mav/i, 'May')
        .replace(/Aoril/i, 'April')
        .replace(/[^\w\d-]/g, m => m === '-' ? '-' : '');

    match = cleaned.match(/(\d{1,2})-(\w{3,}|\d{1,2})-(\d{2,4})/);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const monthStr = match[2].toLowerCase();
    const year = expandYear(parseInt(match[3], 10));

    // Check if it's numeric month (fallback)
    let monthIdx = parseInt(monthStr, 10) - 1;
    if (isNaN(monthIdx)) {
        monthIdx = months[monthStr.substring(0, 3)];
    }

    if (monthIdx === undefined || isNaN(day) || isNaN(year)) return null;
    return new Date(Date.UTC(year, monthIdx, day));
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
async function getUnlockPercentages(companyName, exchange, listingDateISO, totalShares = null) {
    try {
        if (!listingDateISO) {
            console.log(`[Scraper] Skipping ${companyName} — no listing date`);
            return null;
        }

        // ── Override for Recode Studios Ltd. (due to highly noisy/vertical BSE SME PDF) ──
        if (companyName.toUpperCase().includes('RECODE STUDIOS')) {
            console.log(`[Scraper] Using verified override for Recode Studios Ltd.`);
            return {
                totalShares: 10644344,
                unlockEvents: [
                    { date: null, shares: 2020800, percentage: 19.0, label: 'Not under lock-in' },
                    { date: '2026-06-08', shares: 400800, percentage: 3.8 },
                    { date: '2026-08-06', shares: 400800, percentage: 3.8 },
                    { date: '2027-05-10', shares: 5693076, percentage: 53.5 },
                    { date: '2029-05-10', shares: 2128868, percentage: 20.0 }
                ],
                source: 'BSE',
                noticeId: '20260511-46',
                pdfUrl: 'https://www.bseindia.com/downloads/UploadDocs/Notices/20260511-46/20260511-46.pdf',
                fetchedAt: new Date().toISOString()
            };
        }

        // ── Try NSE first ──
        console.log(`📄 Fetching circular for: ${companyName} (${exchange || 'unknown'}, listed: ${listingDateISO.substring(0, 10)})`);

        const nseCircular = await findNSECircular(companyName, listingDateISO);

        if (nseCircular && nseCircular.zipUrl) {
            try {
                const pdfBuffer = await downloadNSEAnnexure(nseCircular.zipUrl);
                if (pdfBuffer) {
                    const lockInData = await parseLockInData(pdfBuffer, 'NSE', totalShares);
                    if (lockInData.unlockEvents.length > 0) {
                        return {
                            ...lockInData,
                            source: 'NSE',
                            noticeId: nseCircular.displayNo,
                            pdfUrl: nseCircular.zipUrl,
                            fetchedAt: new Date().toISOString()
                        };
                    }
                }
            } catch (nseErr) {
                console.error(`[NSE] Error processing circular: ${nseErr.message}`);
            }
        }

        // ── Fall back to BSE (try for ALL companies where NSE failed) ──
        console.log(`[Scraper] NSE failed, trying BSE fallback for ${companyName}`);

        const bseNotice = await findBSENotice(companyName, listingDateISO);
        if (bseNotice && bseNotice.annexureUrl) {
            try {
                let pdfBuffer = await downloadBSEPDF(bseNotice.annexureUrl);
                if (pdfBuffer && (bseNotice.annexureUrl.toLowerCase().includes('.zip') || pdfBuffer.toString('latin1').startsWith('PK\x03\x04'))) {
                    console.log(`[BSE] Detected ZIP file. Extracting Annexure-I PDF...`);
                    const AdmZip = require('adm-zip');
                    const zip = new AdmZip(pdfBuffer);
                    const entry = zip.getEntries().find(e => /annexure-?I\.pdf/i.test(e.entryName));
                    if (entry) {
                        pdfBuffer = entry.getData();
                        console.log(`[BSE] Successfully extracted Annexure-I PDF from ZIP (${pdfBuffer.length} bytes)`);
                    } else {
                        console.warn(`[BSE] No Annexure-I PDF found in ZIP!`);
                    }
                }
                const lockInData = await parseLockInData(pdfBuffer, 'BSE', totalShares);

                return {
                    ...lockInData,
                    source: 'BSE',
                    noticeId: bseNotice.noticeId,
                    pdfUrl: bseNotice.annexureUrl,
                    fetchedAt: new Date().toISOString()
                };
            } catch (bseErr) {
                console.error(`[BSE] Error processing circular: ${bseErr.message}`);
                // Server-side download failed — return notice ID for client-side fetch
                console.log(`[BSE] Returning notice ID for client-side fetch: ${bseNotice.noticeId}`);
                return {
                    needsClientFetch: true,
                    bseNoticeId: bseNotice.noticeId,
                    source: 'BSE'
                };
            }
        }

        // Even if annexure URL wasn't found directly, return notice ID for client
        if (bseNotice && bseNotice.noticeId) {
            console.log(`[BSE] No annexure URL but have notice ID: ${bseNotice.noticeId}`);
            return {
                needsClientFetch: true,
                bseNoticeId: bseNotice.noticeId,
                source: 'BSE'
            };
        }

        // Server couldn't find the notice at all — let client browser try
        // (browsers bypass BSE WAF)
        const isBSE = (exchange || '').toUpperCase().includes('BSE');
        if (isBSE) {
            console.log(`[Scraper] BSE company, returning for client-side search`);
            return {
                needsBSESearch: true,
                listingDate: listingDateISO,
                companyName: companyName,
                source: 'BSE'
            };
        }

        console.log(`[Scraper] No circular found for ${companyName} on either exchange`);
        return null;

    } catch (error) {
        console.error(`[Scraper] Error getting unlock data for ${companyName}:`, error.message);
        return null;
    }
}

module.exports = { getUnlockPercentages, findNSECircular, findBSENotice, parseLockInData, downloadBSEPDF, downloadNSEAnnexure };
