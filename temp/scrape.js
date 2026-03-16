const { execSync } = require('child_process');
const cheerio = require('cheerio');
const fs = require('fs');
const pdf = require('pdf-parse');
const { parseLockInData } = require('./circular-scraper');

function curlStr(url) {
    try {
        return execSync(`curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`).toString();
    } catch(e) { return ''; }
}

async function doCompany(noticeId, name) {
    const html = curlStr(`https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`);
    const $ = cheerio.parseHTML(html);
    let annexUrl = null;
    const bodyText = html.toUpperCase();
    const isAnnex1 = !bodyText.includes('ANNEXURE II') && !bodyText.includes('ANNEXURE 2') && !bodyText.includes('ANNEXURE - II');
    
    // Quick regex to find the download link
    const match = html.match(/href="(.*?\.pdf|.*?DownloadAttach.*?)"/);
    if(match) annexUrl = match[1];

    if(!annexUrl) {
       console.log('No URL for', noticeId);
       return;
    }
    
    if (annexUrl.startsWith('/')) {
        annexUrl = 'https://www.bseindia.com' + annexUrl;
    } else if (!annexUrl.startsWith('http')) {
        annexUrl = 'https://www.bseindia.com/markets/MarketInfo/' + annexUrl;
    }
    
    console.log('PDF URL for', name, ':', annexUrl);
    
    try {
        const buf = execSync(`curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${annexUrl}"`);
        const data = await pdf(buf);
        fs.writeFileSync(`temp/debug_${name}.txt`, data.text);
        console.log(`Saved temp/debug_${name}.txt`);
        
        const res = await parseLockInData(buf, 'BSE');
        console.log(JSON.stringify(res, null, 2));
    } catch(e) {
        console.log('PDF error', e.message);
    }
}

async function main() {
    await doCompany('20240808-33', 'afcom');
    await doCompany('20250901-47', 'gem');
}
main();
