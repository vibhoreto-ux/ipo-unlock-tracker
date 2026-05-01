import pdfplumber
import requests
from io import BytesIO

url = 'https://www.bsesme.com/download/354383/SME_IPO%20InPrinciple/DRHPSMPLFINALS_20250929233345.pdf'
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
    for i, page in enumerate(pdf.pages[10:150]):
        text = page.extract_text()
        if not text: continue
        lower_t = text.lower()
        if 'preferential allotment' in lower_t or 'private placement' in lower_t or 'pre-ipo' in lower_t or 'pre ipo' in lower_t:
            if 'allotment' in lower_t or 'equity share capital' in lower_t:
                print(f"--- PAGE {i+11} TEXT ---")
                lines = text.split('\n')
                for j, line in enumerate(lines):
                    if 'preferential' in line.lower() or 'private' in line.lower() or 'allot' in line.lower():
                        start = max(0, j-2)
                        end = min(len(lines), j+4)
                        print("\n".join(lines[start:end]))
                        print("-" * 20)
                
                tables = page.extract_tables()
                if tables:
                    print("--- TABLES ---")
                    for t in tables:
                        for row in t:
                            print(row)
