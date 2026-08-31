"""
interview_extractor.py
======================
Extracts FY27 management guidance highlights from YouTube interviews.

Strategy:
  1. Search YouTube for management/CMD/MD interviews (parse ytInitialData JSON)
  2. Rank results to prefer actual management interviews over review videos
  3. Try to get transcript via yt-dlp (uses Chrome cookies to bypass 429 rate limits)
  4. Parse transcript for FY27 / financial guidance sentences
  5. Fall back to returning best-matched video link if transcript unavailable
"""
import sys
import json
import re
import argparse
import urllib.request
import urllib.parse


def search_management_videos(company_name, n=10):
    """
    Search YouTube for management interviews. Returns list of (video_id, title) tuples.
    """
    clean = re.sub(r'(?i)\b(ltd\.?|limited|trust|invit|ipo|incorporation|inc\.?)\b', '', company_name).strip()
    clean = re.sub(r'\s+', ' ', clean).strip()

    queries = [
        f'"{clean}" IPO CMD interview',
        f'"{clean}" IPO management interview CEO MD',
    ]

    seen = set()
    results = []

    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        ),
        'Accept-Language': 'en-US,en;q=0.9',
    }

    for query in queries:
        q = urllib.parse.urlencode({'search_query': query})
        try:
            req = urllib.request.Request('https://www.youtube.com/results?' + q, headers=headers)
            html = urllib.request.urlopen(req, timeout=12).read().decode('utf-8', errors='replace')

            # Parse ytInitialData to get structured video results with titles
            m = re.search(r'ytInitialData\s*=\s*(\{.+?\});\s*</script', html, re.DOTALL)
            if m:
                data = json.loads(m.group(1))
                try:
                    contents = (
                        data['contents']['twoColumnSearchResultsRenderer']
                            ['primaryContents']['sectionListRenderer']['contents']
                    )
                    for section in contents:
                        items = section.get('itemSectionRenderer', {}).get('contents', [])
                        for item in items:
                            vr = item.get('videoRenderer', {})
                            if vr:
                                vid_id = vr.get('videoId', '')
                                title = vr.get('title', {}).get('runs', [{}])[0].get('text', '')
                                if vid_id and vid_id not in seen:
                                    seen.add(vid_id)
                                    results.append((vid_id, title))
                except (KeyError, IndexError):
                    pass

            # Fallback: extract video IDs from href only (no titles)
            if not results:
                for vid_id in list(dict.fromkeys(re.findall(r'watch\?v=([\w-]{11})', html)))[:5]:
                    if vid_id not in seen:
                        seen.add(vid_id)
                        results.append((vid_id, ''))

        except Exception as e:
            print(f"Search error for query '{query}': {e}", file=sys.stderr)

        if len(results) >= n:
            break

    # Rank: prefer titles mentioning interview/management/cmd/ceo/md; deprioritize reviews
    POSITIVE = ['interview', 'management', 'cmd ', 'md ', 'ceo', 'promoter', 'ipo', 'hear from', 'speak']
    NEGATIVE = ['review', 'analysis', 'gmp', 'allotment', 'subscription', 'kotak',
                'chittorgarh', 'hindi', 'explained', 'should you', 'worth', 'shorts', '#short',
                'listing ceremony', 'csr film']

    def rank_key(item):
        _, title = item
        tl = title.lower()
        score = sum(2 for kw in POSITIVE if kw in tl) - sum(3 for kw in NEGATIVE if kw in tl)
        return -score  # lower = better

    results.sort(key=rank_key)
    return results[:n]


def get_transcript_via_ytdlp(video_id):
    """
    Use yt-dlp with Chrome browser cookies to write subtitle file to disk.
    This bypasses YouTube's 429 rate-limit since Chrome session cookies act as auth.
    """
    import os, tempfile
    try:
        import yt_dlp

        tmpdir = tempfile.mkdtemp()
        outtmpl = os.path.join(tmpdir, '%(id)s.%(ext)s')

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'writeautomaticsub': True,
            'writesubtitles': True,
            'subtitlesformat': 'json3',
            'subtitleslangs': ['en'],
            'outtmpl': outtmpl,
            # Load cookies from Chrome browser - key bypass for 429 rate-limiting
            'cookiesfrombrowser': ('chrome', None, None, None),
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f'https://www.youtube.com/watch?v={video_id}'])

        # Find and parse the subtitle file
        for fname in os.listdir(tmpdir):
            fpath = os.path.join(tmpdir, fname)
            if fname.endswith('.json3'):
                with open(fpath, 'r', encoding='utf-8') as f:
                    d = json.load(f)
                texts = []
                for ev in d.get('events', []):
                    for seg in ev.get('segs', []):
                        t = seg.get('utf8', '').replace('\n', ' ').strip()
                        if t and t != ' ':
                            texts.append(t)
                return ' '.join(texts) if texts else None
            elif fname.endswith('.vtt'):
                with open(fpath, 'r', encoding='utf-8') as f:
                    vtt = f.read()
                # Strip VTT headers and timestamps
                lines = []
                for line in vtt.splitlines():
                    if not line.startswith('WEBVTT') and '-->' not in line and line.strip():
                        lines.append(line.strip())
                return ' '.join(lines) if lines else None

        return None

    except Exception as e:
        print(f"yt-dlp transcript error [{video_id}]: {e}", file=sys.stderr)
        return None


