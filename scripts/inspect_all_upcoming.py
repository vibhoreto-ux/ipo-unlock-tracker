import json
import os
import glob
import re

def inspect_company(fpath):
    with open(fpath) as f:
        text = f.read()
        
    cname = os.path.basename(fpath).replace('.txt', '')
    print(f"\n=======================================================")
    print(f"FILE: {cname}")
    print(f"=======================================================")
    
    # 1. Check Major Shareholders / Details of Major Shareholders
    major_sh = []
    lines = text.split('\n')
    for idx, l in enumerate(lines):
        if re.search(r'shareholders holding 1%|details of major shareholders|shareholding of.*promoter|shareholding pattern of our company', l, re.I):
            print(f"\n--- Section near line {idx}: {l.strip()} ---")
            for sub_l in lines[idx:min(len(lines), idx+30)]:
                print("  ", sub_l.strip())
                
        if re.search(r'private placement|preferential allotment|conversion of (?:ocd|ccd|ccps|debenture)|secondary transaction', l, re.I):
            if any(k in l.lower() for k in ['allotment', 'transfer', 'conversion', 'history', 'shares to']):
                print(f"  [Tx] {l.strip()[:110]}")

if __name__ == '__main__':
    for f in sorted(glob.glob('scratch/upcoming_texts/*.txt')):
        inspect_company(f)
