import nlp_extractor
import sys

with open('pace.pdf', 'rb') as f:
    res = nlp_extractor.extract_preipo_names(f.read(), "Pace Digitek")
    print("PACE RES:", res)
