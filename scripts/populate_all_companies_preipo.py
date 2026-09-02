import json
import os
import re
import fitz
import requests
import zipfile
import io
import urllib.parse
from bs4 import BeautifulSoup

DB_PATH = "data/unlock-data.json"

def get_headers():
    return {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }

def normalize_text(t):
    return re.sub(r'\s+', ' ', t).strip()

def download_pdf_or_zip(url):
    try:
        r = requests.get(url, headers=get_headers(), timeout=25)
        if r.status_code != 200:
            return None
        content_type = r.headers.get("content-type", "").lower()
        if "zip" in content_type or url.lower().endswith(".zip"):
            z = zipfile.ZipFile(io.BytesIO(r.content))
            for name in z.namelist():
                if name.lower().endswith(".pdf") and ("rhp" in name.lower() or "prospectus" in name.lower() or "capital" in name.lower()):
                    return z.read(name)
            # fallback to largest pdf in zip
            pdfs = [n for n in z.namelist() if n.lower().endswith(".pdf")]
            if pdfs:
                largest = max(pdfs, key=lambda n: len(z.read(n)))
                return z.read(largest)
        elif "pdf" in content_type or url.lower().endswith(".pdf") or r.content.startswith(b'%PDF'):
            return r.content
    except Exception as e:
        pass
    return None

def extract_preipo_from_pdf_bytes(pdf_bytes, company_name, ipo_price):
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        return None, None

    # Search for Capital Structure / History of Equity Share Capital
    cap_page_indices = []
    for i, page in enumerate(doc):
        txt = page.get_text()
        if any(w in txt.lower() for w in [
            "notes to the capital structure",
            "notes to capital structure",
            "history of the equity share capital",
            "history of equity share capital",
            "equity share capital history",
            "details of pre-ipo placement",
            "details of preferential allotment"
        ]):
            cap_page_indices.append(i)

    if not cap_page_indices:
        return None, None

    # Collect text from capital structure pages
    cap_text = ""
    start_idx = cap_page_indices[0]
    for j in range(start_idx, min(start_idx + 18, len(doc))):
        cap_text += doc[j].get_text() + "\n"

    investors = []
    waca = None

    # Search for WACA in text
    waca_match = re.search(r'(?:weighted\s+average\s+cost\s+of\s+acquisition|waca)[\s\:\–\—\=]+(?:₹|rs\.?)?\s*([\d\.]+)', cap_text, re.IGNORECASE)
    if waca_match:
        try:
            waca = float(waca_match.group(1))
        except:
            pass

    # Find preferential / non-promoter allotments in notes
    # Pattern e.g. "Allotment of X Equity Shares ... to [Name]" or table rows
    allotment_sections = re.split(r'(?:\n\d+\.|\n\([a-z]\)|\n\([ivx]+\))\s+', cap_text)
    
    seen_names = set()

    for sec in allotment_sections:
        if not any(k in sec.lower() for k in ["preferential", "private placement", "pre-ipo", "allotment of", "series"]):
            continue
        
        # Look for shares and price
        price_match = re.search(r'(?:issue\s+price|at\s+a\s+price|price\s+of|premium\s+of)\s+(?:of\s+)?(?:₹|rs\.?)?\s*([\d\.]+)', sec, re.IGNORECASE)
        shares_match = re.search(r'([\d\,]+)\s+(?:equity|preference|series|ccps|equity\s+shares)', sec, re.IGNORECASE)
        
        # Look for person/fund names in the section
        lines = [l.strip() for l in sec.split("\n") if len(l.strip()) > 3]
        for line in lines:
            # Check if line looks like an entity or person name
            if re.search(r'\b(capital|fund|investments|holdings|limited|pvt|llp|trust|sharma|patel|gupta|singh|shah|jain|mehta|agarwal)\b', line, re.IGNORECASE):
                # Filter out generic table headers
                if any(hdr in line.lower() for hdr in ["nature of", "date of", "name of", "cumulative", "details of", "allotment pursuant", "registered valuer", "equity share capital"]):
                    continue
                clean_name = re.sub(r'^\d+[\.\)]\s*', '', line).strip()
                clean_name = re.sub(r'[\,\:\;]$', '', clean_name).strip()
                if len(clean_name) > 3 and len(clean_name) < 75 and clean_name not in seen_names:
                    seen_names.add(clean_name)
                    
                    price = float(price_match.group(1)) if price_match else (waca if waca else 10.0)
                    shares_str = shares_match.group(1) if shares_match else "—"
                    
                    disc = None
                    if ipo_price and price:
                        disc = round(((price - ipo_price) / ipo_price) * 100, 1)
                        
                    investors.append({
                        "name": clean_name,
                        "category": "Pre-IPO Allottee / Strategic Investor",
                        "date": "Pre-IPO Round",
                        "shares": shares_str,
                        "price": price,
                        "discount": disc,
                        "percentage": None
                    })

    return investors, waca

def run_batch_populator():
    with open(DB_PATH, "r") as f:
        db = json.load(f)

    companies = db.get("companies", [])
    print(f"Total companies in database: {len(companies)}")

    updated_count = 0

    for idx, c in enumerate(companies):
        cname = c.get("companyName", "")
        # Only process if preIpoInvestors is missing or empty
        existing = c.get("preIpoInvestors")
        if existing and len(existing) > 0:
            continue

        target_url = c.get("capitalStructureUrl") or c.get("rhpUrl")
        
        # If no direct URL, check if Chittorgarh URL can yield a document link
        if not target_url and c.get("chittorgarhUrl"):
            try:
                ch_url = c.get("chittorgarhUrl")
                r = requests.get(ch_url, headers=get_headers(), timeout=12)
                if r.status_code == 200:
                    soup = BeautifulSoup(r.text, "html.parser")
                    for a in soup.find_all("a", href=True):
                        href = a["href"]
                        txt = a.get_text(strip=True).lower()
                        if (href.startswith("http") and (href.endswith(".pdf") or href.endswith(".zip"))) or "sebi.gov.in" in href or "bseindia.com" in href:
                            if "rhp" in txt or "prospectus" in txt or "rhp" in href.lower():
                                target_url = href
                                c["rhpUrl"] = href
                                c["capitalStructureUrl"] = href
                                break
            except:
                pass

        if not target_url:
            continue

        print(f"[{idx+1}/{len(companies)}] Processing {cname} from {target_url[:60]}...")
        
        pdf_bytes = download_pdf_or_zip(target_url)
        if not pdf_bytes:
            continue

        ipo_price = c.get("issuePrice")
        investors, waca = extract_preipo_from_pdf_bytes(pdf_bytes, cname, ipo_price)

        if investors and len(investors) > 0:
            c["preIpoInvestors"] = investors[:15] # top 15
            if waca and not c.get("preIpoWaca"):
                c["preIpoWaca"] = waca
            if not c.get("capitalStructureUrl"):
                c["capitalStructureUrl"] = target_url
            updated_count += 1
            print(f"  -> Extracted {len(investors)} pre-IPO investors for {cname}")

    with open(DB_PATH, "w") as f:
        json.dump(db, f, indent=2)

    print(f"\n==================== FINISHED! Updated {updated_count} companies ====================")

if __name__ == "__main__":
    run_batch_populator()
