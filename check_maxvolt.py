import pdfplumber
import requests
from io import BytesIO

url = 'https://nsearchives.nseindia.com/emerge/corporates/content/aartic_05022025132223_MaxvoltRhp_2.pdf' # Let's assume URL from chittorgarh page or just DB
def find_rhp():
    import json
    with open('./data/unlock-data.json') as f:
        db = json.load(f)
        c = next(v for v in db['companies'] if v['companyName'] == 'Maxvolt Energy Industries Ltd.')
        return c['rhpUrl']

url = find_rhp()
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
    for i, page in enumerate(pdf.pages[20:120]):
        text = page.extract_text()
        if not text: continue
        if 'Chittorgarh Infotech' in text or 'Noida Holdings' in text:
            print(f"--- PAGE {i+20} TEXT ---")
            lines = text.split('\n')
            for j, line in enumerate(lines):
                if 'Chittorgarh' in line or 'Noida' in line:
                    start = max(0, j-3)
                    end = min(len(lines), j+4)
                    print("\n".join(lines[start:end]))
                    print("-" * 20)
            
            tables = page.extract_tables()
            for t in tables:
                for row in t:
                    if any('Chittorgarh' in str(c) for c in row) or any('Noida' in str(c) for c in row):
                        print("TABLE ROW:", row)
