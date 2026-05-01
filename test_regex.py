import re

text = "Allotment of (i) 1,904 Equity Shares to Geeta Shivaji Mashale; (ii) 50 Equity Shares to Shanmukh Mattihalli Chanabasappa; (xxx) 39,500 Equity Shares to Nova Global Opportunities Fund PCC"

patterns = [
    r'(?:M/s\.?\s+)?([A-Z][A-Za-z\s\.\&\,\-\(\)]+?)(?:\s+Pvt\.?\s+Ltd\.?|\s+Limited|\s+LLP|\s+HUF|\s+Fund)?(?:\s+to\s+)?(?:\s+was\s+allotted)?\s+([0-9,]+)\s+(?:Equity\s+)?Shares',
    r'([0-9,]+)\s+(?:Equity\s+)?(?:shares|Shares)(?:\s+were\s+allotted)?\s+to\s+(?:M/s\.?\s+)?([A-Z][A-Za-z\s\.\&\,\-\(\)]+)'
]

for p in patterns:
    matches = re.finditer(p, text)
    for m in matches:
        print("MATCH:", m.groups())
