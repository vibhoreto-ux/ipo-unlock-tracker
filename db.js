const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'unlock-data.json');

/**
 * Ensure the data directory exists
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Read the local database
 * @returns {{ companies: Array, lastUpdated: string|null, lastScraped: Object }}
 */
function readDB() {
    ensureDataDir();
    try {
        if (fs.existsSync(DB_PATH)) {
            const raw = fs.readFileSync(DB_PATH, 'utf-8');
            const data = JSON.parse(raw);
            return {
                companies: data.companies || [],
                lastUpdated: data.lastUpdated || null,
                lastScraped: data.lastScraped || {},
                circularData: data.circularData || {}
            };
        }
    } catch (err) {
        console.error('Error reading DB:', err.message);
    }
    return { companies: [], lastUpdated: null, lastScraped: {}, circularData: {} };
}

/**
 * Write data to the local database
 * @param {{ companies: Array, lastUpdated: string, lastScraped: Object }} data
 */
function writeDB(data) {
    ensureDataDir();
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(DB_PATH, json, 'utf-8');
    console.log(`DB saved: ${data.companies.length} companies (${(json.length / 1024).toFixed(1)} KB)`);
}

/**
 * Merge new scraped companies into existing DB data.
 * - Deduplicates by companyName
 * - Updates existing records with new data if fields are present
 * - Adds new companies
 * 
 * @param {Array} existing - Current DB companies
 * @param {Array} incoming - Newly scraped companies
 * @returns {Array} Merged company list
 */
function mergeCompanies(existing, incoming) {
    // Build a map from existing data using normalized names
    const map = new Map();

    for (const company of existing) {
        const key = normalizeKey(company.companyName);
        map.set(key, { ...company });
    }

    let newCount = 0;
    let updateCount = 0;

    for (const company of incoming) {
        const key = normalizeKey(company.companyName);

        if (map.has(key)) {
            // Merge: update fields if the incoming data has them
            const existing = map.get(key);
            if (company.anchor30) existing.anchor30 = company.anchor30;
            if (company.anchor90) existing.anchor90 = company.anchor90;
            if (company.preIPO) existing.preIPO = company.preIPO;
            if (company.allotmentDate) existing.allotmentDate = company.allotmentDate;
            if (company.issueType) existing.issueType = company.issueType;
            if (company.exchange) existing.exchange = company.exchange;
            if (company.chittorgarhUrl) existing.chittorgarhUrl = company.chittorgarhUrl;
            if (company.rhpUrl) existing.rhpUrl = company.rhpUrl;
            map.set(key, existing);
            updateCount++;
        } else {
            // New company
            map.set(key, { ...company });
            newCount++;
        }
    }

    console.log(`Merge: ${newCount} new, ${updateCount} updated, ${map.size} total`);
    return Array.from(map.values());
}

/**
 * Normalize a company name for deduplication
 */
function normalizeKey(name) {
    return name
        .toLowerCase()
        .replace(/ ltd\.?| limited| india| private| pvt\.?| inc\.?/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Get cached circular data for a company
 * @param {string} companyName
 * @returns {Object|null}
 */
function getCircularData(companyName) {
    const db = readDB();
    return db.circularData[companyName] || null;
}

/**
 * Save circular data for a company to DB
 * @param {string} companyName
 * @param {Object} data - The circular response data
 */
function saveCircularData(companyName, data) {
    const db = readDB();
    db.circularData[companyName] = data;

    // --- Update Pre-IPO Date from Annexure ---
    if (data && data.found && data.unlockEvents && data.unlockEvents.length > 0) {
        const company = db.companies.find(c => c.companyName === companyName);
        if (company && company.allotmentDate) {
            const isSME = company.issueType && company.issueType.toLowerCase().includes('sme');
            const targetMonths = isSME ? 12 : 6;

            const listingDateSrc = company.allotmentDate.adjusted || company.allotmentDate.original;
            if (listingDateSrc) {
                const listingDate = new Date(listingDateSrc);
                const targetDate = new Date(listingDate);
                targetDate.setMonth(targetDate.getMonth() + targetMonths);

                let closestEvent = null;
                let minDiff = Infinity;

                for (const event of data.unlockEvents) {
                    if (!event.date) continue;
                    const eventDate = new Date(event.date);
                    const diffDays = Math.abs((eventDate - targetDate) / (1000 * 60 * 60 * 24));

                    if (diffDays < minDiff) {
                        minDiff = diffDays;
                        closestEvent = event;
                    }
                }

                // Allow up to 90 days variance because lock-in calculations can drift significantly from raw allotment dates depending on allotment rules
                if (closestEvent && minDiff <= 90) {
                    if (!company.preIPO) {
                        company.preIPO = {};
                    }
                    company.preIPO.expiryDate = closestEvent.date;
                    company.preIPO.isAdjusted = true;
                    if (!company.preIPO.type) {
                        company.preIPO.type = `${isSME ? 'SME' : 'Mainboard'} Pre-IPO`;
                    }
                }
            }
        }
    }

    writeDB(db);
}

module.exports = { readDB, writeDB, mergeCompanies, getCircularData, saveCircularData };
