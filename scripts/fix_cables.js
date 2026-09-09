const fs = require('fs');
const db = require('../db');

const raw = db.readDB();
const companies = raw.companies || [];

// ==========================================
// 1. JD CABLES LTD.
// ==========================================
const jd = companies.find(x => x.companyName === 'JD Cables Ltd.' || x.companyName.toLowerCase().includes('jd cable'));

if (jd) {
    const jdLockIns = [
        {
            date: null,
            shares: 4533600,
            percentage: 20.10,
            label: "Not under lock-in"
        },
        {
            date: "2025-10-25",
            shares: 890400,
            percentage: 3.95,
            label: "Anchor Lock-in (30 Days)"
        },
        {
            date: "2025-12-24",
            shares: 890400,
            percentage: 3.95,
            label: "Anchor Lock-in (90 Days)"
        },
        {
            date: "2026-09-25",
            shares: 6104144,
            percentage: 27.07,
            label: "Pre-IPO Lock-in (1 Year)"
        },
        {
            date: "2027-09-25",
            shares: 5621545,
            percentage: 24.93,
            label: "2 Years Lock-in"
        },
        {
            date: "2028-09-25",
            shares: 4510223,
            percentage: 20.00,
            label: "Promoter Lock-in (3 Years)"
        }
    ];

    const jdPreIpo = [
        { name: "Venturex Fund I", shares: 85729, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Hemant Kumar Gupta", shares: 29790, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Ativir Financial Services Private Limited", shares: 26811, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Ankur Toshniwal", shares: 25487, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Aman Sanjeev Jain HUF", shares: 21184, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Vishal Narang", shares: 21184, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Finavenue Growth Fund", shares: 21184, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Paradise Moon Investment Fund-I", shares: 21184, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Nagori Ramiz Inusbhai", shares: 21184, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Navneet Makharia", shares: 21184, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Manvi Jain", shares: 16881, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Laxmi Randar", shares: 16881, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Ritesh Kailas Veera", shares: 12578, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Darshan H Ringshia", shares: 8275, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Ashok Kumar Pareek", shares: 8275, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Ajay Bhaskar", shares: 8275, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Sapna Bhansali", shares: 8275, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Rohit Agarwal", shares: 8275, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Adarsh Tibrewal", shares: 8275, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Armaan Sarawgi", shares: 8275, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Parmar Sanjay Amrutlal", shares: 6951, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Sarita Devi Pilania", shares: 5958, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Roshan Singhee", shares: 5958, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Rishi Kumar Gupta", shares: 3972, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Meenakshi", shares: 3972, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Rohit Sharma", shares: 3972, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Amit Agarwal", shares: 3972, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Nupur Kandoi", shares: 3972, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Vikas Kumar Agrawal HUF", shares: 3972, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Vikash Sharma", shares: 3972, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Anand Harlalka", shares: 1655, acquisitionPrice: 116.45, date: "2025-04-18", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Private Placement (Post-Bonus)" },
        { name: "Prakash Sahay", shares: 331, acquisitionPrice: 10.0, date: "2025-06-27", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Pre-IPO Subscription" },
        { name: "Rajesh Jhunjhunwala", shares: 331, acquisitionPrice: 10.0, date: "2025-06-27", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Pre-IPO Subscription" },
        { name: "Hemant Kumar Choradia", shares: 331, acquisitionPrice: 10.0, date: "2025-06-27", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Pre-IPO Subscription" },
        { name: "Satyajit Kumar Jha", shares: 331, acquisitionPrice: 10.0, date: "2025-06-27", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Pre-IPO Subscription" },
        { name: "Manoj Tiwari", shares: 331, acquisitionPrice: 10.0, date: "2025-06-27", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Pre-IPO Subscription" },
        { name: "Arumay Roy", shares: 331, acquisitionPrice: 10.0, date: "2025-06-27", lockInPeriod: "1 Year", lockInExpiry: "2026-09-25", type: "Pre-IPO Subscription" }
    ];

    const jdBseUrl = "https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250924-60&attachedId=bfdfc224-2762-4643-87cf-1b3f5543c0c6";

    jd.totalShares = 22551112;
    jd.circularUrl = jdBseUrl;
    jd.bseCircularUrl = jdBseUrl;
    jd.annexureUrl = jdBseUrl;
    jd.lockInEvents = jdLockIns;
    jd.preIpoInvestors = jdPreIpo;
    jd.preIpoWaca = 116.45;
    jd.waca = 116.45;
    jd.preIpoChecked = true;

    db.saveCircularData(jd.companyName, {
        found: true,
        source: "BSE",
        noticeId: "20250924-60",
        pdfUrl: jdBseUrl,
        annexureUrl: jdBseUrl,
        totalShares: 22551112,
        unlockEvents: jdLockIns,
        preIpoInvestors: jdPreIpo,
        preIpoWaca: 116.45,
        fetchedAt: new Date().toISOString()
    });
    console.log('Populated JD Cables Ltd.');
}

// ==========================================
// 2. PRIME CABLE INDUSTRIES LTD.
// ==========================================
const prime = companies.find(x => x.companyName === 'Prime Cable Industries Ltd.' || x.companyName.toLowerCase().includes('prime cable'));

if (prime) {
    const primePreIpo = [
        {
            name: "Vineet Gupta",
            shares: 182540,
            acquisitionPrice: 63.0,
            date: "2025-04-05",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-24",
            type: "Preferential Allotment"
        },
        {
            name: "Ruchi Gupta",
            shares: 182540,
            acquisitionPrice: 63.0,
            date: "2025-04-05",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-24",
            type: "Preferential Allotment"
        },
        {
            name: "Rahul Gupta HUF",
            shares: 182540,
            acquisitionPrice: 63.20,
            date: "2025-04-23",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-24",
            type: "Secondary Transfer"
        },
        {
            name: "Seema Gupta",
            shares: 182540,
            acquisitionPrice: 63.20,
            date: "2025-04-23",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-24",
            type: "Secondary Transfer"
        },
        {
            name: "Manish Taparia",
            shares: 91269,
            acquisitionPrice: 63.20,
            date: "2025-04-23",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-24",
            type: "Secondary Transfer"
        },
        {
            name: "Vandana Taparia",
            shares: 91269,
            acquisitionPrice: 63.20,
            date: "2025-04-23",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-24",
            type: "Secondary Transfer"
        }
    ];

    prime.preIpoInvestors = primePreIpo;
    prime.preIpoWaca = 63.15;
    prime.waca = 63.15;
    prime.preIpoChecked = true;

    const existingCirc = db.getCircularData(prime.companyName) || {};
    db.saveCircularData(prime.companyName, {
        ...existingCirc,
        found: true,
        source: "NSE",
        noticeId: "NSE/CML/70463",
        pdfUrl: prime.circularUrl || "https://nsearchives.nseindia.com/content/circulars/CML70463.zip",
        totalShares: 18333225,
        unlockEvents: prime.lockInEvents,
        preIpoInvestors: primePreIpo,
        preIpoWaca: 63.15,
        fetchedAt: new Date().toISOString()
    });
    console.log('Populated Prime Cable Industries Ltd.');
}

db.writeDB(raw);
console.log('All updates written to DB successfully!');
