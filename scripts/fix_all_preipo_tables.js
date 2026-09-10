const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/unlock-data.json');
const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const comps = raw.companies || [];

function findComp(name) {
    return comps.find(x => x.companyName === name || x.companyName.toLowerCase().includes(name.toLowerCase()));
}

// 1. Vama Wovenfab Ltd. (100% Promoter Held)
const vama = findComp('Vama Wovenfab');
if (vama) {
    vama.preIpoInvestors = []; // 100% Promoter family held prior to IPO
    vama.preIpoWaca = 105.0;
    vama.waca = 105.0;
    vama.preIpoChecked = true;
    console.log('Fixed Vama Wovenfab');
}

// 2. Raksan Transformers Ltd
const raksan = findComp('Raksan Transformers');
if (raksan) {
    raksan.preIpoInvestors = [
        {
            name: "Shagun Shree Construction Private Limited",
            shares: 950000,
            acquisitionPrice: 0.53,
            date: "2008-11-01",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-15",
            type: "Pre-IPO Allotment (Post 18:1 Bonus)"
        },
        {
            name: "Tamkur Trading Private Limited",
            shares: 950000,
            acquisitionPrice: 0.53,
            date: "2008-11-01",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-15",
            type: "Pre-IPO Allotment (Post 18:1 Bonus)"
        },
        {
            name: "Shree Ganesh Enclave Private Limited",
            shares: 950000,
            acquisitionPrice: 0.53,
            date: "2008-11-01",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-15",
            type: "Pre-IPO Allotment (Post 18:1 Bonus)"
        },
        {
            name: "Aashish Retail Sales Private Limited",
            shares: 950000,
            acquisitionPrice: 0.53,
            date: "2008-11-01",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-15",
            type: "Pre-IPO Allotment (Post 18:1 Bonus)"
        },
        {
            name: "Virender Singh Drall",
            shares: 285000,
            acquisitionPrice: 5.26,
            date: "2009-07-01",
            lockInPeriod: "1 Year",
            lockInExpiry: "2026-09-15",
            type: "Pre-IPO Allotment (Post 18:1 Bonus)"
        }
    ];
    raksan.preIpoWaca = 0.53;
    raksan.waca = 0.53;
    raksan.preIpoChecked = true;
    console.log('Fixed Raksan Transformers');
}

// 3. Panchatv Bharat Ltd.
const panchatv = findComp('Panchatv Bharat');
if (panchatv) {
    panchatv.preIpoInvestors = [
        { name: "BRJ Resources Private Limited", shares: 81600, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "G-Trading India Private Limited", shares: 24000, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Stockify Fintech Private Limited", shares: 24000, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Rajesh Garg", shares: 24000, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Kishorilal Jhabarmal Kataruka", shares: 18000, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Innovest Ventures", shares: 12000, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Samta Devi Baid", shares: 12000, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Naim L Chogle", shares: 12000, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Pradeep Kumar", shares: 10800, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Jishan Khan", shares: 9600, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Shahid Sisodiya", shares: 9600, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Pradeep Samal", shares: 7200, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Anil Kumar Sinha", shares: 4800, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" },
        { name: "Sanjay Singh", shares: 2400, acquisitionPrice: 110.0, date: "2024-06-01", lockInPeriod: "1 Year", lockInExpiry: "2026-09-18", type: "Private Placement" }
    ];
    panchatv.preIpoWaca = 110.0;
    panchatv.waca = 110.0;
    panchatv.preIpoChecked = true;
    console.log('Fixed Panchatv Bharat');
}

// 4. Century Business Media Ltd
const century = findComp('Century Business Media');
if (century) {
    century.preIpoInvestors = []; // 100% Promoter held
    century.preIpoWaca = 10.0;
    century.waca = 10.0;
    century.preIpoChecked = true;
    console.log('Fixed Century Business Media');
}

// 5. Hero Motors Ltd
const hero = findComp('Hero Motors');
if (hero) {
    hero.preIpoInvestors = [
        { name: "South Asia Growth Invest LLC", shares: 25947024, acquisitionPrice: 69.14, date: "2022-12-30", lockInPeriod: "6 Months", lockInExpiry: "2027-03-15", type: "Secondary Transfer" },
        { name: "South Asia EBT Trust", shares: 87110, acquisitionPrice: 69.14, date: "2022-12-30", lockInPeriod: "6 Months", lockInExpiry: "2027-03-15", type: "Secondary Transfer" },
        { name: "Vimal Kumar Bansal", shares: 25000, acquisitionPrice: 80.0, date: "2022-12-19", lockInPeriod: "6 Months", lockInExpiry: "2027-03-15", type: "Preferential Allotment" },
        { name: "Madhu Dalmia", shares: 25000, acquisitionPrice: 80.0, date: "2022-12-19", lockInPeriod: "6 Months", lockInExpiry: "2027-03-15", type: "Preferential Allotment" },
        { name: "Vansh Garg", shares: 25000, acquisitionPrice: 80.0, date: "2022-12-19", lockInPeriod: "6 Months", lockInExpiry: "2027-03-15", type: "Preferential Allotment" },
        { name: "Keshav Misra", shares: 25000, acquisitionPrice: 80.0, date: "2022-12-19", lockInPeriod: "6 Months", lockInExpiry: "2027-03-15", type: "Preferential Allotment" },
        { name: "Vinay Bansal", shares: 25000, acquisitionPrice: 80.0, date: "2022-12-19", lockInPeriod: "6 Months", lockInExpiry: "2027-03-15", type: "Preferential Allotment" },
        { name: "Shyam Sunder Bansal", shares: 25000, acquisitionPrice: 80.0, date: "2022-12-19", lockInPeriod: "6 Months", lockInExpiry: "2027-03-15", type: "Preferential Allotment" },
        { name: "Esha Gupta", shares: 25000, acquisitionPrice: 80.0, date: "2022-12-19", lockInPeriod: "6 Months", lockInExpiry: "2027-03-15", type: "Preferential Allotment" }
    ];
    hero.preIpoWaca = 89.0;
    hero.waca = 89.0;
    hero.preIpoChecked = true;
    console.log('Fixed Hero Motors');
}

// 6. LCC Projects Ltd.
const lcc = findComp('LCC Projects');
if (lcc) {
    lcc.preIpoInvestors = []; // 100% Promoter & Group held
    lcc.preIpoWaca = 0.0;
    lcc.waca = 0.0;
    lcc.preIpoChecked = true;
    console.log('Fixed LCC Projects');
}

// 7. Zelio E-Mobility Ltd.
const zelio = findComp('Zelio E-Mobility');
if (zelio) {
    zelio.preIpoInvestors = []; // 100% Promoter held
    zelio.preIpoWaca = 0.02;
    zelio.waca = 0.02;
    zelio.preIpoChecked = true;
    console.log('Fixed Zelio E-Mobility');
}

fs.writeFileSync(DB_PATH, JSON.stringify(raw, null, 2), 'utf8');
console.log('Successfully written clean pre-IPO updates to', DB_PATH);
