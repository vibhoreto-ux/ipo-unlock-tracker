const { execSync } = require('child_process');
const id = '20250130-45';
const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${id}`;
const html = execSync(`curl -s '${url}' -H 'User-Agent: Mozilla/5.0'`).toString();
const titleMatch = html.match(/<span id="dtldisp_lblSubject" class="noticesubject">([^<]+)<\/span>/);
if (titleMatch) {
    console.log("Title:", titleMatch[1]);
} else {
    console.log("No subject found");
    const upper = html.toUpperCase();
    console.log("Has ANNEXURE:", upper.includes("ANNEXURE"));
    console.log("Has .PDF:", upper.includes(".PDF"));
}
