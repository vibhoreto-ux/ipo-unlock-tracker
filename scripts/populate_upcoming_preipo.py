import json
import os
import re
import io
import requests
import pdfplumber
from datetime import datetime, timezone

def fetch_pdf_pages(url, max_pages=35):
    """Download PDF and extract text of first N pages or capital structure section."""
    if not url:
        return []
    try:
        resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=35)
        if resp.status_code != 200:
            return []
        pages_text = []
        with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
            # If large RHP, find capital structure pages
            if len(pdf.pages) > 40:
                cap_start = -1
                for idx, p in enumerate(pdf.pages[:150]):
                    txt = p.extract_text() or ''
                    if 'SECTION IV: CAPITAL STRUCTURE' in txt or ('CAPITAL STRUCTURE' in txt and 'History of Paid' in txt):
                        cap_start = idx
                        break
                if cap_start != -1:
                    target_pages = pdf.pages[cap_start:cap_start+30]
                else:
                    target_pages = pdf.pages[:max_pages]
            else:
                target_pages = pdf.pages[:max_pages]
                
            for idx, p in enumerate(target_pages):
                txt = p.extract_text() or ''
                pages_text.append((idx + 1, txt))
        return pages_text
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return []

def main():
    with open('data/unlock-data.json') as f:
        db = json.load(f)
        
    now = datetime.now(timezone.utc)
    upcoming = []
    for c in db.get('companies', []):
        ld_str = c.get('listingDate')
        if ld_str:
            try:
                ld = datetime.fromisoformat(ld_str.replace('Z', '+00:00'))
                if ld > now:
                    upcoming.append(c)
            except Exception:
                pass
                
    print(f"Total Upcoming IPOs to process: {len(upcoming)}")
    
    # Check each upcoming IPO
    for idx, c in enumerate(upcoming, 1):
        cname = c.get('companyName')
        print(f"\n[{idx}/{len(upcoming)}] {cname} (Issue: ₹{c.get('issuePrice')})")
        print(f"  CS URL: {c.get('capitalStructureUrl')}")
        print(f"  RHP URL: {c.get('rhpUrl')}")

if __name__ == '__main__':
    main()
