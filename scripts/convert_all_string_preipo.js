const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'unlock-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const companies = data.companies || [];

const junkRegex = /^(this offer|any applicant,??|any investor|foreign direct investment|mutual funds|alternate investment funds|schemes of arrangement|gift of|incorporat subscriber|reduction of|private limited|trading private|holdings private|advisory private|up private limited|amount to amount estimated|options vested|options exercised|name of|securities,?\s*allotted|capital existing in|capital build-up|padam were|khor ten chun aalam|funds?|category ii|chairman and|who is|pcc -|holds)$/i;

const promoterNames = [
  "Alpeshkumar Naginbhai Patel", "Naginbhai Patel", "Kinnari Alpeshkumar Patel", "Kinnari Patel", "Vedanti Alpeshkumar Patel", "Naginbhai Nathabai Patel", "Asma Mohamad Sadique Banani", "Sushilaben Naginbhai Patel", "Kadar Banani", "Sadique Abdul Kadar Banani", "Mr. Alpeshkumar", "Mr. Sadique",
  "Tara Chand", "Santosh Devi",
  "Mange Ram",
  "Harshal Kishor", "Deepa Siddharth", "Bhavini Harshal", "Rakhi Narendra",
  "Krushnarao Bhaskarrao Nimbalkar", "Surendra Kumar Babulal Agarwal", "Dushyant Kumar Yatendra Gupta", "Dushyant Kumar Gupta", "Sangeeta Surendra Agarwal", "Ruchi Ritesh Kakkad", "Meghna Hitesh Kakkad",
  "Ravi Singhal", "Vijay Gangrade", "Ajay Gangrade", "Trisha Singhal", "Vivek Singhal", "Gaurav Gangrade", "Jyoti Gangrade", "Ramesh Chandra Siroya", "Priyal Singhal", "Santosh Kataria",
  "Sanjeev Kumar Jindal", "Abhinav Jindal", "Rajinder Kumar Jindal", "Deepika Jindal", "Kunal Jindal", "Parwati Devi", "Monica Jindal",
  "Rekha Tyagi", "Sanjay Tyagi", "Kartikey Tyagi"
];

let convertedCount = 0;

companies.forEach(c => {
  if (!Array.isArray(c.preIpoInvestors) || c.preIpoInvestors.length === 0) return;
  
  const hasStrings = c.preIpoInvestors.some(i => typeof i === 'string');
  if (!hasStrings) return;

  const cleaned = [];
  c.preIpoInvestors.forEach(inv => {
    if (typeof inv === 'object' && inv !== null) {
      // Ensure object has a valid buyPrice / price
      if (inv.buyPrice === undefined && inv.acquisitionPrice !== undefined) {
        inv.buyPrice = inv.acquisitionPrice;
      }
      if (inv.buyPrice === undefined && inv.costPerShare !== undefined) {
        inv.buyPrice = inv.costPerShare;
      }
      if (inv.buyPrice === undefined && inv.price !== undefined) {
        inv.buyPrice = inv.price;
      }
      cleaned.push(inv);
      return;
    }
    if (typeof inv !== 'string') return;
    let s = inv.trim();
    if (s.length < 3) return;
    if (junkRegex.test(s)) return;
    if (promoterNames.some(p => s.toLowerCase().includes(p.toLowerCase()))) return;
    if (/^mr\.\s|^mrs\.\s|^ms\.\s/i.test(s) && promoterNames.some(p => s.toLowerCase().includes(p.toLowerCase()))) return;

    let buyPrice = null;
    const priceMatch = s.match(/(?:@|\()?\s*₹?\s*([\d\.]+)(?:\s*\/\s*sh|\s*per share|\))?/i);
    if (priceMatch && !isNaN(parseFloat(priceMatch[1])) && parseFloat(priceMatch[1]) > 0) {
      buyPrice = parseFloat(priceMatch[1]);
      s = s.replace(/\(₹?[\d\.]+\)/, '').replace(/@\s*₹?[\d\.]+/, '').trim();
    }
    
    // Clean trailing punctuation or fragments
    s = s.replace(/,\s*$/, '').replace(/\s+holds$/, '').replace(/^M\/s\s+/i, '');
    if (s.length < 3 || junkRegex.test(s)) return;

    cleaned.push({
      name: s,
      shares: '—',
      date: 'Pre-IPO',
      buyPrice: buyPrice !== null ? buyPrice : (c.waca ? parseFloat(c.waca) : (c.issuePrice ? Math.round(c.issuePrice * 0.5) : 10)),
      acquisitionPrice: buyPrice !== null ? buyPrice : (c.waca ? parseFloat(c.waca) : 10),
      category: 'Pre-IPO Shareholder'
    });
  });

  c.preIpoInvestors = cleaned;
  convertedCount++;
});

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Successfully converted ${convertedCount} companies in ${dataPath}!`);
