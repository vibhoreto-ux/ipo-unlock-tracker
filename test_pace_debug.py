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

with open('/tmp/pace.txt', 'r', encoding='utf-8') as f:
    text = f.read()

investors_dict = {}

text_lower = text.lower()
in_share_history = False

if ('history of equity' in text_lower or 
    'build up' in text_lower or
    'equity share capital' in text_lower or
    'capital structure' in text_lower):
    in_share_history = True

print(f"in_share_history: {in_share_history}")

has_target = bool(re.search(r'pre-ipo|pre ipo|preferential allotment|private placement|major shareholders', text_lower))
print(f"has_target: {has_target}")

if in_share_history and has_target:
    lines = text.split('\n')
    for line in lines:
        for match in re.finditer(r'([\d,]+)\s+(?:Equity\s+)?(?:shares|Shares)(?:\s+were\s+allotted)?\s+to\s+(?:m/s\.?\s+)?([A-Z][A-Za-z\s\.\&\,\-\(\)]+?)(?:;|(?=\s+\(|$))', line, re.IGNORECASE):
            name = match.group(2).strip()
            print(f"FOUND MATCH: {name}")
            if is_valid_investor_name(name):
                investors_dict[name.lower()] = name
            else:
                print(f"REJECTED: {name}")

print(investors_dict)
