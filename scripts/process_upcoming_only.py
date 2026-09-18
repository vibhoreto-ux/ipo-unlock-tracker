import json
import os
import re
import fitz
import requests
from datetime import datetime

DB_PATH = "data/unlock-data.json"
SCRATCH_DIR = "scratch/upcoming_rhp"
os.makedirs(SCRATCH_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}

def clean_name(n):
    n = re.sub(r'^\d+[\.\)]\s*', '', n).strip()
    n = re.sub(r'[\,\:\;]$', '', n).strip()
    n = re.sub(r'\s+', ' ', n)
    return n

def extract_pdf_data(pdf_path, company_name, ipo_price):
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        print(f"Error opening {pdf_path}: {e}")
        return [], None

    cap_pages = []
    for i, p in enumerate(doc):
        t = p.get_text().lower()
        if "capital structure" in t or "history of" in t or "preferential allotment" in t:
            cap_pages.append(i)

    if not cap_pages:
        for i in range(min(120, len(doc))):
            t = doc[i].get_text().lower()
            if "history of the equity share capital" in t or "notes to the capital structure" in t:
                cap_pages.append(i)

    if not cap_pages:
        return [], None

    start_page = max(0, cap_pages[0] - 1)
    end_page = min(start_page + 30, len(doc))

    text_pages = []
    for p in range(start_page, end_page):
        text_pages.append(doc[p].get_text())

    full_text = "\n".join(text_pages)

    # 1. Search WACA
    waca = None
    waca_m = re.search(r'(?:weighted\s+average\s+cost\s+of\s+acquisition|waca)[\s\:\–\—\=]+(?:₹|rs\.?)?\s*([\d\.]+)', full_text, re.IGNORECASE)
    if waca_m:
        try:
            waca = float(waca_m.group(1))
        except:
            pass

    # 2. Extract allotments with date, shares, price, and allottee names
    investors = []
    seen = set()

    # Look for allotment paragraphs or notes
    notes = re.split(r'\n(?:\d+\.|\([a-z]\)|\([ivx]+\))\s+', full_text)
    
    date_regex = r'([A-Za-z]+\s+\d{1,2}\,\s+\d{4}|\d{1,2}\s+[A-Za-z]+\,\s+\d{4}|\d{1,2}[\-\/][A-Za-z]{3}[\-\/]\d{2,4}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4})'
    
    for note in notes:
        if not any(k in note.lower() for k in ['allotment', 'preferential', 'private placement', 'pre-ipo', 'strategic', 'series']):
            continue
        
        # Check date
        d_m = re.search(date_regex, note)
        allot_date = d_m.group(1) if d_m else None
        
        # Check price
        price = None
        p_m = re.search(r'(?:issue\s+price\s+of|price\s+of|at\s+(?:a\s+price\s+of\s+)?(?:₹|rs\.?)?)\s*([\d\.]+)', note, re.IGNORECASE)
        prem_m = re.search(r'premium\s+of\s+(?:₹|rs\.?)?\s*([\d\.]+)', note, re.IGNORECASE)
        fv_m = re.search(r'face\s+value\s+of\s+(?:₹|rs\.?)?\s*([\d\.]+)', note, re.IGNORECASE)

        if p_m:
            try:
                price = float(p_m.group(1))
            except:
                pass
        elif prem_m:
            try:
                fv = float(fv_m.group(1)) if fv_m else 10.0
                prem = float(prem_m.group(1))
                price = fv + prem
            except:
                pass
                
        if price is None and waca:
            price = waca

        # Shares
        s_m = re.search(r'([\d\,]+)\s+(?:equity\s+shares|shares)', note, re.IGNORECASE)
        shares_str = s_m.group(1) if s_m else '—'

        # Look for names in the note
        lines = [l.strip() for l in note.split('\n') if len(l.strip()) > 3]
        for line in lines:
            if re.search(r'\b(capital|fund|investments|holdings|limited|ltd|pvt|llp|trust|sharma|patel|gupta|singh|shah|jain|mehta|agarwal|bansal|mishra|joshi|kumar|devi|enterprises|ventures|enterprises|infra|industries|corp)\b', line, re.IGNORECASE):
                if any(h in line.lower() for h in ['nature of', 'date of', 'name of', 'cumulative', 'details of', 'allotment pursuant', 'registered valuer', 'equity share capital', 'table', 'sr no', 'resolution passed']):
                    continue
                c_name = clean_name(line)
                if len(c_name) > 3 and len(c_name) < 70 and c_name not in seen:
                    # Filter out obvious company name itself
                    if company_name.lower().split()[0] in c_name.lower():
                        continue
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
                        "date": allot_date or "Pre-IPO",
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
    today = datetime(2026, 9, 18)

    # Filter upcoming and open IPOs
    upcoming_list = []
    for c in companies:
        if 'invit' in c.get('companyName', '').lower():
            continue
        ad = c.get('allotmentDate')
        list_date_str = None
        if isinstance(ad, dict):
            list_date_str = ad.get('adjusted') or ad.get('original')
        elif isinstance(ad, str):
            list_date_str = ad
        
        if not list_date_str:
            ld = c.get('listingDate')
            if ld:
                list_date_str = ld[:10]
        
        is_upcoming = False
        if not list_date_str:
            is_upcoming = True
        else:
            try:
                ld_dt = datetime.strptime(list_date_str[:10], '%Y-%m-%d')
                if ld_dt > today:
                    is_upcoming = True
            except:
                is_upcoming = True
        
        if is_upcoming:
            upcoming_list.append(c)

    print(f"Processing {len(upcoming_list)} Upcoming/Open IPOs...")

    for c in upcoming_list:
        name = c.get('companyName')
        # Skip Hero Motors, A-One Steels, NSE since they are already fully detailed
        if any(k in name.lower() for k in ['a-one steels', 'hero motors', 'national stock exchange', 'axiom gas']):
            print(f"Skipping already verified: {name}")
            continue

        rhp_url = c.get('rhpUrl') or c.get('capitalStructureUrl')
        ipo_price = c.get('issuePrice') or c.get('price')

        if not rhp_url:
            print(f"No RHP URL for {name}")
            continue

        # Download PDF to scratch
        safe_name = re.sub(r'[^a-zA-Z0-9]', '_', name)
        pdf_path = os.path.join(SCRATCH_DIR, f"{safe_name}.pdf")

        if not os.path.exists(pdf_path):
            print(f"Downloading RHP for {name} from {rhp_url}...")
            try:
                r = requests.get(rhp_url, headers=HEADERS, timeout=25)
                if r.status_code == 200 and (b'%PDF' in r.content[:20] or r.headers.get('content-type', '').startswith('application/pdf')):
                    with open(pdf_path, 'wb') as pf:
                        pf.write(r.content)
                else:
                    print(f"  Failed download (status {r.status_code}) for {name}")
                    continue
            except Exception as ex:
                print(f"  Download error for {name}: {ex}")
                continue

        # Parse downloaded PDF
        invs, waca = extract_pdf_data(pdf_path, name, ipo_price)
        if invs and len(invs) > 0:
            print(f"  -> {name}: Extracted {len(invs)} Pre-IPO investors (WACA: {waca})")
            c['preIpoInvestors'] = invs
            if waca:
                c['waca'] = waca
        else:
            print(f"  -> {name}: No private placement pre-IPO allottees found (only promoter/early equity)")

    with open(DB_PATH, 'w') as f:
        json.dump(db, f, indent=2)

    print("Completed processing all upcoming and open IPOs!")

if __name__ == '__main__':
    main()
