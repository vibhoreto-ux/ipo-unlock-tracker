import pdfplumber
import requests
from io import BytesIO
import re

url = "https://www.bseindia.com/corporates/download/337336/IPO%20BasisOfAllotment/Speciality%20Medicines%20Limited_20250212095907.pdf"
response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
pdf_bytes = response.content

def is_valid_investor_name(n):
    if len(n) < 5 or len(n) > 60: return False
    if len(n.split()) < 2: return False
    return True

investors_dict = {}

with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
    in_share_history = False
    has_seen_target = False
    for i, page in enumerate(pdf.pages[:150]):
        text = page.extract_text()
        if not text: continue
        
        text_lower = text.lower()
        if 'equity share capital' in text_lower:
            in_share_history = True
            
        if re.search(r'major shareholders', text_lower):
            has_seen_target = True
            
        if not (in_share_history and has_seen_target):
            continue
            
        lines = text.split('\n')
        for line in lines:
            if 'yash' in line.lower():
                print(f"PAGE {i} SAW YASH: {line}")
            
            sh_match = re.search(r'(?:^\d+\.\s+)?([A-Z][A-Za-z\s\.,&]+?)\s+([\d,]+)\s+[\d\.]+%', line)
            if sh_match:
                name = sh_match.group(1).strip()
                if "Yash" in name:
                    print(f"MATCH: {name}")

