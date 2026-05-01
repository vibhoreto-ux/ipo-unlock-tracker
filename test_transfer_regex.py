import re

text = """
Transfer from
31-Mar-22 Gaurav Kumar Cash 32 5,200 10/- 10/- 0.00% Negligible
Sharma
21-May-25 Bonus Issue Nil 62,40,000 62,45,200 10/- Nil 50.94% 40.13%
Total 62,45,200 50.98% 40.16%
Sweta Singh
Transfer from
27-Jun-11 Cash 1,000 1,000 10/- 10/- 0.01% 0.01%
Sumit Kaushik
Transfer from
31-Dec-12 Cash 3,000 4,000 10/- 10/- 0.02% 0.02%
Mohit Tomar
Transfer from
31-Mar-17 Cash 1,000 5,000 10/- 10/- 1.25% 0.01%
Deepak Tomar
Transfer to
1,32,353/
05-May-25 Balveer Singh Cash (23) 4,977 10/- 0.00% Negligible
-
Sankhla
Transfer to CCV
Emerging 1,32,353/
05-May-25 Cash (227) 4,750 10/- 0.00% Negligible
Opportunities -
Fund-I
Transfer to
1,32,353/
05-May-25 Finavenue Growth Cash (113) 4,637 10/- 0.00% Negligible
-
Fund
Transfer to Shreeji
1,32,353/
05-May-25 Ventures (Gaurav Cash (15) 4,622 10/- 0.00% Negligible
-
Dipak Hatalkar)
Transfer to 1,32,353/
05-May-25 Cash (8) 4,614 10/- 0.00% Negligible
Vaishali Basra -
"""

# Replace newlines with spaces to join split names
joined_text = text.replace('\n', ' ')

fund_kws = ['fund', 'ventures', 'capital', 'opportunities', 'limited', 'ltd', 'pvt', 'private', 'investment', 'llp', 'trust', 'holdings', 'advisors', 'partners', 'ccv', 'finavenue']

import collections
found = collections.OrderedDict()

matches = re.finditer(r'transfer\s+to\s+([A-Z][A-Za-z\s\.,&\\\/\-\(\)]+)(?:\d|$)', joined_text, re.IGNORECASE)
for match in matches:
    name = match.group(1).strip()
    if any(kw in name.lower() for kw in fund_kws) and len(name) > 4:
        # clean any extra spaces
        name = re.sub(r'\s+', ' ', name)
        found[name.lower()] = name
        print(f"FOUND: {name}")

"""
Output should hopefully be:
CCV Emerging Opportunities Fund-I
Finavenue Growth Fund
Shreeji Ventures (Gaurav Dipak Hatalkar)
"""
