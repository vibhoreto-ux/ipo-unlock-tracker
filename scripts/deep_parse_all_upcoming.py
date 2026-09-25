import json
import os
import glob
import re

def parse_investors_from_text(content, cname, issue_price):
    lines = content.split('\n')
    
    # 1. Check shareholding pattern (Public / Non-Promoter vs Promoter)
    # 2. Check history of paid up capital
    # 3. Check details of allotment notes
    # 4. Check secondary transfers
    
    notes = []
    current_note = None
    
    for idx, line in enumerate(lines):
        # Detect Note headers like Note (1), (2), Notes:, Allotment of...
        if re.search(r'^\s*(?:\(\d+\)|\d+\))\s+(?:Allotment of|Initial Subscribers|Conversion of|Bonus issue|Private Placement|Transfer of)', line, re.I):
            if current_note:
                notes.append(current_note)
            current_note = {'header': line.strip(), 'lines': []}
        elif current_note:
            if re.search(r'^\s*(?:\(\d+\)|\d+\))\s+', line) or 'CLASS OF SHARES' in line or 'OBJECTS OF' in line or 'SHAREHOLDING PATTERN' in line:
                notes.append(current_note)
                current_note = None
            else:
                current_note['lines'].append(line)
    if current_note:
        notes.append(current_note)
        
    return notes

def scan_all():
    files = sorted(glob.glob('scratch/upcoming_texts/*.txt'))
    
    with open('data/unlock-data.json') as f:
        db = json.load(f)
    company_map = {c.get('companyName'): c for c in db.get('companies', [])}
    
    for fpath in files:
        fname = os.path.basename(fpath).replace('.txt', '')
        with open(fpath) as f:
            content = f.read()
            
        matched_c = None
        for cname, c in company_map.items():
            safe = re.sub(r'[^a-zA-Z0-9]', '_', cname)
            if safe == fname:
                matched_c = c
                break
                
        cname = matched_c.get('companyName') if matched_c else fname
        issue_price = matched_c.get('issuePrice') if matched_c else None
        
        print(f"\n================================================================================")
        print(f"COMPANY: {cname} | Issue Price: ₹{issue_price} | Existing Invs: {len(matched_c.get('preIpoInvestors', [])) if matched_c else 0}")
        print(f"================================================================================")
        
        # Print shareholding pattern table lines if found
        shp_idx = -1
        for idx, l in enumerate(content.split('\n')):
            if 'Shareholding Pattern' in l or 'shareholding pattern' in l:
                shp_idx = idx
                break
        if shp_idx != -1:
            print("--- Shareholding Pattern Context ---")
            for l in content.split('\n')[shp_idx:shp_idx+35]:
                print("  ", l[:120])
                
        # Print notes on capital structure
        notes = parse_investors_from_text(content, cname, issue_price)
        if notes:
            print(f"\n--- Found {len(notes)} Capital Structure Notes ---")
            for n in notes[:8]:
                print(f"  * {n['header']}")
                for nl in n['lines'][:6]:
                    if nl.strip():
                        print(f"      {nl.strip()[:100]}")

if __name__ == '__main__':
    scan_all()
