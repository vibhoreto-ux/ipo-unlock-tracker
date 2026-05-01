import pdfplumber
import requests
from io import BytesIO

url = 'https://www.tankup.co.in/wp-content/uploads/2025/08/FINAL-RHP-Tankup.pdf'
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

print("Extracting...")
with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
    recording = False
    for i, page in enumerate(pdf.pages[:100]):
        text = page.extract_text()
        if not text:
            continue
        
        text_lower = text.lower()
        if 'history of equity share capital' in text_lower or 'build up of equity share capital' in text_lower:
            print(f"--- PAGE {i} ---")
            print(text)
            recording = True
        elif recording:
            print(f"--- PAGE {i} ---")
            print(text)
            if 'promoter' in text_lower and 'contribution' in text_lower:
                break
