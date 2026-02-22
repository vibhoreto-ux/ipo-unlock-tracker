const axios = require('axios');
const cheerio = require('cheerio');
const { getNextBusinessDay, calculatePreIPOLockin } = require('./holidays');

const ANCHOR_URL = 'https://www.chittorgarh.com/report/anchor-investor-lock-in-end-dates/156/all/';
const IPO_LIST_URL = 'https://www.chittorgarh.com/report/ipo-in-india-list-main-board-sme/82/all/';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
};

/**
 * Main function to scrape and merge IPO unlock data
 */
async function scrapeUnlockData(year) {
    try {
        console.log(`Starting scrape for year ${year}...`);

        // Run scrapes in parallel
        const [anchorData, ipoList] = await Promise.all([
            scrapeAnchorData(year),
            scrapeIPOList(year)
        ]);

        // Merge Data
        const merged = mergeData(ipoList, anchorData, year);

        return merged;

    } catch (error) {
        console.error(`Error in scrapeUnlockData for ${year}:`, error.message);
        return [];
    }
}

/**
 * Merge IPO List with Anchor Data
 */
function mergeData(ipoList, anchorData, year) {
    console.log(`Merge Data: ${ipoList.length} IPOs found, ${anchorData.length} Anchor records found.`);
    let matchCount = 0;

    const mergedData = ipoList.map(ipo => {
        // Normalize names for matching
        const ipoNameSimple = ipo.companyName.toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();

        const anchorMatch = anchorData.find(a => {
            const anchorNameSimple = a.companyName.toLowerCase().replace(/ ltd\.?| limited| india| private/g, '').trim();
            return ipoNameSimple.includes(anchorNameSimple) || anchorNameSimple.includes(ipoNameSimple);
        });

        if (anchorMatch) {
            matchCount++;
        }

        return {
            ...ipo,
            anchor30: anchorMatch ? anchorMatch.anchor30 : null,
            anchor90: anchorMatch ? anchorMatch.anchor90 : null,
            preIPO: calculatePreIPOLockin(
                ipo.allotmentDate ? (ipo.allotmentDate.adjusted || ipo.allotmentDate.original) : null,
                ipo.issueType
            )
        };
    });

    console.log(`Merged ${mergedData.length} total records for ${year}. Matched ${matchCount} anchors.`);
    return mergedData;
}

/**
 * Fetch HTML page using axios
 */
async function fetchPage(url) {
    try {
        const response = await axios.get(url, {
            headers: HEADERS,
            timeout: 30000
        });
        return response.data;
    } catch (err) {
        console.error(`Fetch error for ${url}:`, err.message);
        return null;
    }
}

/**
 * Scrape the Main IPO List to get ALL companies (using axios + cheerio)
 */
async function scrapeIPOList(year) {
    try {
        const url = `${IPO_LIST_URL}?year=${year}`;
        console.log(`Scraping IPO List: ${url}`);

        const html = await fetchPage(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const results = [];
        const seenCompanies = new Set();

        // Find the main data table
        let table = $('table.data-table');
        if (!table.length) table = $('table').first();

        if (!table.length) {
            console.log('No table found on IPO List page');
            return [];
        }

        // Iterate rows in the table body
        table.find('tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length < 7) return;

            // Col 0: Company Name
            const nameLink = $(tds[0]).find('a');
            let companyName = nameLink.length > 0 ? nameLink.text().trim() : $(tds[0]).text().trim();
            companyName = companyName.replace(' IPO', '').trim();

            if (!companyName) return;
            if (seenCompanies.has(companyName)) return;
            seenCompanies.add(companyName);

            // Col 3: Listing Date  (column depends on table layout — check actual text)
            const listingDateStr = $(tds[3]).text().trim();

            // Col 6: Listing At (NSE SME, BSE SME, etc.)
            const listingAt = $(tds[6]).text().trim();
            const issueType = (listingAt.includes('SME')) ? 'SME' : 'Mainboard';

            // Col 1: Close Date (fallback)
            const closeDateStr = $(tds[1]).text().trim();
            const closeDate = parseDate(closeDateStr);
            const listingDate = parseDate(listingDateStr); // defined above

            // Prefer Listing Date, else Close Date
            const date = listingDate || closeDate;

            let finalDateObj = null;

            if (date) {
                const finalDate = getNextBusinessDay(date);
                finalDateObj = {
                    original: date.toISOString(),
                    adjusted: finalDate.toISOString(),
                    isAdjusted: date.getTime() !== finalDate.getTime()
                };
            }

            results.push({
                companyName,
                issueType,
                exchange: listingAt,
                allotmentDate: finalDateObj
            });
        });

        console.log(`Scraped ${results.length} items from IPO List (page 1 SSR).`);
        return results;

    } catch (e) {
        console.error('Error scraping IPO List:', e.message);
        return [];
    }
}

/**
 * Scrape Anchor Investor Lock-in Dates (using axios + cheerio)
 */
async function scrapeAnchorData(year) {
    try {
        const url = `${ANCHOR_URL}?year=${year}`;
        console.log(`Scraping Anchor Data: ${url}`);

        const html = await fetchPage(url);
        if (!html) return [];

        const $ = cheerio.load(html);
        const results = [];

        // Find the report table
        let table = $('#report_table');
        if (!table.length) table = $('table.data-table');
        if (!table.length) table = $('table').first();

        if (!table.length) {
            console.log('No table found on Anchor page');
            return [];
        }

        // Iterate rows
        table.find('tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length < 8) return;

            // Col 0: Company Name
            const nameLink = $(tds[0]).find('a');
            let companyName = nameLink.length > 0 ? nameLink.text().trim() : $(tds[0]).text().trim();
            companyName = companyName.replace(' IPO', '').trim();

            if (!companyName) return;

            // Col 6: 30 Days (50%)
            const date30Str = $(tds[6]).text().trim();
            // Col 7: 90 Days (Remaining)
            const date90Str = $(tds[7]).text().trim();

            const date30 = parseDate(date30Str);
            const date90 = parseDate(date90Str);

            const final30 = date30 ? getNextBusinessDay(date30) : null;
            const final90 = date90 ? getNextBusinessDay(date90) : null;

            results.push({
                companyName,
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
            });
        });

        console.log(`Scraped ${results.length} items from Anchor Report (SSR page).`);
        return results;

    } catch (e) {
        console.error('Error scraping Anchor Data:', e.message);
        return [];
    }
}

function parseDate(dateStr) {
    if (!dateStr || dateStr === '--' || dateStr === '') return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

module.exports = { scrapeUnlockData };
