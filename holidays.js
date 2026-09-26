/**
 * NSE & BSE Holiday List for 2025 and 2026
 * Sources: 
 * https://www.nseindia.com/resources/exchange-communication-holidays
 * https://www.bseindia.com/static/about/holiday_calendar.aspx
 */

// Holidays for 2025
const holidays2025 = [
    '2025-01-26', // Republic Day
    '2025-02-26', // Mahashivratri
    '2025-03-14', // Holi
    '2025-03-31', // Id-Ul-Fitr (Ramzan Id)
    '2025-04-06', // Ram Navami
    '2025-04-10', // Mahavir Jayanti
    '2025-04-14', // Dr. Baba Saheb Ambedkar Jayanti
    '2025-04-18', // Good Friday
    '2025-05-01', // Maharashtra Day
    '2025-06-07', // Bakri Id
    '2025-08-15', // Independence Day
    '2025-08-16', // Parsi New Year
    '2025-08-27', // Ganesh Chaturthi
    '2025-10-02', // Mahatma Gandhi Jayanti
    '2025-10-21', // Diwali Laxmi Pujan
    '2025-10-22', // Diwali Balipratipada
    '2025-11-05', // Gurunanak Jayanti
    '2025-12-25'  // Christmas
];

// Holidays for 2026 (Projected based on standard calendar)
const holidays2026 = [
    '2026-01-26', // Republic Day
    '2026-02-16', // Mahashivratri
    '2026-03-03', // Holi
    '2026-03-20', // Id-Ul-Fitr
    '2026-03-27', // Ram Navami
    '2026-03-31', // Mahavir Jayanti
    '2026-04-03', // Good Friday
    '2026-04-14', // Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-27', // Bakri Id
    '2026-08-15', // Independence Day
    '2026-08-25', // Parsi New Year (approx)
    '2026-09-14', // Ganesh Chaturthi
    '2026-10-02', // Gandhi Jayanti
    '2026-10-20', // Dussehra
    '2026-11-08', // Diwali
    '2026-11-09', // Diwali Balipratipada
    '2026-11-24', // Gurunanak Jayanti
    '2026-12-25'  // Christmas
];

const allHolidays = new Set([...holidays2025, ...holidays2026]);

/**
 * Convert any date input (ISO string, Date object, or date string) to IST YYYY-MM-DD
 * @param {Date|string} dateInput 
 * @returns {string|null}
 */
