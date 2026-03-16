const fs = require('fs');
const pdf = require('pdf-parse');
const axios = require('axios');

async function test() {
    try {
        console.log('Downloading INDO SMC PDF...');
        const url = 'https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?id=20260120-49&attachedId=7300b8c4-cf01-4f98-af34-852445051eac';
        const req = require('https').request(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
            }
        }, (res) => {
            const data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', async () => {
                const buffer = Buffer.concat(data);
                console.log('Downloaded', buffer.length, 'bytes');
                const parsed = await pdf(buffer);
                console.log('--- RAW PDF TEXT START ---');
                console.log(parsed.text);
                console.log('--- RAW PDF TEXT END ---');
            });
        });
        req.end();
    } catch (e) { console.error('Error:', e); }
}
test();
