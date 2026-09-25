import json
import os
import re
import fitz
import requests
import zipfile
import io

with open("data/unlock-data.json") as f:
    db = json.load(f)

targets = [
  "Airfloa Rail Technology Ltd.", "L.T.Elevator Ltd.", "TechD Cybersecurity Ltd. IPO (TechDefence Labs IPO)",
  "Sampat Aluminium Ltd.", "JD Cables Ltd.", "Matrix Geo Solutions Ltd.", "Ecoline Exim Ltd.",
  "Rajputana Stainless Ltd.", "Innovision Ltd.", "GSP Crop Science Ltd.", "Praruh Technologies Ltd.",
  "Gurunanak Agriculture India Ltd.", "Justo Realfintech Ltd.", "Systematic Industries Ltd.",
  "True Colors Ltd.", "Aptus Pharma Ltd.", "BharatRohan Airborne Innovations Ltd.",
  "Solvex Edibles Ltd.", "Siddhi Cotspin Ltd.", "Central Mine Planning & Design Institute Ltd."
]

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

for name in targets:
    c = next((x for x in db["companies"] if x["companyName"] == name or name.split()[0].lower() in x["companyName"].lower()), None)
    if not c:
        print(f"=== {name} NOT FOUND ===")
        continue
    cname = c["companyName"]
    ip = c.get("issuePrice")
    print(f"\n=== Processing: {cname} (Issue Price: Rs {ip}) ===")
    url = c.get("capitalStructureUrl") or c.get("rhpUrl")
    print(f"  URL: {url}")
    if not url:
        print("  No document URL found")
        continue
    try:
        r = requests.get(url, headers=headers, timeout=30)
        print(f"  Status: {r.status_code}, Length: {len(r.content)} bytes")
        pdf_bytes = None
        if "zip" in url.lower() or r.content.startswith(b"PK"):
            z = zipfile.ZipFile(io.BytesIO(r.content))
            for n in z.namelist():
                if n.lower().endswith(".pdf"):
                    pdf_bytes = z.read(n)
                    break
        elif r.content.startswith(b"%PDF"):
            pdf_bytes = r.content
        
        if pdf_bytes:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            print(f"  PDF opened! Pages: {len(doc)}")
            # search for capital structure pages
            cap_pages = []
            for i, page in enumerate(doc):
                txt = page.get_text()
                if "capital structure" in txt.lower() or "pre-ipo placement" in txt.lower() or "history of equity" in txt.lower():
                    cap_pages.append(i)
            print(f"  Capital Structure matches on pages: {cap_pages[:5]}")
            
            # Extract sample text from first matching page
            if cap_pages:
                sample_txt = doc[cap_pages[0]].get_text()
                # find any WACA or pricing lines
                waca_lines = [line.strip() for line in sample_txt.split("\n") if any(k in line.lower() for k in ["waca", "acquisition", "cost", "weighted", "preferential", "placement"])]
                print(f"  Sample keywords: {waca_lines[:4]}")
        else:
            print("  Could not obtain PDF bytes")
    except Exception as e:
        print(f"  Error: {e}")