function toISTDateString(dateInput) {
    if (!dateInput) return null;
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

/**
 * Parse an IST YYYY-MM-DD string into a clean UTC-noon Date object for safe arithmetic
 * @param {Date|string} dateInput 
 * @returns {Date|null}
 */
function parseDateClean(dateInput) {
    if (!dateInput) return null;
    const istStr = toISTDateString(dateInput);
    if (!istStr) return null;
    const parts = istStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
}

/**
 * Format a Date object to YYYY-MM-DD
 * @param {Date} d 
 * @returns {string|null}
 */
function formatYYYYMMDD(d) {
    if (!d || isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
}

/**
 * Check if a date is a weekend (Sat/Sun) or an NSE/BSE market holiday
 * @param {Date|string} dateInput 
 * @returns {boolean}
 */
function isHoliday(dateInput) {
    const d = parseDateClean(dateInput);
    if (!d) return false;
    const day = d.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // Check for Weekend
    if (day === 0 || day === 6) return true;

    // Check for NSE/BSE Holiday (YYYY-MM-DD)
    const dateString = formatYYYYMMDD(d);
    return allHolidays.has(dateString);
}

/**
 * Get the next valid business/trading day
 * If the date falls on a weekend or holiday, it moves forward to next working day
 * @param {Date|string} inputDate
 * @returns {Date}
 */
function getNextBusinessDay(inputDate) {
    let date = parseDateClean(inputDate);
    if (!date) return null;

    let safetyCounter = 0;
    while (isHoliday(date) && safetyCounter < 365) {
        date.setUTCDate(date.getUTCDate() + 1);
        safetyCounter++;
    }

    return date;
}

/**
 * Calculate Pre-IPO lock-in expiry dates
 * SME IPO: 1 year from allotment
 * Mainboard IPO: 6 months from allotment
 * 
 * @param {string} allotmentDateStr - "Jan 23, 2026" or similar format
 * @param {string} issueType - "SME IPO" or "Mainboard IPO"
 * @returns {Object} { expiryDate: Date, originalDate: Date, adjusted: boolean }
 */
function calculatePreIPOLockin(allotmentDateStr, issueType) {
    if (!allotmentDateStr) return null;

    const baseDate = parseDateClean(allotmentDateStr);
    if (!baseDate) return null;

    let expiryDate = new Date(baseDate);
    const isSME = issueType && issueType.toLowerCase().includes('sme');

    // Add duration based on IPO type
    if (isSME) {
        // 1 Year for SME
        expiryDate.setUTCFullYear(expiryDate.getUTCFullYear() + 1);
    } else {
        // 6 Months for Mainboard
        expiryDate.setUTCMonth(expiryDate.getUTCMonth() + 6);
    }

    const originalDate = new Date(expiryDate);
    const adjustedDate = getNextBusinessDay(expiryDate);

    // Check if date was adjusted
    const isAdjusted = formatYYYYMMDD(originalDate) !== formatYYYYMMDD(adjustedDate);

    return {
        expiryDate: adjustedDate,
        originalDate: originalDate,
        isAdjusted: isAdjusted,
        type: isSME ? 'SME Pre-IPO (1 Yr)' : 'Mainboard Pre-IPO (6 Mo)'
    };
}

/**
 * Get the N-th trading day starting from a given date.
 * Listing Day is Day 1 (if listing falls on weekend/holiday, starts on next trading day).
 * Counts only valid trading days, skipping weekends & holidays.
 * @param {Date|string} startDateStr 
 * @param {number} numTradingDays - default 10
 * @returns {Date|null}
 */
function getTradingDayOffset(startDateStr, numTradingDays = 10) {
    if (!startDateStr) return null;
    let curr = parseDateClean(startDateStr);
    if (!curr) return null;

    // Ensure start day is a business day (if listed on holiday/weekend, start on next trading day)
    while (isHoliday(curr)) {
        curr.setUTCDate(curr.getUTCDate() + 1);
    }

    let count = 1;
    while (count < numTradingDays) {
        curr.setUTCDate(curr.getUTCDate() + 1);
        if (!isHoliday(curr)) {
            count++;
        }
    }
    return curr;
}

/**
 * Calculate how many trading days have passed as of a given target date
 * @param {Date|string} startDateStr 
 * @param {Date|string} asOfDateStr 
 * @returns {number}
 */
function getTradingDaysPassed(startDateStr, asOfDateStr = new Date()) {
    if (!startDateStr) return 0;
    let curr = parseDateClean(startDateStr);
    const target = parseDateClean(asOfDateStr);
    if (!curr || !target) return 0;

    // Adjust start date to valid trading day
    while (isHoliday(curr)) {
        curr.setUTCDate(curr.getUTCDate() + 1);
    }

    // If listing date is in the future
    if (curr > target) return 0;

    let count = 0;
    let iter = new Date(curr);
    while (iter <= target) {
        if (!isHoliday(iter)) {
            count++;
        }
        iter.setUTCDate(iter.getUTCDate() + 1);
    }
    return count;
}

/**
 * Get the very next trading day (working day) after a given date.
 * Strictly skips weekends and market holidays.
 * If input date falls on Friday, returns Monday (or next working day).
 * If 10th day is on weekend or holiday, moves to next working day.
 * @param {Date|string} dateInput 
 * @returns {Date}
 */
function getNextTradingDay(dateInput) {
    let date = parseDateClean(dateInput);
    if (!date) return null;

    date.setUTCDate(date.getUTCDate() + 1);
    while (isHoliday(date)) {
        date.setUTCDate(date.getUTCDate() + 1);
    }
    return date;
}

/**
 * Process a list of companies to find all IPOs in their 10 trading days window.
 * Significance: On completion of Day 10, circuit filter relaxes to 20% on the Next Trading/Working Day (Day 11).
 * If the 10th day falls before a weekend or market holiday, the 20% circuit filter day is adjusted
 * to the immediately following working day.
 * Excludes companies that have already completed 10 trading days.
 * 
 * @param {Array} companiesList 
 * @param {Date|string} asOfDate 
 * @returns {Array}
 */
function getCircuitFilterIpos(companiesList = [], asOfDate = new Date()) {
    const todayClean = parseDateClean(asOfDate) || parseDateClean(new Date());
    const todayStr = formatYYYYMMDD(todayClean);
    const results = [];

    for (const c of companiesList) {
        if (!c || !c.listingDate) continue;
        const lDateClean = parseDateClean(c.listingDate);
        if (!lDateClean) continue;

        const listingDateStr = formatYYYYMMDD(lDateClean);

        // Day 10 (10th Trading Day)
        const day10 = getTradingDayOffset(listingDateStr, 10);
        if (!day10) continue;

        // Day 11 (20% Circuit Effective Day - strictly next working trading day)
        const day11 = getNextTradingDay(day10);
        if (!day11) continue;

        const tenthTradingDayStr = formatYYYYMMDD(day10);
        const circuit20DateStr = formatYYYYMMDD(day11);

        const daysCompleted = getTradingDaysPassed(listingDateStr, todayClean);

        // Exclude companies that have already completed 10 trading days
        if (daysCompleted >= 10) continue;

        const daysRemaining = Math.max(0, 10 - daysCompleted);
        const isUpcomingListing = daysCompleted === 0 && lDateClean > todayClean;
        const isTodayDay10 = daysCompleted === 10 || (daysRemaining === 1 && todayStr === tenthTradingDayStr);

        results.push({
            companyName: c.companyName || c.name,
            issueType: c.issueType || 'Mainboard',
            exchange: c.exchange || (c.issueType === 'SME' ? 'BSE SME' : 'BSE, NSE'),
            listingDate: listingDateStr,
            tenthTradingDay: tenthTradingDayStr,
            circuit20Date: circuit20DateStr,
            daysCompleted,
            daysRemaining,
            isUpcomingListing,
            isTodayDay10,
            status: isUpcomingListing ? 'Upcoming Listing' : `Day ${daysCompleted} of 10`,
            progressPct: Math.min(100, Math.round((daysCompleted / 10) * 100)),
            issuePrice: c.issuePrice || null,
            cmp: c.cmp || c.currentPrice || c.issuePrice || null,
            lotSize: c.lotSize || null,
            totalShares: c.totalShares || null,
            chittorgarhUrl: c.chittorgarhUrl || null,
            rhpUrl: c.rhpUrl || null,
            capitalStructureUrl: c.capitalStructureUrl || null
        });
    }

    // Sort by circuit20Date ascending (companies flipping to 20% soonest first)
    results.sort((a, b) => new Date(a.circuit20Date) - new Date(b.circuit20Date));
    return results;
}

module.exports = {
    toISTDateString,
    parseDateClean,
    formatYYYYMMDD,
    isHoliday,
    getNextBusinessDay,
    getTradingDayOffset,
    getTradingDaysPassed,
    getNextTradingDay,
    calculatePreIPOLockin,
    getCircuitFilterIpos,
    holidays: allHolidays
};

