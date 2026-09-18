import json
import os
import re
import fitz
import requests
import io

DB_PATH = "data/unlock-data.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}

def clean_name(n):
    n = re.sub(r'^\d+[\.\)]\s*', '', n).strip()
    n = re.sub(r'[\,\:\;]$', '', n).strip()
    n = re.sub(r'\s+', ' ', n)
    return n

def parse_cap_structure_from_pdf(pdf_bytes, company_name, ipo_price):
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        print(f"  Failed to open PDF for {company_name}: {e}")
        return None, None

    cap_pages = []
    for i, page in enumerate(doc):
        txt = page.get_text().lower()
        if "capital structure" in txt and any(k in txt for k in [
            "equity share capital", "notes to the capital structure", "history of", "preferential allotment", "pre-ipo placement"
        ]):
            cap_pages.append(i)

    if not cap_pages:
        # Search anywhere in first 120 pages
        for i in range(min(120, len(doc))):
            txt = doc[i].get_text().lower()
            if "history of the equity share capital" in txt or "notes to the capital structure" in txt:
                cap_pages.append(i)

    if not cap_pages:
        return None, None

    start_page = cap_pages[0]
    end_page = min(start_page + 25, len(doc))
    
    full_text = ""
    for p in range(start_page, end_page):
        full_text += f"\n--- PAGE {p+1} ---\n" + doc[p].get_text()

    # Extract WACA
    waca = None
    waca_match = re.search(r'(?:weighted\s+average\s+cost\s+of\s+acquisition|waca)[\s\:\–\—\=]+(?:₹|rs\.?)?\s*([\d\.]+)', full_text, re.IGNORECASE)
    if waca_match:
        try:
            waca = float(waca_match.group(1))
        except:
            pass

    # Extract preferential / pre-IPO allotments with dates, prices, names
    investors = []
    seen = set()

    # Split by allotment notes or rows
    # Look for allotment paragraphs or table lines: e.g. "Allotment of ... on [Date] at a price of ₹[Price] ... to [Names]"
    allotment_matches = re.finditer(r'(?:allotment|issued|allotted)\s+(?:of\s+)?([\d\,]+)\s+(?:equity\s+shares|shares).*?(?:on\s+([A-Za-z]+\s+\d{1,2}\,\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\,\s+\d{4}|\d{1,2}[\/\-\.][A-Za-z0-9]+[\/\-\.]\d{2,4})).*?(?:price\s+of|at\s+₹|at\s+rs\.?|face\s+value\s+of\s+₹\s*\d+\s+and\s+a\s+premium\s+of\s+₹)\s*([\d\.]+)?', full_text, re.DOTALL | re.IGNORECASE)

    # Let's also do a structured regex for table rows of history of equity capital
    # Date | No of Shares | Face Value | Issue Price | Nature | Consideration
    date_regex = r'([A-Za-z]+\s+\d{1,2}\,\s+\d{4}|\d{1,2}\s+[A-Za-z]+\,\s+\d{4}|\d{1,2}[\-\/][A-Za-z]{3}[\-\/]\d{2,4}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4})'
    
    # Check for non-promoter private placement / preferential allotment notes
    notes = re.split(r'\n(?:\d+\.|\([a-z]\)|\([ivx]+\))\s+', full_text)
    
    for note in notes:
        if not any(k in note.lower() for k in ['preferential', 'private placement', 'pre-ipo', 'allotment of', 'strategic']):
            continue
        
        # Check date
        d_match = re.search(date_regex, note)
        allot_date = d_match.group(1) if d_match else 'Pre-IPO'
        
        # Check price
        p_match = re.search(r'(?:price\s+of|issue\s+price\s+of|at\s+(?:a\s+price\s+of\s+)?(?:₹|rs\.?)?)\s*([\d\.]+)', note, re.IGNORECASE)
        prem_match = re.search(r'premium\s+of\s+(?:₹|rs\.?)?\s*([\d\.]+)', note, re.IGNORECASE)
        fv_match = re.search(r'face\s+value\s+of\s+(?:₹|rs\.?)?\s*([\d\.]+)', note, re.IGNORECASE)
        
        price = None
        if p_match:
            try:
                price = float(p_match.group(1))
            except:
                pass
        elif prem_match:
            try:
                prem = float(prem_match.group(1))
                fv = float(fv_match.group(1)) if fv_match else 10.0
                price = fv + prem
            except:
                pass
                
        if price is None and waca:
            price = waca

        # Extract shares
        s_match = re.search(r'([\d\,]+)\s+(?:equity\s+shares|shares)', note, re.IGNORECASE)
        shares_str = s_match.group(1) if s_match else '—'

        # Look for names in the note
        lines = [l.strip() for l in note.split('\n') if len(l.strip()) > 3]
        for line in lines:
            if re.search(r'\b(capital|fund|investments|holdings|limited|ltd|pvt|llp|trust|sharma|patel|gupta|singh|shah|jain|mehta|agarwal|bansal|mishra|joshi|kumar|devi|enterprises|ventures)\b', line, re.IGNORECASE):
                if any(h in line.lower() for h in ['nature of', 'date of', 'name of', 'cumulative', 'details of', 'allotment pursuant', 'registered valuer', 'equity share capital', 'table', 'sr no']):
                    continue
                c_name = clean_name(line)
                if len(c_name) > 3 and len(c_name) < 70 and c_name not in seen:
                    # Filter out promoters if identifiable
                    seen.add(c_name)
                    disc = None
                    if ipo_price and price:
                        try:
                            disc = round(((price - ipo_price) / ipo_price) * 100, 1)
                        except:
                            disc = None
                    investors.append({
                        "name": c_name,
                        "category": "Pre-IPO Private Placement",
                        "date": allot_date,
                        "shares": shares_str,
                        "buyPrice": price,
                        "acquisitionPrice": price,
                        "discount": disc,
                        "discountPct": disc,
                        "lockInExpiry": "1 Year from Listing"
                    })

    return investors, waca

