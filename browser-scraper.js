const axios = require('axios');
const cheerio = require('cheerio');
const { getNextBusinessDay, calculatePreIPOLockin } = require('./holidays');

const BASE_API = 'https://webnodejs.chittorgarh.com/cloud/report/data-read';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.chittorgarh.com/',
    'Origin': 'https://www.chittorgarh.com',
    'Accept': 'application/json',
};

/**
 * Main: scrape IPO list + anchor data for a given year via Chittorgarh API
 */
async function scrapeWithBrowser(year, existingCompanies = [], forceRefresh = false) {
    try {
        console.log(`[API Scraper] Starting for year ${year}...`);

        const [ipoList, anchorData] = await Promise.all([
            fetchIPOList(year),
            fetchAnchorData(year)
        ]);

        const merged = await mergeData(ipoList, anchorData, year, existingCompanies, forceRefresh);
        console.log(`[API Scraper] Done: ${merged.length} companies for ${year}`);
        return merged;

    } catch (error) {
        console.error(`[API Scraper] Error for ${year}:`, error.message);
        return [];
    }
}

/**
 * Fetch IPO list from Chittorgarh API (report 82)
 */
async function fetchIPOList(year) {
    const yearRange = `${year - 1}-${String(year).slice(2)}`;
    const url = `${BASE_API}/82/1/2/${year}/${yearRange}/0/all/0?search=&v=11-35`;
    console.log(`[IPO List] Fetching: ${url}`);

    try {
        const resp = await axios.get(url, { headers: HEADERS, timeout: 30000 });
        const records = resp.data.reportTableData || [];
        console.log(`[IPO List] Got ${records.length} records for ${year}`);

        const processed = [];
        const seen = new Set();

        for (const rec of records) {
            // Extract company name from HTML link
            const rawName = rec['Company'] || '';
            const $ = cheerio.load(rawName);
            const anchor = $('a');
            let companyName = anchor.text().trim() || rawName.replace(/<[^>]+>/g, '').trim();
            companyName = companyName.replace(/\s+IPO\s*$/i, '').trim();

            const chittorgarhUrl = anchor.attr('href') || null;

            if (!companyName || seen.has(companyName)) continue;
            seen.add(companyName);

            const exchange = rec['Listing at'] || '';
            const issueType = exchange.includes('SME') ? 'SME' : 'Mainboard';

            // Use the internal ISO date fields for accuracy
            const closeDateStr = rec['~IssueCloseDate'] || '';
            const listingDateStr = rec['~ListingDate'] || '';

            // Use listing date (allotment ≈ listing) if available, else close date + business day
            let allotmentDate = null;
            if (listingDateStr) {
                const listDate = parseDate(listingDateStr);
                if (listDate) {
                    const adjusted = getNextBusinessDay(listDate);
                    allotmentDate = {
                        original: listDate.toISOString(),
                        adjusted: adjusted.toISOString(),
                        isAdjusted: listDate.getTime() !== adjusted.getTime()
                    };
                }
            } else if (closeDateStr) {
                const closeDate = parseDate(closeDateStr);
                if (closeDate) {
                    const adjusted = getNextBusinessDay(closeDate);
                    allotmentDate = {
                        original: closeDate.toISOString(),
                        adjusted: adjusted.toISOString(),
                        isAdjusted: closeDate.getTime() !== adjusted.getTime()
                    };
                }
            }

            // Parse Issue Price, picking the upper band if it's a range (e.g. "71.00 to 72.00")
            const issuePriceStr = rec['Issue Price (Rs.)'] || '';
            let issuePrice = null;
            if (issuePriceStr) {
                const matches = issuePriceStr.match(/(\d+\.?\d*)/g);
                if (matches && matches.length > 0) {
                    issuePrice = parseFloat(matches[matches.length - 1]);
                }
            }

            processed.push({
                companyName,
                issueType,
                exchange,
                allotmentDate,
                chittorgarhUrl,
                issuePrice
            });
        }

        return processed;

    } catch (err) {
        console.error(`[IPO List] Error:`, err.message);
        return [];
    }
}

/**
 * Fetch Anchor lock-in data from Chittorgarh API (report 156)
 */
