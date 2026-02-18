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
async function scrapeWithBrowser(year) {
    try {
        console.log(`[API Scraper] Starting for year ${year}...`);

        const [ipoList, anchorData] = await Promise.all([
            fetchIPOList(year),
            fetchAnchorData(year)
        ]);

        const merged = mergeData(ipoList, anchorData, year);
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
            let companyName = $('a').text().trim() || rawName.replace(/<[^>]+>/g, '').trim();
            companyName = companyName.replace(/\s+IPO\s*$/i, '').trim();

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

            processed.push({
                companyName,
                issueType,
                exchange,
                allotmentDate
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
            let companyName = $('a').text().trim() || rawName.replace(/<[^>]+>/g, '').trim();
            companyName = companyName.replace(/\s+IPO\s*$/i, '').trim();

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
function mergeData(ipoList, anchorData, year) {
    console.log(`[Merge] ${ipoList.length} IPOs, ${anchorData.length} anchors for ${year}`);
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
            if (anchor.allotmentDate) {
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

    console.log(`[Merge] Result: ${merged.length} total, ${matchCount} anchor matches`);
    return merged;
}

function parseDate(dateStr) {
    if (!dateStr || dateStr === '--' || dateStr === '' || dateStr === '-') return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

module.exports = { scrapeWithBrowser };
