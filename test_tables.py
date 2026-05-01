import requests
import pdfplumber
from io import BytesIO
import re

url = "https://www.chittorgarh.net/reports/ipo_notes/rhp_novus_loyalty.pdf"
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf = pdfplumber.open(BytesIO(r.content))

fund_kws = ['fund', 'ventures', 'capital', 'opportunities', 'limited', 'ltd', 'pvt', 'private', 'investment', 'llp', 'trust', 'holdings', 'advisors', 'partners', 'ccv', 'finavenue']
found = set()

for i, page in enumerate(pdf.pages[80:90]):
    tables = page.extract_tables()
    for table in tables:
        for row in table:
            # We want to check all cells in a row, or maybe a cell under "Name"
            # But just scanning all cells is easiest
            for cell in row:
                if cell and isinstance(cell, str):
                    cell_clean = re.sub(r'\s+', ' ', cell).strip()
                    if len(cell_clean) > 5 and len(cell_clean) < 100:
                        if any(kw in cell_clean.lower().split() for kw in fund_kws):
                            # Ensure it has capitalized words
                            if re.match(r'^[A-Z]', cell_clean):
                                found.add(cell_clean)

for f in found:
    print(f"FUND: {f}")
