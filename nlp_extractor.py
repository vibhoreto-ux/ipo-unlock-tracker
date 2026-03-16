import sys
import json
import argparse
import requests
import pdfplumber
import re
from io import BytesIO

def extract_preipo_names(pdf_bytes):
    """
    Extract Pre-IPO investor names from the final RHP PDF.
    
    Note: DRHPs (Draft Red Herring Prospectus) typically only say the company
    "may consider" a Pre-IPO Placement. Actual investor names only appear
    in the final RHP after the placement is completed.
    
    Strategy:
    1. First check if the PDF is a DRHP (draft) — if so, pre-IPO data won't exist
    2. Look for 'History of Equity Share Capital' or 'Build Up of Equity Share Capital'
       tables which list allotments including pre-IPO placements
    3. Extract investor names from rows that mention 'pre-ipo' or 'private placement'
    """
    try:
        investors_dict = {}
        is_drhp = False
        
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            in_share_history = False
            for i, page in enumerate(pdf.pages[:150]):
                text = page.extract_text()
                if not text:
                    continue
                
                text_lower = text.lower()
                
                # Turn on the flag if we see the section header
                if ('history of equity' in text_lower or 
                    'build up' in text_lower or
                    'equity share capital' in text_lower or
                    'capital structure' in text_lower):
                    in_share_history = True
                
                has_target = bool(re.search(r'pre-ipo|pre ipo|preferential allotment|private placement', text_lower))
                
                if not (in_share_history and has_target):
                    continue
                
                lines = text.split('\n')
                for line in lines:
                    line_lower = line.lower()
                    if not re.search(r'pre-ipo|pre ipo|preferential allotment|private placement', line_lower):
                        continue
                    
                    # Capture grouped Private Placement rows (e.g. "Private Placement **** 40,19,326 10/- 120/- Cash ... 42")
                    # Looking for: Label + Shares + Face Value + Issue Price + Consideration + ... + Number of Allottees
                    grouped_match = re.search(r'(private placement|preferential allotment)[\*#\^]*\s+([\d,]+)\s+[\d\.]+/-\s+([\d\.]+)/-\s+cash.*?\s+(\d+)\s*$', line_lower)
                    if grouped_match:
                        label = grouped_match.group(1).title()
                        shares_str = grouped_match.group(2)
                        price_str = grouped_match.group(3)
                        investors_count = grouped_match.group(4)
                        
                        shares_num = int(shares_str.replace(',', ''))
                        if shares_num > 10000: # Only care about meaningful placements
                            rep_key = f"grouped_{shares_num}"
                            investors_dict[rep_key] = f"{label} of {shares_str} shares to {investors_count} investors (@ ₹{price_str})"
                            continue

                    # Common format: "Allotment to XYZ Fund pursuant to Pre-IPO Placement"
                    name_match = re.search(r'(?:to|by)\s+([A-Z][A-Za-z\s\.,]+?)(?:\s+(?:pursuant|under|through|vide|on|at|aggregating))', line)
                    if name_match:
                        name = name_match.group(1).strip()
                        if len(name) > 4 and len(name.split()) >= 2 and not any(kw in name.lower() for kw in ['compliance', 'rule', 'meet', 'fund requirement']):
                            investors_dict[name.lower()] = name
                    
                    # Alternative: "Name | shares | price | Pre-IPO Placement"
                    name_match2 = re.match(r'^([A-Z][A-Za-z\s\.,&]+?)\s+[\d,]+\s', line)
                    if name_match2:
                        name = name_match2.group(1).strip()
                        if len(name) > 4 and len(name.split()) >= 2 and not any(kw in name.lower() for kw in ['total', 'promoter', 'compliance', 'rule', 'meet']):
                            investors_dict[name.lower()] = name

                    # Alternative 3: "Preferential allotment of [x] Equity Shares to Mr. John Doe"
                    name_match3 = re.search(r'to\s+(?:mr\.|mrs\.|ms\.|m/s\.)?\s*([A-Z][A-Za-z\s\.,&]+?)(?:\s+for|\s+at|\s+aggregating|\.|$)', line, re.IGNORECASE)
                    if name_match3:
                        name = name_match3.group(1).strip()
                        if len(name) > 4 and len(name.split()) >= 2 and not any(kw in name.lower() for kw in ['promoter', 'company', 'board', 'compliance', 'rule', 'meet']):
                            investors_dict[name.lower()] = name
        
        return list(investors_dict.values())
    except Exception as e:
        return []


def main():
    parser = argparse.ArgumentParser(description="Extract Pre-IPO investors from RHP PDF")
    parser.add_argument("--ipo_name", help="(Deprecated) Anchor investors now extracted via Node.js")
    parser.add_argument("--is_sme", action="store_true", help="(Deprecated)")
    parser.add_argument("--rhp", help="URL of RHP PDF")
    
    args = parser.parse_args()
    
    result = {
        "anchorInvestors": [],
        "preIpoInvestors": []
    }
    
    if args.rhp:
        headers = {'User-Agent': 'Mozilla/5.0'}
        try:
            r = requests.get(args.rhp, headers=headers, timeout=30)
            if r.status_code == 200:
                result["preIpoInvestors"] = extract_preipo_names(r.content)
        except Exception:
            pass
            
    print(json.dumps(result))

if __name__ == "__main__":
    main()
