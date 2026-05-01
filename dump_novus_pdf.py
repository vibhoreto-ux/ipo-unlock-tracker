import requests
import pdfplumber
from io import BytesIO
import re

url = "https://www.chittorgarh.net/reports/ipo_notes/rhp_novus_loyalty.pdf"
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf = pdfplumber.open(BytesIO(r.content))

text_dump = ""
for i, page in enumerate(pdf.pages[:150]):
    text = page.extract_text()
    if not text: continue
    
    if re.search(r'pre-ipo|pre ipo|preferential|private placement', text.lower()):
        text_dump += f"\n--- PAGE {i} ---\n"
        text_dump += text + "\n"

with open("novus_pdf_preipo_pages.txt", "w", encoding='utf-8') as f:
    f.write(text_dump)
