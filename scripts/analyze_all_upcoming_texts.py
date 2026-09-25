import json
import os
import glob
import re

def analyze_all():
    files = glob.glob('scratch/upcoming_texts/*.txt')
    print(f"Analyzing {len(files)} extracted text files...\n")
    
    with open('data/unlock-data.json') as f:
        db = json.load(f)
        
    company_map = {c.get('companyName'): c for c in db.get('companies', [])}
    
    results = []
    
    for fpath in sorted(files):
        fname = os.path.basename(fpath).replace('.txt', '')
        with open(fpath) as f:
            content = f.read()
            
        # Match company
        matched_c = None
        for cname, c in company_map.items():
            safe = re.sub(r'[^a-zA-Z0-9]', '_', cname)
            if safe == fname:
                matched_c = c
                break
                
        cname = matched_c.get('companyName') if matched_c else fname
        issue_price = matched_c.get('issuePrice') if matched_c else 'N/A'
        
        # Search for key sections
        has_pref = bool(re.search(r'private placement|preferential allotment|conversion of (?:ccds|ocds|ccps|debentures|loan)|secondary (?:transaction|transfer)', content, re.I))
        has_pre_ipo_mention = bool(re.search(r'pre-ipo|pre ipo', content, re.I))
        
        # Look for shareholding pattern breakdown
        promoter_pct = None
        m_prom = re.search(r'Promoter(?:s)?\s*(?:and\s*Promoter\s*Group)?\s*[:\-]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*%', content, re.I)
        if m_prom:
            promoter_pct = m_prom.group(1)
            
        # Check if 100% promoter held or has public/investors
        is_100_promoter = '100.00' in str(promoter_pct) or '100%' in content or 'No public shareholders' in content
        
        results.append({
            'companyName': cname,
            'issuePrice': issue_price,
            'existingInvestors': len(matched_c.get('preIpoInvestors', [])) if matched_c else 0,
            'existingWaca': matched_c.get('waca') if matched_c else None,
            'has_pref': has_pref,
            'has_pre_ipo_mention': has_pre_ipo_mention,
            'file': fpath,
            'content_len': len(content)
        })
        
    print(f"{'Company':<40} | {'Issue Price':<11} | {'Exist Invs':<10} | {'WACA':<10} | {'Pref/Pre-IPO found?'}")
    print("-" * 95)
    for r in results:
        pref_tag = "🔥 YES" if (r['has_pref'] or r['has_pre_ipo_mention']) else "No"
        print(f"{r['companyName'][:38]:<40} | ₹{str(r['issuePrice']):<10} | {r['existingInvestors']:<10} | {str(r['existingWaca']):<10} | {pref_tag}")

if __name__ == '__main__':
    analyze_all()
