import pdfplumber
import requests
from io import BytesIO

url = 'https://www.tankup.co.in/wp-content/uploads/2025/08/FINAL-RHP-Tankup.pdf'
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        if text and 'Concord Control Systems Limited' in text:
            print(f"--- PAGE {i} ---")
            lines = text.split('\n')
            for j, line in enumerate(lines):
                if 'Concord' in line:
                    start = max(0, j - 2)
                    end = min(len(lines), j + 3)
                    print("\n".join(lines[start:end]))
                    print("-" * 20)
