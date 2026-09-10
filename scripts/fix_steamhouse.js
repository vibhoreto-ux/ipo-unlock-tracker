const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/unlock-data.json');
const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

const steamhouse = raw.companies.find(x => x.companyName === 'Steamhouse India Ltd.' || x.companyName.toLowerCase().includes('steamhouse'));

if (!steamhouse) {
    console.error('Steamhouse India Ltd. not found in DB!');
    process.exit(1);
}

const preIpoInvestors = [
    {
        name: "Singularity Large Value Fund III",
        shares: 4794520,
        acquisitionPrice: 73.0,
        date: "2026-06-24",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Pre-IPO Private Placement"
    },
    {
        name: "Niveshaay Sambhav Fund",
        shares: 1369863,
        acquisitionPrice: 73.0,
        date: "2026-06-24",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Pre-IPO Private Placement"
    },
    {
        name: "Singularity Equity Fund I",
        shares: 684932,
        acquisitionPrice: 73.0,
        date: "2026-06-24",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Pre-IPO Private Placement"
    },
    {
        name: "Suchi Goenka",
        shares: 450000,
        acquisitionPrice: 0.0,
        date: "2023-10-05",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Pre-IPO Allotment & Bonus"
    },
    {
        name: "Rahul Vijaykumar Agarwal",
        shares: 413734,
        acquisitionPrice: 38.67,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement & Bonus"
    },
    {
        name: "Gitadevi Vijaykumar Agrawal",
        shares: 382500,
        acquisitionPrice: 0.0,
        date: "2023-10-05",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Bonus Allotment"
    },
    {
        name: "Manish Vijaykumar Agrawal",
        shares: 195000,
        acquisitionPrice: 0.0,
        date: "2023-10-05",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Bonus Allotment"
    },
    {
        name: "Ruchi Agrawal",
        shares: 195000,
        acquisitionPrice: 0.0,
        date: "2023-10-05",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Bonus Allotment"
    },
    {
        name: "Sweta Agarwal",
        shares: 189000,
        acquisitionPrice: 1.59,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement & Bonus"
    },
    {
        name: "Suchika Agrawal",
        shares: 187500,
        acquisitionPrice: 0.0,
        date: "2023-10-05",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Bonus Allotment"
    },
    {
        name: "Vikas Vijaykumar Agrawal",
        shares: 187500,
        acquisitionPrice: 0.0,
        date: "2023-10-05",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Bonus Allotment"
    },
    {
        name: "Abhishek Yudhishter Batra",
        shares: 75000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Anilkumar Hasmukhbhai Patel",
        shares: 55000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Rajivkumar Narayandas Batra",
        shares: 50000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Tanmaya Murarilal Agrawal",
        shares: 50000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Sanjay Kedarmal Sudrania",
        shares: 50000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Salony Rathi Jhawar",
        shares: 50000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Swastik Polyprints Private Limited",
        shares: 50000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Atulkumar Hastimal Mehta",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Komal Rajivkumar Batra",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Vinay Yudhisthir Batra",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Samarth Rajivbhai Batra",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Sahil Yudhisthir Batra",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Mamta Rahul Sharma",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Saraogi Viniyog Private Limited",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Sudarshan Taparia",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Vrinda Binay Agarwal",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Vedika Vinay Khemka",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Lalit Radhakisan Agarwal",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Taj Vincom Private Limited",
        shares: 25000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Shah Krunal Shirish",
        shares: 17500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Santosh Devi Agarwal",
        shares: 15000,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Aaditya Bajaj",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Mehta Wealth Limited",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Punitkumar Vijaykumar Agarwal",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Vishal Sanghai",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Gaurav Singhvi",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Sonam Jain",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Shrikant Goenka",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Suman Sumit Saraogi",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Ashish V Singhal",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    },
    {
        name: "Shaileshkumar Ishwarlal Patel",
        shares: 12500,
        acquisitionPrice: 200.0,
        date: "2024-03-28",
        lockInPeriod: "6 Months",
        lockInExpiry: "2027-03-17",
        type: "Private Placement"
    }
];

steamhouse.preIpoInvestors = preIpoInvestors;
steamhouse.preIpoWaca = 73.0;
steamhouse.waca = 73.0;
steamhouse.preIpoChecked = true;

if (!raw.circularData) raw.circularData = {};

raw.circularData["Steamhouse India Ltd."] = {
    found: true,
    source: "RHP",
    totalShares: 232826065,
    preIpoInvestors: preIpoInvestors,
    preIpoWaca: 73.0,
    isScannedPDF: false,
    fetchedAt: new Date().toISOString()
};

fs.writeFileSync(DB_PATH, JSON.stringify(raw, null, 2), 'utf8');
console.log('Successfully updated Steamhouse India Ltd. with', preIpoInvestors.length, 'pre-IPO investors, WACA: ₹73.00');
