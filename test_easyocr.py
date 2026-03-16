import fitz
import easyocr
import requests
from io import BytesIO

def test_ocr(url):
    print(f"\n--- Testing EasyOCR on anchor PDF ---")
    try:
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        
        print("Rendering PDF to image via PyMuPDF...")
        doc = fitz.open(stream=response.content, filetype="pdf")
        page = doc.load_page(0) 
        # Zoom to improve OCR resolution
        zoom = 2
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        img_path = "/tmp/anchor_test_ocr.png"
        pix.save(img_path)
        
        print("Downloading/Loading EasyOCR deep learning model (this may take a minute computing on CPU)...")
        reader = easyocr.Reader(['en'], model_storage_directory='/tmp/easyocr_models', download_enabled=True)
        
        print("Running OCR extraction...")
        result = reader.readtext(img_path, detail=0)
        text = "\n".join(result)
        
        print(f"\nTotal characters extracted: {len(text)}")
        print("--- Preview ---")
        print(text[:500])
        print("---------------")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    anchor_url = 'https://www.chittorgarh.net/reports/anchor-investor/accord-transformer-anchor-letter.pdf'
    test_ocr(anchor_url)
