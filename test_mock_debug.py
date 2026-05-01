import re

def is_valid_investor_name(n):
    if len(n) < 5 or len(n) > 60: return False
    if len(n.split()) < 2: return False
    low = n.lower()
    bad_kws = ['compliance', 'rule', 'meet', 'total', 'promoter', 'company', 'board', 'listing', 'equity', 'shares', 'stock', 'exchange', 'decide', 'business', 'financial', 'statement', 'director', 'officer', 'manager', 'placement', 'issue']
    if any(kw in low for kw in bad_kws): return False
    caps = sum(1 for w in n.split() if w and w[0].isupper())
    if caps < 2: return False
    return True

investors_dict = {}

text = """
The history of the equity share capital of our Company is set forth below:
...
5. Yash Hitesh Patel 2,00,000 3.11%
"""

text_lower = text.lower()

in_share_history = False
has_seen_target = False

if ('history of equity' in text_lower or 
    'build up' in text_lower or
    'equity share capital' in text_lower or
    'capital structure' in text_lower):
    in_share_history = True
    print("SET in_share_history to TRUE")

if re.search(r'pre-ipo|pre ipo|preferential allotment|private placement|major shareholders', text_lower):
    has_seen_target = True
elif re.search(r'(?:^\d+\.\s+)?[A-Z][A-Za-z\s\.,&]+?\s+[\d,]+\s+[\d\.]+%', text):
    has_seen_target = True
    print("SET has_seen_target to TRUE via fallback")

if in_share_history and has_seen_target:
    lines = text.split('\n')
    for line in lines:
        sh_match = re.search(r'(?:^\d+\.\s+)?([A-Z][A-Za-z\s\.,&]+?)\s+([\d,]+)\s+[\d\.]+%', line)
        if sh_match:
            name = sh_match.group(1).strip()
            print(f"Matched name: {name}")
            if is_valid_investor_name(name):
                investors_dict[name.lower()] = name
                print(f"Added to dict: {name}")
            else:
                print(f"Rejected by is_valid: {name}")

print("FINAL DICT:", investors_dict)
