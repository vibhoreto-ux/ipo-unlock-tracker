import pdfplumber
from io import BytesIO
import re

def is_valid_investor_name(n):
    if len(n) < 5 or len(n) > 60: return False
    if len(n.split()) < 2: return False
    low = n.lower()
    bad_kws = ['compliance', 'rule', 'meet', 'total', 'promoter', 'company', 'board', 'listing', 'equity', 'shares', 'stock', 'exchange', 'decide', 'business', 'financial', 'statement', 'director', 'officer', 'manager', 'placement', 'issue']
    if any(kw in low for kw in bad_kws): return False
    caps = sum(1 for w in n.split() if w and w[0].isupper())
    if caps < 2: return False
    return True

import requests

url = "https://www.bseindia.com/corporates/download/337336/IPO%20BasisOfAllotment/Pace%20Digitek%20Limited%20-%20Signed%20Prospectus-30092025_20251001150218.pdf"
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content
print(f"Downloaded PDF size: {len(pdf_bytes)}")

investors_dict = {}

with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
    in_share_history = False
    for i, page in enumerate(pdf.pages[:150]):
        text = page.extract_text()
        if not text:
            continue
        text_lower = text.lower()
        if ('history of equity' in text_lower or 
            'build up' in text_lower or
            'equity share capital' in text_lower or
            'capital structure' in text_lower):
            in_share_history = True
            
        has_target = bool(re.search(r'pre-ipo|pre ipo|preferential allotment|private placement|major shareholders', text_lower))
        
        if not (in_share_history and has_target):
            continue
            
        print(f"PAGE {i}: in_share_history={in_share_history}, has_target={has_target}")
        
        lines = text.split('\n')
        for line in lines:
            for match in re.finditer(r'([\d,]+)\s+(?:Equity\s+)?(?:shares|Shares)(?:\s+were\s+allotted)?\s+to\s+(?:m/s\.?\s+)?([A-Z][A-Za-z\s\.\&\,\-\(\)]+?)(?:;|(?=\s+\(|$))', line, re.IGNORECASE):
                name = match.group(2).strip()
                print(f"PAGE {i} RAW MATCH: {name}")
                if is_valid_investor_name(name):
                    investors_dict[name.lower()] = name

print("FINAL DICT:", investors_dict)
