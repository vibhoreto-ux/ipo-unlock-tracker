import json
import os
import re
import fitz
import requests
import zipfile
import io

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def inspect_company_cap(name, url, issue_price):
    print(f"\n==========================================")
    print(f"=== {name} (Issue Price: Rs {issue_price}) ===")
    print(f"URL: {url}")
    if not url:
        print("No URL")
        return
    try:
        r = requests.get(url, headers=headers, timeout=30)
        pdf_bytes = None
        if "zip" in url.lower() or r.content.startswith(b"PK"):
            z = zipfile.ZipFile(io.BytesIO(r.content))
            for n in z.namelist():
                if n.lower().endswith(".pdf") and ("rhp" in n.lower() or "prospectus" in n.lower() or "capital" in n.lower()):
                    pdf_bytes = z.read(n)
                    break
            if not pdf_bytes:
                pdfs = [n for n in z.namelist() if n.lower().endswith(".pdf")]
                if pdfs:
                    pdf_bytes = z.read(max(pdfs, key=lambda n: len(z.read(n))))
        elif r.content.startswith(b"%PDF"):
            pdf_bytes = r.content
        
        if not pdf_bytes:
            print("Failed to get PDF bytes")
            return

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        print(f"PDF Opened: {len(doc)} pages")
        
        # Search for Capital Structure section
        cap_pages = []
        for idx, page in enumerate(doc):
            txt = page.get_text().lower()
            if "capital structure" in txt and ("section iv" in txt or "notes to" in txt or "equity share capital" in txt or "history of" in txt):
                cap_pages.append(idx)
        
        print(f"Capital Structure pages found: {cap_pages[:10]}")
        
        # Print text of first few capital structure pages
        for p_idx in cap_pages[:5]:
            p_text = doc[p_idx].get_text()
            print(f"\n--- Page {p_idx+1} ---")
            lines = [l.strip() for l in p_text.split("\n") if l.strip()]
            for line in lines[:25]:
                print("  ", line)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    targets = [
        ("TechD Cybersecurity Ltd.", "https://nsearchives.nseindia.com/emerge/corporates/content/TechDCybersecurityLimited_RHP.pdf", 193),
        ("L.T.Elevator Ltd.", "https://www.bseindia.com/downloads/ipo/RHP%20&%20GID_110920251506.zip", 78),
        ("Sampat Aluminium Ltd.", "https://www.bseindia.com/downloads/ipo/RHP%20&%20GID_160920251942.zip", 120),
        ("Matrix Geo Solutions Ltd.", "https://nsearchives.nseindia.com/content/ipo/RHP_MGSL.zip", 104),
        ("Ecoline Exim Ltd.", "https://nsearchives.nseindia.com/content/ipo/RHP_ECOLINE.zip", 141),
        ("Rajputana Stainless Ltd.", "https://www.sebi.gov.in/sebi_data/attachdocs/mar-2026/1772451212571.pdf", 122),
        ("Innovision Ltd.", "https://www.sebi.gov.in/sebi_data/attachdocs/mar-2026/1772604652364.pdf", 519),
        ("GSP Crop Science Ltd.", "https://www.sebi.gov.in/sebi_data/attachdocs/mar-2026/1773209595346.pdf", 320),
        ("Systematic Industries Ltd.", "https://www.sebi.gov.in/sebi_data/attachdocs/oct-2025/1759318215777_976.pdf", 195),
        ("True Colors Ltd.", "https://www.sebi.gov.in/filings/public-issues/sep-2025/true-colors-limited_96693.html", 191),
        ("Aptus Pharma Ltd.", "https://www.sebi.gov.in/filings/public-issues/oct-2025/aptus-pharma-limited_97275.html", 70),
        ("BharatRohan Airborne Innovations Ltd.", "https://www.bseindia.com/downloads/ipo/RHP%20&%20GID_180920251306.zip", 85),
        ("Solvex Edibles Ltd.", "https://www.bseindia.com/corporates/download/314176/FINALDPSOLVEX_20250228230733.pdf", 72),
        ("Siddhi Cotspin Ltd.", "https://nsearchives.nseindia.com/emerge/corporates/content/SiddhiCotspinLimited_DRHP.pdf", 108),
        ("Central Mine Planning & Design Institute Ltd.", "https://www.sebi.gov.in/sebi_data/attachdocs/mar-2026/1773394311147.pdf", 172)
    ]
    for name, url, ip in targets:
        inspect_company_cap(name, url, ip)
