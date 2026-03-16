const { execSync } = require('child_process');
const dates = ['20250130', '20250131', '20250201'];
for (const date of dates) {
    for (let i = 1; i <= 60; i++) {
        const id = `${date}-${i}`;
        const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${id}`;
        try {
            const html = execSync(`curl -s '${url}' -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)' -H 'Accept: text/html' -H 'Accept-Language: en-US,en;q=0.5' --compressed`).toString();
            if (html.length < 5000) continue;
            const upper = html.toUpperCase();
            if (upper.includes('H.M.') || upper.includes('H. M.') || upper.includes('ELECTRO')) {
                console.log(`Found HM Electro match at Notice ID: ${id}`);
                process.exit(0);
            }
        } catch (e) {}
    }
}
