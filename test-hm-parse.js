const scraper = require('./circular-scraper');
const fs = require('fs');
const pdf = require('pdf-parse');
async function test() {
    // 20250130-45 is the actual Notice ID 
    const url = 'https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20250130-45&attachedId=6c2ef65e-26f5-430c-84ed-e4324f114681';
    const { execSync } = require('child_process');
    execSync(`curl -s '${url}' -H 'User-Agent: Mozilla/5.0' -o /tmp/hm_electro.pdf`);
    const data = await scraper.parseLockInData(fs.readFileSync('/tmp/hm_electro.pdf'));
    console.log(JSON.stringify(data, null, 2));
}
test();
