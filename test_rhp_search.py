import pdfplumber
import requests
from io import BytesIO

def search_rhp():
    url = 'https://www.bsesme.com/download/339916/SME_IPO%20InPrinciple/DRHP_Accord_Final_20250930235151.pdf'
    print(f"\n--- Searching RHP for Pre-IPO data ---")
    try:
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        
        with pdfplumber.open(BytesIO(response.content)) as pdf:
            print(f"Total Pages: {len(pdf.pages)}")
            
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text:
                    text_lower = text.lower()
                    if 'pritesh' in text_lower or 'pre-ipo' in text_lower or 'pre ipo' in text_lower:
                        print(f"\n--- Found on Page {i+1} ---")
                        # Print context
                        lines = text.split('\n')
                        for j, line in enumerate(lines):
                            if 'pritesh' in line.lower() or 'pre-ipo' in line.lower() or 'pre ipo' in line.lower():
                                start = max(0, j-2)
                                end = min(len(lines), j+3)
                                print("\n".join(lines[start:end]))
                                print("-" * 40)
                                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    search_rhp()