def main():
    with open(DB_PATH, 'r') as f:
        db = json.load(f)

    companies = db.get('companies', [])

    # Find open/upcoming companies
    for c in companies:
        name = c.get('companyName', '')
        rhp_url = c.get('rhpUrl') or c.get('capitalStructureUrl')
        ipo_price = c.get('issuePrice') or c.get('price')
        
        # Check if pre-IPO is empty or raw strings
        pre_ipo = c.get('preIpoInvestors', [])
        needs_update = False
        if not pre_ipo or len(pre_ipo) == 0:
            needs_update = True
        elif isinstance(pre_ipo[0], str):
            needs_update = True
        elif any(inv.get('buyPrice') is None or inv.get('date') in [None, '—', 'Pre-IPO Round'] for inv in pre_ipo):
            needs_update = True

        # Only process if we have a PDF URL
        if needs_update and rhp_url and (rhp_url.endswith('.pdf') or 'assets.ipopremium.in' in rhp_url or 'chittorgarh' in rhp_url or 'sarthi.in' in rhp_url):
            print(f"Processing {name} ({rhp_url})...")
            try:
                r = requests.get(rhp_url, headers=HEADERS, timeout=20)
                if r.status_code == 200 and (b'%PDF' in r.content[:20] or r.headers.get('content-type', '').startswith('application/pdf')):
                    invs, waca = parse_cap_structure_from_pdf(r.content, name, ipo_price)
                    if invs and len(invs) > 0:
                        print(f"  -> Extracted {len(invs)} Pre-IPO investors (WACA: {waca})")
                        c['preIpoInvestors'] = invs
                        if waca:
                            c['waca'] = waca
            except Exception as ex:
                print(f"  Error processing {name}: {ex}")

    with open(DB_PATH, 'w') as f:
        json.dump(db, f, indent=2)

    print("Finished updating database!")

if __name__ == '__main__':
    main()
