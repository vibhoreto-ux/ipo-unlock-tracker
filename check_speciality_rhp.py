import pdfplumber
import requests
from io import BytesIO

url = 'https://www.bsesme.com/download/354383/SME_IPO%20BasisOfAllotment/Prospectus_20260325151551.pdf'
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

with open('/tmp/speciality_rhp.txt', 'w', encoding='utf-8') as out:
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                out.write(f"--- PAGE {i} ---\n{text}\n")
