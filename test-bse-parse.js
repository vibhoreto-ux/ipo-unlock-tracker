const fs = require('fs');
const pdf = require('pdf-parse');
const axios = require('axios');

async function test() {
    console.log('Downloading INDO SMC PDF...');
    const url = 'https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20260120-49&attachedId=7300b8c4-cf01-4f98-af34-852445051eac';
    const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        }
    });

    fs.writeFileSync('indo-smc.pdf', resp.data);
    const data = await pdf(resp.data);
    const text = data.text;
    console.log('--- RAW PDF TEXT START ---');
    console.log(text);
    console.log('--- RAW PDF TEXT END ---');
}
test().catch(console.error);
