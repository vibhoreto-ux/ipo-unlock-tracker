import pdfplumber
import requests
from io import BytesIO

url = 'https://www.tankup.co.in/wp-content/uploads/2025/08/FINAL-RHP-Tankup.pdf'
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        if text and ('pre-ipo' in text.lower() or 'pre ipo' in text.lower() or 'private placement' in text.lower() or 'preferential allotment' in text.lower()):
            lines = text.split('\n')
            for j, line in enumerate(lines):
                ll = line.lower()
                if 'pre-ipo' in ll or 'pre ipo' in ll or 'private placement' in ll or 'preferential allotment' in ll or 'allotment to' in ll:
                    print(f"PAGE {i}: {line}")