async function fetchAnchorData(year) {
    const yearRange = `${year - 1}-${String(year).slice(2)}`;
    const url = `${BASE_API}/156/1/2/${year}/${yearRange}/0/all/0?search=&v=11-35`;
    console.log(`[Anchor] Fetching: ${url}`);

    try {
        const resp = await axios.get(url, { headers: HEADERS, timeout: 30000 });
        const records = resp.data.reportTableData || [];
        console.log(`[Anchor] Got ${records.length} records for ${year}`);

        const processed = records.map(rec => {
            // Extract company name from HTML link
            const rawName = rec['Company'] || '';
            const $ = cheerio.load(rawName);
            const anchor = $('a');
            let companyName = anchor.text().trim() || rawName.replace(/<[^>]+>/g, '').trim();
            companyName = companyName.replace(/\s+IPO\s*$/i, '').trim();

            const chittorgarhUrl = anchor.attr('href') || null;

            const rawIssueType = rec['Issue Type'] || '';
            const issueType = rawIssueType === 'Mainline' ? 'Mainboard' : rawIssueType;

            // Use internal ISO dates for accuracy
            const allotDateStr = rec['~Timetable_BOA_dt'] || '';
            const date30Str = rec['~AnchorDate1'] || '';
            const date90Str = rec['~AnchorDate2'] || '';

            const allotDate = parseDate(allotDateStr);
            const date30 = parseDate(date30Str);
            const date90 = parseDate(date90Str);

            const final30 = date30 ? getNextBusinessDay(date30) : null;
            const final90 = date90 ? getNextBusinessDay(date90) : null;

            return {
                companyName,
                issueType,
                chittorgarhUrl,
                allotmentDate: allotDate ? {
                    original: allotDate.toISOString(),
                    adjusted: getNextBusinessDay(allotDate).toISOString(),
                    isAdjusted: allotDate.getTime() !== getNextBusinessDay(allotDate).getTime()
                } : null,
                anchor30: final30 ? {
                    original: date30.toISOString(),
                    adjusted: final30.toISOString(),
                    isAdjusted: date30.getTime() !== final30.getTime()
                } : null,
                anchor90: final90 ? {
                    original: date90.toISOString(),
                    adjusted: final90.toISOString(),
                    isAdjusted: date90.getTime() !== final90.getTime()
                } : null
            };
        });

        return processed;

    } catch (err) {
        console.error(`[Anchor] Error:`, err.message);
        return [];
    }
}

/**
 * Merge IPO list with Anchor data
 */
async function mergeData(ipoList, anchorData, year, existingCompanies = [], forceRefresh = false) {
    console.log(`[Merge] ${ipoList.length} IPOs, ${anchorData.length} anchors for ${year} (Force: ${forceRefresh})`);
    let matchCount = 0;

    const normalize = name => name.toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();

    const merged = ipoList.map(ipo => {
        const ipoKey = normalize(ipo.companyName);

        const anchor = anchorData.find(a => {
            const aKey = normalize(a.companyName);
            return ipoKey.includes(aKey) || aKey.includes(ipoKey);
        });

        if (anchor) {
            matchCount++;
            if (anchor.allotmentDate && !ipo.allotmentDate) {
                ipo.allotmentDate = anchor.allotmentDate;
            }
        }

        return {
            ...ipo,
            anchor30: anchor ? anchor.anchor30 : null,
            anchor90: anchor ? anchor.anchor90 : null,
            preIPO: calculatePreIPOLockin(
                ipo.allotmentDate ? (ipo.allotmentDate.adjusted || ipo.allotmentDate.original) : null,
                ipo.issueType
            )
        };
    });

    // Add anchor-only companies
    for (const anchor of anchorData) {
        const aKey = normalize(anchor.companyName);
        const exists = merged.some(m => {
            const mKey = normalize(m.companyName);
            return mKey.includes(aKey) || aKey.includes(mKey);
        });

        if (!exists) {
            merged.push({
                companyName: anchor.companyName,
                issueType: anchor.issueType || 'Mainboard',
                exchange: '',
                allotmentDate: anchor.allotmentDate,
                anchor30: anchor.anchor30,
                anchor90: anchor.anchor90,
                preIPO: calculatePreIPOLockin(
                    anchor.allotmentDate ? (anchor.allotmentDate.adjusted || anchor.allotmentDate.original) : null,
                    anchor.issueType || 'Mainboard'
                )
            });
        }
    }

    // Enrich upcoming IPOs with Anchor Investor names + Pre-IPO Investor names
    try {
        const { execSync } = require('child_process');

        const now = new Date();
        for (const ipo of merged) {
            const ipoDate = ipo.allotmentDate ? parseDate(ipo.allotmentDate.original) : null;
            const isUpcoming = !ipoDate || ipoDate > now;

            if (isUpcoming) {
                // Pre-fetch fast path cache
                const existingCompany = existingCompanies.find(c => c.companyName === ipo.companyName);

                // --- 1. Anchor Investors: scrape from Chittorgarh subscription page HTML ---
                const hasValidCache = existingCompany && existingCompany.anchorInvestors && existingCompany.anchorInvestors.length > 0 && (existingCompany.totalShares || 0) > 0;
                const hasEmptyCache = existingCompany && existingCompany.anchorInvestors && existingCompany.anchorInvestors.length === 0 && (existingCompany.totalShares || 0) > 0;
                
                // If it has a valid populated cache, use it always.
                // If it has an empty cache, only use it if we are NOT force-refreshing.
                if (hasValidCache || hasEmptyCache) {
                    ipo.anchorInvestors = existingCompany.anchorInvestors;
                    ipo.anchorShares = existingCompany.anchorShares || 0;
                    ipo.totalShares = existingCompany.totalShares || 0;
                } else if (ipo.chittorgarhUrl) {
                    try {
                        const anchorData = await fetchAnchorInvestorNames(ipo.chittorgarhUrl);
                        ipo.anchorInvestors = anchorData.investors;
                        ipo.anchorShares = anchorData.anchorShares;
                        ipo.totalShares = anchorData.totalShares;
                        console.log(`[Anchor] ${ipo.companyName}: ${ipo.anchorInvestors.length} investors, ${ipo.anchorShares} anchor shares, ${ipo.totalShares} total shares`);
                    } catch (e) {
                        console.warn(`[Anchor] Could not fetch for ${ipo.companyName}: ${e.message}`);
                        ipo.anchorInvestors = [];
                    }
                } else {
                    ipo.anchorInvestors = [];
                }

                // --- 2. Pre-IPO Investors: Async Extraction Delegate ---
                const hasValidNLPCache = existingCompany && existingCompany.preIpoInvestors && existingCompany.preIpoInvestors.length > 0;
                
                if (hasValidNLPCache) {
                    ipo.preIpoInvestors = existingCompany.preIpoInvestors;
                    ipo.rhpUrl = existingCompany.rhpUrl || '';
                    ipo.capitalStructureUrl = existingCompany.capitalStructureUrl || '';
                    ipo.preIpoWaca = existingCompany.preIpoWaca;
                    ipo.peerComparison = existingCompany.peerComparison;
                } else {
                    // Let background auto-healer extract from capital structure / RHP
                    ipo.preIpoInvestors = undefined;
                    ipo.rhpUrl = existingCompany ? (existingCompany.rhpUrl || '') : '';
                    ipo.capitalStructureUrl = existingCompany ? (existingCompany.capitalStructureUrl || '') : '';
                }
            }
        }
    } catch (e) {
        console.error("[NLP] Encountered error initializing enrichment", e);
    }


    console.log(`[Merge] Result: ${merged.length} total, ${matchCount} anchor matches`);
    return merged;
}

