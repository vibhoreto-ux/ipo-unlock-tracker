import sys
from nlp_extractor import extract_preipo_names

with open('/tmp/pace.txt', 'r', encoding='utf-8') as f:
    text = f.read()

# Since extract_preipo_names expects pdf_bytes, and processes via pdfplumber
# I will instead simulate the text loop exactly as in nlp_extractor.py

import nlp_extractor

# I have to re-read the PDF using pdfplumber to test properly.
import pdfplumber
from io import BytesIO

with open('/Users/v1/Antigravity_my/unlock-tracker/Pace_Digitek_Limited_-_Signed_Prospectus-30092025_20251001150218.pdf', 'rb') as pdf_file:
    # Wait, I don't have the PDF downloaded locally as a file!
    pass
    
