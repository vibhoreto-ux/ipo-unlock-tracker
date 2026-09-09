const fs = require('fs');
const db = require('../db');

const raw = db.readDB();
const companies = raw.companies || [];

const c = companies.find(x => x.companyName === 'Taurian MPS Ltd.' || x.companyName.toLowerCase().includes('taurian'));

if (!c) {
    console.error('Taurian MPS Ltd. not found in DB!');
    process.exit(1);
}

const lockInEvents = [
    {
        date: null,
        shares: 1832000,
        percentage: 20.6,
        label: "Not under lock-in"
    },
    {
        date: "2025-10-11",
        shares: 325600,
        percentage: 3.7,
        label: "Anchor Lock-in (30 Days)"
    },
    {
        date: "2025-12-10",
        shares: 329600,
        percentage: 3.7,
        label: "Anchor Lock-in (90 Days)"
    },
    {
        date: "2026-09-12",
        shares: 2673564,
        percentage: 30.1,
        label: "Pre-IPO Lock-in (1 Year)"
    },
    {
        date: "2027-09-12",
        shares: 1944908,
        percentage: 21.9,
        label: "2 Years Lock-in"
    },
    {
        date: "2028-09-12",
        shares: 1777528,
        percentage: 20.0,
        label: "Promoter Lock-in (3 Years)"
    }
];

const preIpoInvestors = [
    {
        name: "India Inflection Opportunity Trust – India Inflection Opportunity Fund",
        shares: 144000,
        acquisitionPrice: 139.0,
        date: "2024-08-02",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Praveen Nagda",
        shares: 67428,
        acquisitionPrice: 140.0,
        date: "2024-05-24",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Secondary Transfer"
    },
    {
        name: "Rainbow Commodity & Derivatives Private Limited",
        shares: 57600,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Danush Tradelink Private Limited",
        shares: 36000,
        acquisitionPrice: 139.0,
        date: "2024-08-14",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Kamala Kumari",
        shares: 36000,
        acquisitionPrice: 139.0,
        date: "2024-07-30",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Abhay Adukia",
        shares: 25000,
        acquisitionPrice: 132.0,
        date: "2024-06-25",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Secondary Transfer"
    },
    {
        name: "Shachee Shah",
        shares: 20000,
        acquisitionPrice: 140.0,
        date: "2024-06-25",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Secondary Transfer"
    },
    {
        name: "Vivek Kumar Bhauka",
        shares: 18000,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Vinod Prabhudayal Modi",
        shares: 15000,
        acquisitionPrice: 100.0,
        date: "2024-05-22",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Secondary Transfer"
    },
    {
        name: "Ankita Rathi",
        shares: 14400,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Gajanand Shankarlal Lohia",
        shares: 14400,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Pushpraj Badarilal Lohia",
        shares: 14400,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Rashid Zain Ali Sabir",
        shares: 10429,
        acquisitionPrice: 139.99,
        date: "2024-07-08",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Secondary Transfer"
    },
    {
        name: "Siddharth Seth",
        shares: 10429,
        acquisitionPrice: 139.99,
        date: "2024-07-10",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Secondary Transfer"
    },
    {
        name: "Arth Polyyarn Private Limited",
        shares: 9000,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Vikashkumar C Jain",
        shares: 9000,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Shweta Hirawat",
        shares: 8300,
        acquisitionPrice: 85.0,
        date: "2024-05-22",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Secondary Transfer"
    },
    {
        name: "Rajendra Bhutra",
        shares: 7200,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Aditya Bhutra",
        shares: 7200,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Harshit Rathi HUF",
        shares: 7200,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Lata Kasat",
        shares: 7200,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Durga Devi Soni",
        shares: 7200,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Mohit Mall",
        shares: 7200,
        acquisitionPrice: 139.0,
        date: "2024-07-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Private Placement Allotment"
    },
    {
        name: "Pranav Hirawat",
        shares: 6700,
        acquisitionPrice: 85.0,
        date: "2024-05-22",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Secondary Transfer"
    },
    {
        name: "Nishil Seth",
        shares: 5000,
        acquisitionPrice: 100.0,
        date: "2024-05-22",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-12",
        type: "Secondary Transfer"
    }
];

const nsePdfUrl = "https://nsearchives.nseindia.com/content/circulars/CML70199.zip";
const rhpUrl = "https://nsearchives.nseindia.com/content/ipo/RHP_TAURIAN.zip";

c.totalShares = 8883200;
c.circularUrl = nsePdfUrl;
c.nseCircularUrl = nsePdfUrl;
c.rhpUrl = rhpUrl;
c.lockInEvents = lockInEvents;
c.preIpoInvestors = preIpoInvestors;
c.preIpoWaca = 139.05;
c.waca = 139.05;
c.preIpoChecked = true;

const circPayload = {
    found: true,
    source: "NSE",
    noticeId: "NSE/CML/70199",
    pdfUrl: nsePdfUrl,
    totalShares: 8883200,
    unlockEvents: lockInEvents,
    preIpoInvestors: preIpoInvestors,
    preIpoWaca: 139.05,
    fetchedAt: new Date().toISOString()
};

db.saveCircularData(c.companyName, circPayload);
db.writeDB(raw);

console.log('Successfully fixed Taurian MPS Ltd.:');
console.log('- Notice ID: NSE/CML/70199');
console.log('- Total Shares:', c.totalShares);
console.log('- Unlock Events:', lockInEvents.length);
console.log('- Pre-IPO Investors:', preIpoInvestors.length, '(WACA: ₹139.05)');
