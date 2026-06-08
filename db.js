const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'unlock-data.json');

const PRE_IPO_OVERRIDES = {
    'Genxai Analytics Ltd.': {
        preIpoWaca: 70.40,
        preIpoInvestors: [
            'Aadishakti Steels (₹70.40)',
            'Anshu Gupta (₹70.40)',
            'Garv Agarwal (₹70.40)',
            'Sunita Agrawal (₹70.40)',
            'SP Holdings (₹70.40)',
            'Abhishek Tibrewal HUF (₹70.40)',
            'Mridul Agarwal (₹70.40)',
            'Nidhi Aggarwal (₹70.40)',
            'Saloni Ramratan Chirania (₹70.40)',
            'Nitesh Agarwal (₹70.40)',
            'Poonam Sunil Bagaria (₹70.40)',
            'Sandeep Mandawewala (₹70.40)',
            'Accufolio Risers LLP (₹70.40)',
            'YBRA Ventures LLP (₹70.40)',
            'Shaily Dinesh Jain (₹70.40)',
            'Shriram Chandak (₹70.40)',
            'Sunil Kumar Khandal (₹70.40)',
            'Seema Sharma (₹70.40)',
            'Sunil Kumar Khandal HUF (₹70.40)',
            'Sushila Sharma (₹70.40)',
            'Rakesh Khandelwal (₹70.40)',
            'Namrta Arora (₹70.40)'
        ]
    },
    'Horizon Reclaim (India) Ltd.': {
        preIpoWaca: 103.00,
        preIpoInvestors: [
            'Gracious Advisors LLP (₹103.00)',
            'Yogesh Chaudhary (₹103.00)'
        ]
    },
    'Vahh Chemicals Ltd.': {
        preIpoWaca: 6.06,
        preIpoInvestors: [
            'Aayush Hiren Desai (₹6.06)',
            'Ruchik Kirtikumar Mehta (₹6.06)',
            'Hiren Indravadan Desai (₹6.06)',
            'Hetal Hirenbhai Desai (₹6.06)',
            'Gita Mukeshkumar Mehta (₹6.06)',
            'Mukeshkumar Rameshchandra Mehta (₹6.06)',
            'Vishnudatt Vidhyasagar Tiwari (₹6.06)',
            'Cravexnuts Foods LLP (₹6.06)',
            'HSHS Nutraceuticals Limited (₹6.06)',
            'Vedant Nutraceuticals Limited (₹6.06)'
        ]
    },
    'Hexagon Nutrition Ltd.': {
        preIpoWaca: 20.00,
        preIpoInvestors: [
            'Tata Capital Financial Services Limited (₹20.00)',
            'Investcorp PE Fund II (₹20.00)',
            'Malabar India Fund Limited (₹20.00)',
            'Malabar Value Fund (₹20.00)',
            'Ohm Capital (₹20.00)'
        ]
    }
};

function applyPreIpoOverrides(companies) {
    if (!companies) return;
    for (const c of companies) {
        if (PRE_IPO_OVERRIDES[c.companyName]) {
            c.preIpoInvestors = PRE_IPO_OVERRIDES[c.companyName].preIpoInvestors;
            c.preIpoWaca = PRE_IPO_OVERRIDES[c.companyName].preIpoWaca;
        }
    }
}

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
            const companies = data.companies || [];
            applyPreIpoOverrides(companies);
            return {
                companies: companies,
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
    applyPreIpoOverrides(data.companies);
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
            if (company.issuePrice !== undefined && company.issuePrice !== null) existing.issuePrice = company.issuePrice;
            
            // Preserve dynamically fetched deep arrays (Anchors + Pre-IPO NLP extractions)
            if (company.anchorInvestors !== undefined) existing.anchorInvestors = company.anchorInvestors;
            if (company.anchorShares !== undefined) existing.anchorShares = company.anchorShares;
            if (company.totalShares !== undefined) existing.totalShares = company.totalShares;
            if (company.preIpoInvestors !== undefined) existing.preIpoInvestors = company.preIpoInvestors;
            
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