/**
 * Scrape the Chittorgarh subscription page to get per-IPO anchor investor names,
 * anchor share count, and total share count.
 * Converts /ipo/slug/id/ -> /ipo_subscription/slug/id/ and reads #anchorinvestorlist.
 * Returns { investors: string[], anchorShares: number, totalShares: number }
 */
async function fetchAnchorInvestorNames(chittorgarhUrl) {
    const empty = { investors: [], anchorShares: 0, totalShares: 0 };
    if (!chittorgarhUrl) return empty;

    const cleanNumber = (str) => {
        if (!str) return 0;
        const cleaned = str.replace(/,/g, '').replace(/[^0-9]/g, '');
        const n = parseInt(cleaned, 10);
        return isNaN(n) ? 0 : n;
    };

    let investors = [];
    let anchorShares = 0;
    let totalShares = 0;
    let marketMakerShares = 0;
    let qibExAnchorShares = 0;
    let niiShares = 0;
    let retailShares = 0;

    try {
        // 1. Fetch main IPO page for Total Issue Size
        try {
            const mainResp = await axios.get(chittorgarhUrl, { 
                headers: { ...HEADERS, 'Referer': 'https://www.chittorgarh.com/' }, 
                timeout: 15000 
            });
            const $main = cheerio.load(mainResp.data);

            $main('table tr').each((i, row) => {
                const cells = $main(row).find('td, th');
                if (cells.length >= 2) {
                    const label = $main(cells.eq(0)).text().trim().toLowerCase();
                    const val = $main(cells.eq(1)).text().trim();

                    if (label.includes('total issue size') && val.includes('shares')) {
                        const match = val.match(/([\d,]+)\s*shares/i);
                        if (match) totalShares = cleanNumber(match[1]);
                    }
                    if (label.includes('anchor investor') && (label.includes('−') || label.includes('-') || !label.includes('ex'))) {
                        const match = val.match(/([\d,]+)/);
                        if (match) anchorShares = cleanNumber(match[1]);
                    }
                    if (label.includes('market maker') && val.includes('shares')) {
                        const match = val.match(/([\d,]+)/);
                        if (match) marketMakerShares = cleanNumber(match[1]);
                    }
                }
            });
        } catch (e) {
            console.warn(`[Anchor Scraper] Main page parse error: ${e.message}`);
        }

        // 2. Fetch subscription page for anchor investors & breakdown
        const subUrl = chittorgarhUrl.replace('/ipo/', '/ipo_subscription/');
        const subResp = await axios.get(subUrl, {
            headers: { ...HEADERS, 'Referer': 'https://www.chittorgarh.com/' },
            timeout: 15000
        });
        const $ = cheerio.load(subResp.data);

        // Extract investor names from #anchorinvestorlist table or any table with Anchor headers
        $('table').each((i, t) => {
            const thText = $(t).text().toLowerCase();
            if (thText.includes('anchor') && (thText.includes('shares allotted') || thText.includes('group entity') || thText.includes('% allocated'))) {
                $(t).find('tr').each((j, row) => {
                    const cells = $(row).find('td');
                    if (cells.length >= 3) {
                        let investorName = $(cells.eq(1)).text().trim();
                        if (investorName.match(/^\d+$/)) {
                            investorName = $(cells.eq(2)).text().trim();
                        }
                        if (investorName && !investorName.match(/^(total|#|sr|s\.no|\d+$)/i) && investorName.length > 2) {
                            if (!investors.includes(investorName)) {
                                investors.push(investorName);
                            }
                        }
                    }
                });
            }
        });

        // Extract category-wise shares offered breakdown
        $('table').each((i, t) => {
            const tableText = $(t).text().toLowerCase();
            if (tableText.includes('category') && tableText.includes('shares offered') && (tableText.includes('size (%)') || tableText.includes('amt (₹ cr.)') || tableText.includes('retail'))) {
                $(t).find('tr').each((j, row) => {
                    const cells = $(row).find('td');
                    if (cells.length >= 2) {
                        const cat = $(cells.eq(0)).text().replace(/\u00a0/g, ' ').trim().toLowerCase();
                        const shares = cleanNumber($(cells.eq(1)).text());

                        if (cat === 'anchor' && shares > 0) anchorShares = shares;
                        if (cat === 'market maker' && shares > 0) marketMakerShares = shares;
                        if (cat.includes('qib (ex') && shares > 0) qibExAnchorShares = shares;
                        if (cat === 'nii' && shares > 0) niiShares = shares;
                        if (cat === 'retail' && shares > 0) retailShares = shares;
                        if (cat === 'total' && shares > 0 && shares > totalShares) {
                            totalShares = shares;
                        }
                    }
                });
            }
        });

        // 3. Fallback: Check component sums and ensure Total = Anchor + Public Components
        const sumComponents = qibExAnchorShares + niiShares + retailShares + marketMakerShares;
        if (sumComponents > 0 && anchorShares > 0) {
            const calculatedTotal = anchorShares + sumComponents;
            if (calculatedTotal > totalShares) {
                totalShares = calculatedTotal;
            }
        }

        if (totalShares < anchorShares) {
            totalShares = anchorShares + sumComponents;
        }

        return { investors, anchorShares, totalShares };
    } catch (e) {
        console.warn(`[Anchor] Error fetching subscription page: ${e.message}`);
        return empty;
    }
}


/**
 * Scrape a Chittorgarh IPO page to find the best direct RHP/DRHP PDF URL.
 * Prefers: bsesme.com DRHP PDF > bseindia.com RHP zip > chittorgarh.net anchor PDF
 */
async function fetchRHPUrl(chittorgarhUrl) {
    if (!chittorgarhUrl) return '';
    try {
        const resp = await axios.get(chittorgarhUrl, {
            headers: { ...HEADERS, 'Referer': 'https://www.chittorgarh.com/' },
            timeout: 15000
        });
        const $ = cheerio.load(resp.data);

        const candidates = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().toLowerCase().trim();
            if (!href) return;
            // Only consider direct PDF links (not zip, not relative)
            if (href.startsWith('http') && href.toLowerCase().endsWith('.pdf')) {
                const isPdf = href.toLowerCase().endsWith('.pdf');
                const isRHP = text.includes('rhp') || text.includes('red herring') || href.toLowerCase().includes('rhp');
                const isDRHP = text.includes('drhp') || href.toLowerCase().includes('drhp');
                const isBSESME = href.includes('bsesme.com');
                const isBSE = href.includes('bseindia.com');
                if (isPdf && (isRHP || isDRHP)) {
                    let basePriority = (isRHP && !isDRHP) ? 10 : 20; // Final RHP always beats DRHP
                    let domainPriority = isBSESME ? 1 : isBSE ? 2 : 3;
                    candidates.push({ href, priority: basePriority + domainPriority });
                }
            }
        });

        if (candidates.length === 0) return '';
        candidates.sort((a, b) => a.priority - b.priority);
        return candidates[0].href;
    } catch (e) {
        return '';
    }
}

function parseDate(dateStr) {
    if (!dateStr || dateStr === '--' || dateStr === '' || dateStr === '-') return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

module.exports = { scrapeWithBrowser };
