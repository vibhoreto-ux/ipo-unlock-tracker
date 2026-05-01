import re
import sys

def test_waca(filepath):
    text = open(filepath).read()
    
    # Method 1: Look for the table format "Last 1 year [price]" or "Last 18 months [price]"
    m = re.search(r'Last 1 year[^\d]+([\d\.]+)', text, re.IGNORECASE)
    if m:
        print(f"[{filepath}] WACA (Last 1 year):", m.group(1))
    else:
        # Speciality Medicines format?
        m2 = re.search(r'weighted average cost of acquisition.*?(\d+\.\d+)', text, re.IGNORECASE | re.DOTALL)
        if m2:
            print(f"[{filepath}] WACA (fallback):", m2.group(1))
        else:
            print(f"[{filepath}] WACA NOT FOUND")

test_waca('/tmp/pace.txt')
test_waca('/tmp/speciality_rhp.txt')
