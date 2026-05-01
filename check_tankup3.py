import pdfplumber
import requests
from io import BytesIO

url = 'https://www.tankup.co.in/wp-content/uploads/2025/08/FINAL-RHP-Tankup.pdf'
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
    for i, page in enumerate(pdf.pages[30:70]):
        text = page.extract_text()
        if not text:
            continue
        text_lower = text.lower()
        if 'capital structure' in text_lower:
            print(f"--- PAGE {i+30} ---")
            print(text[:1500])
