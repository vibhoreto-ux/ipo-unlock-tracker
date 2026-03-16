import pdfplumber
import requests
from io import BytesIO

def test_pdf(url, name):
    print(f"\n--- Testing {name} ---")
    print(f"URL: {url}")
    try:
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        
        with pdfplumber.open(BytesIO(response.content)) as pdf:
            print(f"Total Pages: {len(pdf.pages)}")
            
            # Extract text from first 5 pages
            full_text = ""
            for i, page in enumerate(pdf.pages[:5]):
                text = page.extract_text()
                if text:
                    full_text += text + "\n"
                    
            print(f"Extracted Text Length (first 5 pages): {len(full_text)}")
            if len(full_text) < 100:
                print("WARNING: Very little text extracted. This might be a scanned image PDF.")
            else:
                print(f"Preview: {full_text[:200]}...")
                
    except Exception as e:
        print(f"Error processing {name}: {e}")

if __name__ == '__main__':
    anchor_url = 'https://www.chittorgarh.net/reports/anchor-investor/accord-transformer-anchor-letter.pdf'
    rhp_url = 'https://www.bsesme.com/download/339916/SME_IPO%20InPrinciple/DRHP_Accord_Final_20250930235151.pdf'
    
    test_pdf(anchor_url, "Anchor Investor PDF")
    # For RHP, it might be large, so we just stream and get first few pages
    # Let's see if BSE blocks the python request.
    test_pdf(rhp_url, "RHP PDF")
