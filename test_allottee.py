import pdfplumber
import requests
from io import BytesIO
import re

url = 'https://www.bsesme.com/download/354383/SME_IPO%20InPrinciple/DRHPSMPLFINALS_20250929233345.pdf'
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

def is_valid_investor_name(n):
    if len(n) < 5 or len(n) > 60: return False
    if len(n.split()) < 2: return False
    low = n.lower()
    bad_kws = ['compliance', 'rule', 'meet', 'total', 'promoter', 'company', 'board', 'listing', 'equity', 'shares', 'stock', 'exchange', 'decide', 'business', 'financial', 'statement', 'director', 'officer', 'manager', 'placement', 'issue', 'huf', 'date of allotment']
    if any(kw in low for kw in bad_kws): return False
    caps = sum(1 for w in n.split() if w and w[0].isupper())
    if caps < 2: return False
    return True

investors = {}

with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
    for page in pdf.pages[75:85]:
        tables = page.extract_tables()
        if tables:
            for t in tables:
                for row in t:
                    for cell in row:
                        if cell and isinstance(cell, str):
                            cell_clean = re.sub(r'\s+', ' ', cell).strip()
                            if is_valid_investor_name(cell_clean):
                                investors[cell_clean] = True

print(list(investors.keys()))
