import json
import os
import re
import fitz  # PyMuPDF
import requests
from datetime import datetime, timezone

def process_upcoming():
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
                
    os.makedirs('scratch/upcoming_texts', exist_ok=True)
    print(f"Processing {len(upcoming)} upcoming IPOs using PyMuPDF (fitz)...")
    
    for idx, c in enumerate(upcoming, 1):
        cname = c.get('companyName')
        issue_price = c.get('issuePrice')
        cs_url = c.get('capitalStructureUrl') or c.get('rhpUrl')
        
        print(f"\n[{idx}/{len(upcoming)}] {cname} (Issue: ₹{issue_price})")
        if not cs_url:
            print("  ❌ No PDF URL")
            continue
            
        try:
            resp = requests.get(cs_url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=25)
            if resp.status_code != 200:
                print(f"  ❌ Download failed: {resp.status_code}")
                continue
                
            doc = fitz.open(stream=resp.content, filetype="pdf")
            total_pages = len(doc)
            print(f"  Downloaded: {len(resp.content)//1024} KB, {total_pages} pages")
            
            # Find capital structure start
            start_p = 0
            if total_pages > 35:
                for pno in range(min(total_pages, 150)):
                    txt = doc[pno].get_text()
                    if 'SECTION IV: CAPITAL STRUCTURE' in txt or ('CAPITAL STRUCTURE' in txt and ('History of' in txt or 'Shareholding Pattern' in txt)):
                        start_p = pno
                        break
                        
            end_p = min(total_pages, start_p + 35)
            full_txt = ""
            for pno in range(start_p, end_p):
                full_txt += f"\n=== PAGE {pno+1} ===\n" + doc[pno].get_text()
                
            safe_name = re.sub(r'[^a-zA-Z0-9]', '_', cname)
            with open(f'scratch/upcoming_texts/{safe_name}.txt', 'w') as out:
                out.write(full_txt)
            print(f"  ✅ Saved pages {start_p+1}-{end_p} to scratch/upcoming_texts/{safe_name}.txt ({len(full_txt)} chars)")
            
        except Exception as e:
            print(f"  ❌ Error: {e}")

if __name__ == '__main__':
    process_upcoming()
