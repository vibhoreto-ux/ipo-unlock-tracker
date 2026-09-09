const fs = require('fs');
const db = require('../db');

const raw = db.readDB();
const companies = raw.companies || [];

const c = companies.find(x => x.companyName === 'Airfloa Rail Technology Ltd.' || x.companyName.toLowerCase().includes('airfloa'));

if (!c) {
    console.error('Airfloa Rail Technology Ltd. not found in DB!');
    process.exit(1);
}

const lockInEvents = [
    {
        date: null,
        shares: 4655000,
        percentage: 19.42,
        label: "Not under lock-in"
    },
    {
        date: "2025-10-15",
        shares: 926000,
        percentage: 3.86,
        label: "Anchor Lock-in (30 Days)"
    },
    {
        date: "2025-12-14",
        shares: 926000,
        percentage: 3.86,
        label: "Anchor Lock-in (90 Days)"
    },
    {
        date: "2026-09-25",
        shares: 8569554,
        percentage: 35.75,
        label: "Pre-IPO Lock-in (1 Year)"
    },
    {
        date: "2027-09-25",
        shares: 4794500,
        percentage: 20.00,
        label: "2 Years Lock-in"
    },
    {
        date: "2028-09-25",
        shares: 4098900,
        percentage: 17.10,
        label: "Promoter Lock-in (3 Years)"
    }
];

const preIpoInvestors = [
    {
        name: "Aparna Samir Thakker",
        shares: 1993005,
        acquisitionPrice: 31.46,
        date: "2023-09-11",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Individual Pre-IPO (Post-Bonus)"
    },
    {
        name: "Purvesh Mukeshkumar Shah",
        shares: 350000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Rohan Gupta",
        shares: 150000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Asha M Mehta",
        shares: 132000,
        acquisitionPrice: 100.0,
        date: "2024-08-09",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Aditya Rashmikant Dharia",
        shares: 99990,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Kranti Prabhakar Shanbhag",
        shares: 99000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Sheila Bhaskar Mudbidri",
        shares: 80000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Amartara Plastics Private Limited",
        shares: 75000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Amit Mehra",
        shares: 60000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Tejal Pratyush Bhartiya",
        shares: 60000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Sheetal Hemanth",
        shares: 50000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Daksha Mukeshkumar Shah",
        shares: 50000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Ninedot Fortune Builders LLP",
        shares: 52000,
        acquisitionPrice: 116.35,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Singhvi Heritage LLP",
        shares: 48700,
        acquisitionPrice: 115.15,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Sunil Abar",
        shares: 36000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Ninedot Ventures LLP",
        shares: 31200,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Chitresh Kumar Lunawat",
        shares: 28500,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Sanjay Harshadrai Mehta",
        shares: 27000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Nandan Pravinbhai Ganatra",
        shares: 24900,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Indubai Soma Hirve",
        shares: 24900,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Husain Asgar",
        shares: 24000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Pranav Rakesh Kapoor",
        shares: 24000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Vandan Vijay Agarwal",
        shares: 24000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Harsha Talreja",
        shares: 24000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Anup Navalchand Gangar",
        shares: 20000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Suresh Punamchand Varaiya",
        shares: 20000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Kambhapu Vineeth",
        shares: 20100,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Mona Jayesh Sheth",
        shares: 18000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Rajkumar Kapoor",
        shares: 12000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    },
    {
        name: "Aakash Jain",
        shares: 12000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Rajesh Swaminathan",
        shares: 10800,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Moiz Mohammed Bohra",
        shares: 9000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Aman Jain",
        shares: 6000,
        acquisitionPrice: 100.0,
        date: "2024-08-01",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Preferential Allotment (Post-Bonus)"
    },
    {
        name: "Vipula Shailesh Bhansali",
        shares: 6000,
        acquisitionPrice: 125.0,
        date: "2024-12-04",
        lockInPeriod: "1 Year",
        lockInExpiry: "2026-09-25",
        type: "Private Placement Allotment"
    }
];

const noticeUrl = "https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20250917-52";
const annexureUrl = "https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250917-52&attachedId=e275bbf0-7a59-43f4-8493-5dbb1fb15f3e";

c.totalShares = 23969954;
c.circularUrl = annexureUrl;
c.bseCircularUrl = annexureUrl;
c.annexureUrl = annexureUrl;
c.lockInEvents = lockInEvents;
c.preIpoInvestors = preIpoInvestors;
c.preIpoWaca = 108.55;
c.waca = 108.55;
c.preIpoChecked = true;

const circPayload = {
    found: true,
    source: "BSE",
    noticeId: "20250917-52",
    pdfUrl: annexureUrl,
    annexureUrl: annexureUrl,
    totalShares: 23969954,
    unlockEvents: lockInEvents,
    preIpoInvestors: preIpoInvestors,
    preIpoWaca: 108.55,
    fetchedAt: new Date().toISOString()
};

db.saveCircularData(c.companyName, circPayload);
db.writeDB(raw);

console.log('Successfully fixed Airfloa Rail Technology Ltd.:');
console.log('- Notice ID: 20250917-52');
console.log('- Total Shares:', c.totalShares);
console.log('- Unlock Events:', lockInEvents.length);
console.log('- Pre-IPO Investors:', preIpoInvestors.length, '(WACA: ₹108.55)');
