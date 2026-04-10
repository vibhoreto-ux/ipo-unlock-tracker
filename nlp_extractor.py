import sys
import json
import argparse
import requests
import pdfplumber
import re
from io import BytesIO

def extract_preipo_names(pdf_bytes, company_name=None):
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
        def is_valid_investor_name(n):
            if len(n) < 5 or len(n) > 60: return False
            if len(n.split()) < 2: return False
            low = n.lower()
            bad_kws = ['compliance', 'rule', 'meet', 'total', 'promoter', 'company', 'board', 'listing', 'equity', 'shares', 'stock', 'exchange', 'decide', 'business', 'financial', 'statement', 'director', 'officer', 'manager', 'placement', 'issue', 'cash', 'operating', 'activities', 'fiscal', 'shareholders', 'terms', 'herring', 'pursuant', 'accordance', 'regulation', 'net', 'gross', 'value']
            if any(kw in low.split() for kw in bad_kws): return False
            
            words = [w for w in n.split() if w.strip()]
            cap_words = sum(1 for w in words if w and (w.istitle() or w.isupper() or w[0].isupper()))
            if cap_words / len(words) < 0.5: 
                return False
            
            return True
        
        base_company_word = ""
        if company_name:
            # Get the first main word of the company to filter promoters (e.g. "Tankup")
            parts = [p.lower() for p in company_name.split() if len(p) > 2 and p.lower() not in ['the', 'and', 'ltd', 'limited', 'private']]
            if parts:
                base_company_word = parts[0]
        
                
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            in_share_history = False
            parse_window_left = 0
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
                
                if re.search(r'pre-ipo|pre ipo|preferential allotment|private placement|major shareholders', text_lower):
                    parse_window_left = 5
                elif re.search(r'(?:^\d+\.\s+)?[A-Z][A-Za-z\s\.,&]+?\s+[\d,]+\s+[\d\.]+%', text):
                    parse_window_left = 5
                
                if not (in_share_history and parse_window_left > 0):
                    continue
                
                parse_window_left -= 1
                
                # Snatch floating prices that wrap across newlines before the table
                current_context_price = None
                text_flat = text_lower.replace('\n', ' ')
                
                ip_match_global = re.search(r'(?:issue price|price of|at a price)\s*(?:of\s*)?(?:(?:inr|rs\.?|₹)\s*)?([\d\.]+)', text_flat)
                if ip_match_global:
                    try:
                        val = float(ip_match_global.group(1))
                        if 10 <= val <= 5000:
                            current_context_price = f" (₹{val:g})"
                    except: pass
                
                if not current_context_price:
                    prem_match_global = re.search(r'premium of\s*(?:(?:inr|rs\.?|₹)\s*)?([\d\.]+)', text_flat)
                    if prem_match_global:
                        try:
                            val = float(prem_match_global.group(1))
                            if 1 <= val <= 5000:
                                current_context_price = f" (₹{val+10:g})"
                        except: pass
                
                # Also use table extraction to catch secondary transfers wrapped in columns
                tables = page.extract_tables()
                if tables:
                    fund_kws = ['fund', 'ventures', 'capital', 'opportunities', 'limited', 'ltd', 'pvt', 'private', 'investment', 'llp', 'trust', 'holdings', 'advisors', 'partners', 'ccv', 'finavenue']
                    ignore_exact = ["authorized share capital", "offer capital", "capital (₹)", "capital", "equity share capital", "issued, subscribed", "offer equity"]
                    for table in tables:
                        for row in table:
                            for cell in row:
                                if cell and isinstance(cell, str):
                                    cell_clean = re.sub(r'\s+', ' ', cell).strip()
                                    if 5 < len(cell_clean) < 100:
                                        # Filter out headers containing generic phrasing
                                        lower_c = cell_clean.lower()
                                        if any(ignore in lower_c for ignore in ignore_exact):
                                            continue
                                        if any(kw in lower_c.split() for kw in fund_kws):
                                            # ensure it is capitalized properly, ignore full lowercase
                                            if re.match(r'^[A-Z]', cell_clean):
                                                # remove "transfer to " if present
                                                name = re.sub(r'^Transfer to\s+', '', cell_clean, flags=re.IGNORECASE)
                                                name = re.sub(r'^Allotment to\s+', '', name, flags=re.IGNORECASE)
                                                
                                                price_str = None
                                                for other_cell in row:
                                                    if other_cell and isinstance(other_cell, str) and other_cell != cell:
                                                        oc_clean = re.sub(r'\s+', '', other_cell)
                                                        if re.match(r'^₹?\d{2,4}(?:\.\d{1,2})?$', oc_clean):
                                                            pval_str = re.sub(r'[^0-9.]', '', oc_clean)
                                                            if pval_str:
                                                                try:
                                                                    pval = float(pval_str)
                                                                    if 10 <= pval <= 5000:
                                                                        price_str = f"₹{pval:g}"
                                                                except:
                                                                    pass
                                                
                                                if not is_valid_investor_name(name):
                                                    continue
                                                    
                                                if price_str:
                                                    investors_dict[name.lower()] = f"{name} ({price_str})"
                                                elif current_context_price:
                                                    investors_dict[name.lower()] = f"{name}{current_context_price}"
                                                else:
                                                    investors_dict[name.lower()] = name
                
                lines = text.split('\n')
                for line in lines:
                    line_lower = line.lower()
                    
                    # Capture grouped Private Placement rows (e.g. "Private Placement **** 40,19,326 10/- 120/- Cash ... 42")
                    grouped_match = re.search(r'(private placement|preferential allotment)[\*#\^]*\s+([\d,]+)\s+[\d\.]+/-\s+([\d\.]+)/-\s+cash.*?\s+(\d+)\s*$', line_lower)
                    if grouped_match:
                        label = grouped_match.group(1).title()
                        shares_str = grouped_match.group(2)
                        price_str = grouped_match.group(3)
                        investors_count = grouped_match.group(4)
                        
                        shares_num = int(shares_str.replace(',', ''))
                        if shares_num > 10000:
                            rep_key = f"grouped_{shares_num}"
                            investors_dict[rep_key] = f"{label} of {shares_str} shares to {investors_count} investors (@ ₹{price_str})"
                            continue

                    # Default helper to extract price from text line
                    price_suffix = current_context_price or ""
                    price_val_match = re.search(r'(?:at|price of)\s*(?:(?:inr|rs\.?|₹)\s*)?([\d\.]+)|(?:inr|rs\.?|₹)\s*([\d\.]+)[\s/-]|([\d\.]+)/-', line_lower)
                    if price_val_match:
                        extracted = price_val_match.group(1) or price_val_match.group(2) or price_val_match.group(3)
                        if extracted:
                            try:
                                pval = float(extracted)
                                if 10 <= pval <= 5000:
                                    price_suffix = f" (₹{pval:g})"
                            except:
                                pass

                    # Common format: Allotment to XYZ Fund pursuant to Pre-IPO Placement
                    name_match = re.search(r'(?:to|by)\s+([A-Z][A-Za-z\s\.,]+?)(?:\s+(?:pursuant|under|through|vide|on|at|aggregating))', line)
                    if name_match:
                        name = name_match.group(1).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = f"{name}{price_suffix}"
                    
                    # Alternative: "Name | shares | price | Pre-IPO Placement"
                    name_match2 = re.match(r'^([A-Z][A-Za-z\s\.,&]+?)\s+[\d,]+\s', line)
                    if name_match2:
                        name = name_match2.group(1).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = f"{name}{price_suffix}"

                    # Alternative 3: "Preferential allotment of [x] Equity Shares to Mr. John Doe"
                    name_match3 = re.search(r'to\s+(?:mr\.|mrs\.|ms\.|m/s\.)?\s*([A-Z][A-Za-z\s\.,&]+?)(?:\s+for|\s+at|\s+aggregating|\.|$)', line, re.IGNORECASE)
                    if name_match3:
                        name = name_match3.group(1).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = f"{name}{price_suffix}"

                    # Pace Digitek massive inline list: "(i) 238 Equity Shares to Mudduluru Dheeraj Varma;"
                    for match in re.finditer(r'([\d,]+)\s+(?:Equity\s+)?(?:shares|Shares)(?:\s+were\s+allotted)?\s+to\s+(?:m/s\.?\s+)?([A-Z][A-Za-z\s\.\&\,\-\(\)]+?)(?:;|(?=\s+\(|$))', line, re.IGNORECASE):
                        name = match.group(2).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = name
                            
                    # Yash Hitesh Patel "List of major shareholders" extraction: "5. Yash Hitesh Patel 2,00,000 3.11%"
                    sh_match = re.search(r'(?:^\d+\.\s+)?([A-Z][A-Za-z\s\.,&]+?)\s+([\d,]+)\s+[\d\.]+%', line)
                    if sh_match:
                        name = sh_match.group(1).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = name
        
        # Filter down names that represent just random text or promoters
        final_list = []
        base_clean = ""
        if base_company_word:
            base_clean = re.sub(r'[^a-z0-9]', '', base_company_word)

        for v in investors_dict.values():
            v_lower = v.lower()
            if 'total' in v_lower or 'promoter' in v_lower or 'share capital' in v_lower or 'paid-up' in v_lower:
                continue
            
            v_clean = re.sub(r'[^a-z0-9]', '', v_lower)
            if base_clean and base_clean in v_clean:
                continue
            
            final_list.append(v)

        waca_val = None
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            full_text = ""
            for i, page in enumerate(pdf.pages[:150]):
                t = page.extract_text()
                if t: full_text += t + "\n"
                
            tl = full_text.lower()
            w1 = re.search(r'last (?:1 year|18 months|3 years)\s+([\d\.]+)', tl)
            if w1: 
                waca_val = float(w1.group(1))
            else:
                w2 = re.search(r'average cost of acquisition.{0,150}?(\d+\.\d+)', tl, re.DOTALL)
                if w2: waca_val = float(w2.group(1))

        return { "investors": list(set(final_list)), "waca": waca_val }
    except Exception as e:
        import traceback
        sys.stderr.write(f"EXTRACTION ERROR: {e}\n")
        traceback.print_exc(file=sys.stderr)
        return { "investors": [], "waca": None }


def main():
    parser = argparse.ArgumentParser(description="Extract Pre-IPO investors from RHP PDF")
    parser.add_argument("--company_name", help="Pass the base company name to filter out related-party promoters")
    parser.add_argument("--ipo_name", help="(Deprecated) Anchor investors now extracted via Node.js")
    parser.add_argument("--is_sme", action="store_true", help="(Deprecated)")
    parser.add_argument("--rhp", help="URL of RHP PDF")
    
    args = parser.parse_args()
    
    result = {
        "anchorInvestors": [],
        "preIpoInvestors": [],
        "waca": None
    }
    
    if args.rhp:
        headers = {'User-Agent': 'Mozilla/5.0'}
        try:
            r = requests.get(args.rhp, headers=headers, timeout=30)
            if r.status_code == 200:
                extract_res = extract_preipo_names(r.content, args.company_name)
                result["preIpoInvestors"] = extract_res.get("investors", [])
                result["waca"] = extract_res.get("waca")
        except Exception:
            pass
            
    print(json.dumps(result))

if __name__ == "__main__":
    main()
