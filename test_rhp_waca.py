import pdfplumber
import requests
from io import BytesIO
import re

def search_rhp():
    url = 'https://www.bsesme.com/download/339916/SME_IPO%20InPrinciple/DRHP_Accord_Final_20250930235151.pdf'
    
    try:
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        
        with pdfplumber.open(BytesIO(response.content)) as pdf:
            for i, page in enumerate(pdf.pages[:100]):
                text = page.extract_text()
                if not text: continue
                
                # Look for patterns like: Name 63,75,000 ₹ 0.20 Per Share
                lines = text.split('\n')
                for line in lines:
                    # Regex to find: Name + Numbers + Rs/₹ symbol + Price + "Per Share" or "per Equity Share"
                    if re.search(r'₹|Rs\.?|INR', line, re.IGNORECASE) and re.search(r'per share|per equity share', line, re.IGNORECASE):
                        print(f"Page {i+1}: {line}")
                                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    search_rhp()
