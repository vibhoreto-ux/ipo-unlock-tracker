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
 * Check if a date is a weekend (Sat/Sun) or a market holiday
 * @param {Date} date 
 * @returns {boolean}
 */
function isHoliday(date) {
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday

    // Check for Weekend
    if (day === 0 || day === 6) return true;

    // Check for NSE/BSE Holiday
    const dateString = date.toISOString().split('T')[0];
    return allHolidays.has(dateString);
}

/**
 * Get the next valid business day
 * If the date falls on a weekend or holiday, it moves forward
 * @param {Date|string} inputDate
 * @returns {Date}
 */
function getNextBusinessDay(inputDate) {
    let date = new Date(inputDate);

    // Validate date
    if (isNaN(date.getTime())) return null;

    // Limit infinite loop safety (max 365 days lookahead)
    let safetyCounter = 0;

    // While it is a holiday, move to next day
    while (isHoliday(date) && safetyCounter < 365) {
        date.setDate(date.getDate() + 1);
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

    const allotmentDate = new Date(allotmentDateStr);
    if (isNaN(allotmentDate.getTime())) return null;

    let expiryDate = new Date(allotmentDate);
    const isSME = issueType && issueType.toLowerCase().includes('sme');

    // Add duration based on IPO type
    if (isSME) {
        // 1 Year for SME
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
        // 6 Months for Mainboard
        expiryDate.setMonth(expiryDate.getMonth() + 6);
    }

    const originalDate = new Date(expiryDate);
    const adjustedDate = getNextBusinessDay(expiryDate);

    // Check if date was adjusted
    const isAdjusted = originalDate.getTime() !== adjustedDate.getTime();

    return {
        expiryDate: adjustedDate,
        originalDate: originalDate,
        isAdjusted: isAdjusted,
        type: isSME ? 'SME Pre-IPO (1 Yr)' : 'Mainboard Pre-IPO (6 Mo)'
    };
}

module.exports = {
    isHoliday,
    getNextBusinessDay,
    calculatePreIPOLockin,
    holidays: allHolidays
};
