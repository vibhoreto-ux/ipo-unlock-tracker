/**
 * yt-transcript-puppeteer.js
 * ==========================
 * Extract YouTube video transcript using Puppeteer with the user's real Chrome profile.
 * This bypasses ALL rate limits because it IS the user's browser with real cookies.
 *
 * Usage:
 *   node yt-transcript-puppeteer.js <VIDEO_ID>
 *
 * Returns JSON: { videoId, title, transcript }
 */

const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

// User's real Chrome profile path (for cookie/login extraction)
const CHROME_PROFILE = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// We copy Chrome's Default profile to a temp dir so Puppeteer can run
// even while the real Chrome is already open (avoids lock conflict)
function createTempProfile() {
    const tmpDir = path.join(os.tmpdir(), `yt-pptr-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    // Copy only essential files: cookies, local state, preferences
    const srcDefault = path.join(CHROME_PROFILE, 'Default');
    const dstDefault = path.join(tmpDir, 'Default');
    fs.mkdirSync(dstDefault, { recursive: true });
    for (const f of ['Cookies', 'Login Data', 'Preferences', 'Local State']) {
        const src = path.join(srcDefault, f);
        if (fs.existsSync(src)) {
            try { fs.copyFileSync(src, path.join(dstDefault, f)); } catch (_) {}
        }
    }
    // Copy Local State to tmpDir root too
    const ls = path.join(CHROME_PROFILE, 'Local State');
    if (fs.existsSync(ls)) {
        try { fs.copyFileSync(ls, path.join(tmpDir, 'Local State')); } catch (_) {}
    }
    return tmpDir;
}

async function extractTranscript(videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    let browser;
    let tmpProfile;

    try {
        tmpProfile = createTempProfile();
        console.error(`[YT] Using temp profile: ${tmpProfile}`);

        browser = await puppeteer.launch({
            executablePath: CHROME_EXECUTABLE,
            userDataDir: tmpProfile,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--profile-directory=Default',
            ],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        console.error(`[YT] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Get video title
        const title = await page.title().catch(() => '');

        // Wait for video player to load
        await page.waitForSelector('#movie_player, ytd-watch-flexy', { timeout: 15000 }).catch(() => {});

        // Click "..." more options menu to find transcript button
        // Try the description "Show transcript" button first
        let transcript = null;

        // Method 1: Click "Show transcript" via the "..." button below video
        try {
            // Click the "more actions" button (3 dots) below the video
            const moreBtn = await page.$('button[aria-label="More actions"], ytd-menu-renderer button, #button-shape button');
            if (moreBtn) {
                await moreBtn.click();
                await page.waitForTimeout(800);

                // Look for "Show transcript" option in the popup menu
                const transcriptItem = await page.$x('//yt-formatted-string[contains(text(), "Show transcript")]');
                if (transcriptItem.length > 0) {
                    await transcriptItem[0].click();
                    await page.waitForTimeout(1500);
                }
            }
        } catch (e) {
            console.error('[YT] Method 1 failed:', e.message.substring(0, 80));
        }

        // Method 2: Directly access YouTube's timedtext via the page's internal player API
        // The page has ytInitialPlayerResponse which contains caption track URLs
        if (!transcript) {
            try {
                transcript = await page.evaluate(() => {
                    // Try to get from ytInitialPlayerResponse
                    const data = window.ytInitialPlayerResponse || {};
                    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

                    // Find English track
                    let trackUrl = null;
                    for (const t of tracks) {
                        if (t.languageCode === 'en' || t.name?.simpleText?.includes('English')) {
                            trackUrl = t.baseUrl;
                            break;
                        }
                    }
                    // Fallback: first track
                    if (!trackUrl && tracks.length > 0) {
                        trackUrl = tracks[0].baseUrl;
                    }

                    return trackUrl ? { trackUrl } : null;
                });
            } catch (e) {
                console.error('[YT] Method 2 eval failed:', e.message.substring(0, 80));
            }
        }

        // If we got a caption track URL, fetch it directly via fetch() in the page context
        // (same origin + same cookies = no 429)
        if (transcript && transcript.trackUrl) {
            const captionUrl = transcript.trackUrl + '&fmt=json3';
            console.error('[YT] Fetching captions from:', captionUrl.substring(0, 100));

            const captionData = await page.evaluate(async (url) => {
                try {
                    const resp = await fetch(url);
                    if (!resp.ok) return { error: resp.status };
                    return await resp.json();
                } catch (e) {
                    return { error: e.message };
                }
            }, captionUrl);

            if (captionData && captionData.events) {
                const texts = [];
                for (const ev of captionData.events) {
                    for (const seg of (ev.segs || [])) {
                        const t = (seg.utf8 || '').replace(/\n/g, ' ').trim();
                        if (t && t !== ' ') texts.push(t);
                    }
                }
                transcript = texts.join(' ');
            } else if (captionData?.error) {
                console.error('[YT] Caption fetch error:', captionData.error);
                transcript = null;
            }
        }

        // Method 3: Scrape from the transcript panel if it opened
        if (!transcript || typeof transcript === 'object') {
            try {
                const panelTexts = await page.$$eval(
                    'ytd-transcript-segment-renderer .segment-text, [class*="transcript"] .text',
                    els => els.map(el => el.textContent.trim()).filter(Boolean)
                );
                if (panelTexts.length > 10) {
                    transcript = panelTexts.join(' ');
                }
            } catch (e) {
                console.error('[YT] Method 3 panel failed:', e.message.substring(0, 80));
            }
        }

        await browser.close();
        // Clean up temp profile
        if (tmpProfile) {
            try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
        }

        return {
            videoId,
            title: title.replace(' - YouTube', ''),
            transcript: typeof transcript === 'string' ? transcript : null,
        };

    } catch (e) {
        if (browser) await browser.close().catch(() => {});
        if (tmpProfile) {
            try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
        }
        throw e;
    }
}

// CLI
if (require.main === module) {
    const videoId = process.argv[2];
    if (!videoId) {
        console.error('Usage: node yt-transcript-puppeteer.js <VIDEO_ID>');
        process.exit(1);
    }
    extractTranscript(videoId).then(result => {
        if (result.transcript) {
            console.log(JSON.stringify({ success: true, ...result }));
        } else {
            console.log(JSON.stringify({ success: false, videoId, title: result.title, transcript: null }));
        }
    }).catch(e => {
        console.error('Fatal:', e.message);
        process.exit(1);
    });
}

module.exports = { extractTranscript };
