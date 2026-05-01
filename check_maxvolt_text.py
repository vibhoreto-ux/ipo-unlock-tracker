import pdfplumber
import requests
from io import BytesIO

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
    text = pdf.pages[92].extract_text()
    if text:
        print("PAGE 93 (0-indexed 92):")
        print(text[:1500])
