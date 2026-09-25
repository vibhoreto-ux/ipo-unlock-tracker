import json
import os
import re
import io
import requests
import pdfplumber
from datetime import datetime, timezone

def analyze_company_pdf(company):
    name = company.get('companyName')
    issue_price = company.get('issuePrice')
    cs_url = company.get('capitalStructureUrl') or company.get('rhpUrl')
    
    if not cs_url:
        return {'companyName': name, 'status': 'no_url'}
        
    print(f"\n=======================================================")
    print(f"Analyzing: {name} (Issue Price: ₹{issue_price})")
    print(f"URL: {cs_url}")
    
    try:
        resp = requests.get(cs_url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
        if resp.status_code != 200:
            return {'companyName': name, 'status': 'download_failed'}
            
        with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
            total_pages = len(pdf.pages)
            print(f"Total pages: {total_pages}")
            
            # Find relevant pages
            relevant_pages = []
            target_pages = pdf.pages[:35] if total_pages <= 50 else []
            if total_pages > 50:
                # search for capital structure section
                for idx, p in enumerate(pdf.pages[:120]):
                    t = p.extract_text() or ''
                    if 'SECTION IV: CAPITAL STRUCTURE' in t or ('CAPITAL STRUCTURE' in t and ('History of' in t or 'Shareholding Pattern' in t)):
                        target_pages = pdf.pages[idx:idx+25]
                        break
                if not target_pages:
                    target_pages = pdf.pages[:35]
                    
            full_txt = ''
            for pidx, p in enumerate(target_pages):
                t = p.extract_text() or ''
                full_txt += f"\n--- PAGE {pidx+1} ---\n" + t
                
            return {
                'companyName': name,
                'issuePrice': issue_price,
                'status': 'success',
                'text': full_txt
            }
    except Exception as e:
        print(f"Error: {e}")
        return {'companyName': name, 'status': 'error', 'error': str(e)}

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
                
    os.makedirs('scratch/upcoming_texts', exist_ok=True)
    
    for idx, c in enumerate(upcoming, 1):
        res = analyze_company_pdf(c)
        if res.get('status') == 'success':
            safe_name = re.sub(r'[^a-zA-Z0-9]', '_', c.get('companyName'))
            with open(f'scratch/upcoming_texts/{safe_name}.txt', 'w') as out:
                out.write(res['text'])
            print(f"Saved scratch/upcoming_texts/{safe_name}.txt ({len(res['text'])} chars)")

if __name__ == '__main__':
    main()
