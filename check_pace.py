import pdfplumber
import requests
from io import BytesIO

url = 'https://www.bseindia.com/corporates/download/337336/IPO%20BasisOfAllotment/Pace%20Digitek%20Limited%20-%20Signed%20Prospectus-30092025_20251001150218.pdf'
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

with open('/tmp/pace.txt', 'w', encoding='utf-8') as out:
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for i, page in enumerate(pdf.pages[:150]):
            text = page.extract_text()
            if text:
                out.write(f"--- PAGE {i} ---\n{text}\n")