def get_transcript_via_api(video_id):
    """
    Fallback: use youtube-transcript-api.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api = YouTubeTranscriptApi()
        tl = api.list(video_id)
        transcript = None
        for t in tl:
            transcript = t
            break
        if not transcript:
            return None
        if transcript.language_code != 'en' and transcript.is_translatable:
            try:
                transcript = transcript.translate('en')
            except Exception:
                pass
        data = transcript.fetch()
        texts = [(t['text'] if isinstance(t, dict) else t.text).replace('\n', ' ') for t in data]
        return ' '.join(texts)
    except Exception as e:
        print(f"API transcript error [{video_id}]: {e}", file=sys.stderr)
        return None


def extract_highlights(text):
    """
    Extract FY27/management-guidance sentences from transcript text.
    """
    if not text or len(text.strip()) < 50:
        return []

    sentences = re.split(r'(?<=[.!?])\s+', text)

    FY27 = ['fy27', 'fy 27', '2027', 'fy2027', 'next year', 'next financial year',
            'upcoming year', 'h1 fy27', 'h2 fy27']
    FINANCIAL = ['revenue', 'profit', 'crore', 'lakh', 'target', 'margin', 'growth',
                 'guidance', 'capacity', 'topline', 'ebitda', 'pat', 'sales', 'turnover',
                 'order book', 'expansion', 'capex', 'milestone']
    MGMT = ['we plan', 'we expect', 'we target', 'we aim', 'we are looking', 'we will',
            'our goal', 'our guidance', 'we anticipate', 'company plans', 'we intend',
            'going forward', 'in the next']

    highlights = []
    general_fin = []

    for i, s in enumerate(sentences):
        sl = s.lower()
        # Build context by including prior short sentence
        ctx = (sentences[i - 1] + ' ' + s).strip() if (i > 0 and len(s.split()) < 12) else s.strip()

        has_fy27 = any(kw in sl for kw in FY27)
        has_fin = any(kw in sl for kw in FINANCIAL)
        has_mgmt = any(kw in sl for kw in MGMT)

        if has_fy27 and has_fin:
            highlights.append(ctx)
        elif (has_mgmt or has_fy27) and has_fin:
            highlights.append(ctx)
        elif has_fin:
            general_fin.append(ctx)

    if not highlights:
        highlights = general_fin

    # Deduplicate and limit
    seen_keys = set()
    unique = []
    for h in highlights:
        k = h[:60].lower()
        if k not in seen_keys and len(h.split()) > 5:
            seen_keys.add(k)
            unique.append(h)

    return unique[:4]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--company_name', required=True)
    args = parser.parse_args()

    company_name = args.company_name
    print(f"Searching for management interviews: {company_name}", file=sys.stderr)

    videos = search_management_videos(company_name)
    if not videos:
        print(json.dumps({'url': None, 'highlights': [], 'source': 'none'}))
        return

    print(f"Found {len(videos)} candidates, top 3:", file=sys.stderr)
    for vid_id, title in videos[:3]:
        print(f"  [{vid_id}] {title}", file=sys.stderr)

    # Try top 3 ranked videos
    for video_id, title in videos[:3]:
        # Try yt-dlp with Chrome cookies first (bypasses 429)
        text = get_transcript_via_ytdlp(video_id)
        if not text:
            # Fallback to youtube-transcript-api
            text = get_transcript_via_api(video_id)

        if text and len(text) > 100:
            highlights = extract_highlights(text)
            if highlights:
                print(json.dumps({
                    'url': f'https://www.youtube.com/watch?v={video_id}',
                    'title': title,
                    'highlights': highlights,
                    'source': 'youtube_transcript'
                }))
                return

    # Couldn't get transcript — return best video link
    best_vid, best_title = videos[0]
    print(json.dumps({
        'url': f'https://www.youtube.com/watch?v={best_vid}',
        'title': best_title,
        'highlights': [
            f'📹 Found interview: "{best_title}" — transcript could not be extracted automatically. '
            f'Watch at https://www.youtube.com/watch?v={best_vid}'
        ],
        'source': 'youtube_link_only'
    }))


if __name__ == '__main__':
    main()
