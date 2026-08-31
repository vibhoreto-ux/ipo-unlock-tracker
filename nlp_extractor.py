import sys
import json
import argparse
import requests
import pdfplumber
import re
from io import BytesIO


def extract_peer_comparison(pdf_bytes):
    """
    Extract the Peer Comparison / Comparison of Accounting Ratios table from an RHP.
    
    Strategy:
    - Scan for section header keywords (e.g. "Comparison of Accounting Ratios",
      "listed industry peers", "Peer Competitors").
    - Collect the lines of the table: rows where the last 4+ tokens are numeric-like.
    - Detect and reconstruct wrapped company names from the following line(s).
    - Return {columns, rows} where rows = [{name, values}].
    """
    # Only trigger on the SPECIFIC section heading, not general "peer group" text in notes
    PEER_TRIGGER = re.compile(
        r'comparison of accounting ratios|peer competitor.*comparison|'
        r'comparison with.*industry peer|comparison of.*ratio.*peer|'
        r'accounting ratios with.*peer|listed industry peers',
        re.IGNORECASE
    )
    # Separate looser trigger for "peer group" that needs more context
    PEER_GROUP_TRIGGER = re.compile(
        r'^\s*(?:\d+\.\s+)?(?:peer group|peer comparator|peer companies)\s*$',
        re.IGNORECASE
    )
    # Numeric-like token: number (possibly with commas), %, N.A, [●], placeholder
    NUM_RE = re.compile(
        r'^(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?%?|n\.?a\.?|\[[\u25cf\u25e6●•]\]|'
        r'\[-\]|-|\[.*?\])$',
        re.IGNORECASE
    )

    def is_num(tok):
        t = tok.strip().rstrip('*^#')
        if not t:
            return False
        if NUM_RE.match(t):
            return True
        # bare number test
        try:
            float(t.replace(',', '').replace('%', ''))
            return True
        except ValueError:
            pass
        return False

    def count_trailing_nums(tokens):
        cnt = 0
        for tok in reversed(tokens):
            if is_num(tok):
                cnt += 1
            else:
                break
        return cnt

    # Words that indicate the first token of a row that should be skipped
    SKIP_FIRST_WORD = re.compile(
        r'^(?:source|note|notes|\*|\^|\#|\d+\.|for|set|comparison|name|face|revenue|basic|diluted|'
        r'return|nav|roe|ronw|cmp|total|income|ebitda|ebit|pat|debt|equity|kpi|'
        r'fiscal|financial|year|period|weighted|average|quarter)$',
        re.IGNORECASE
    )
    # Section separator lines — stop absorbing name continuation if we hit these
    SECTION_SEPARATOR = re.compile(
        r'^(?:peer group|peer competitors|peer comparator|our company|the ipo company|'
        r'issuer|notes?:|source:|the above|investors should|accordingly|\*\*|\^\^)$',
        re.IGNORECASE
    )

    try:
        page_texts = []
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages[:250]):
                t = page.extract_text() or ""
                page_texts.append(t)

        # Find pages that contain peer comparison sections
        peer_pages = []
        for idx, pt in enumerate(page_texts):
            if PEER_TRIGGER.search(pt):
                peer_pages.append(idx)

        if not peer_pages:
            return None

        rows = []

        for pidx in peer_pages:
            # Gather a window of up to 3 pages starting from this trigger page
            window_lines = []
            for wpi in range(pidx, min(pidx + 3, len(page_texts))):
                window_lines.extend(page_texts[wpi].split('\n'))
            window_lines.append('')  # sentinel

            found_table = False
            i = 0
            while i < len(window_lines):
                line = window_lines[i].strip()
                i += 1
                if not line:
                    continue

                # Re-check trigger on this line to mark table start
                if PEER_TRIGGER.search(line):
                    found_table = True
                    continue

                if not found_table:
                    continue

                # Stop if we hit section end markers well past the table
                low = line.lower()
                if re.search(r'^(investors should read|the trading price|key operational|'
                             r'key performance indicators)', low):
                    break

                tokens = line.split()
                if not tokens:
                    continue

                # Skip header/label rows where first word is a known column header
                if SKIP_FIRST_WORD.match(tokens[0]) and len(tokens) < 8:
                    continue

                tc = count_trailing_nums(tokens)
                if tc < 4:
                    continue

                name_tokens = tokens[:-tc]
                value_tokens = tokens[-tc:]

                if not name_tokens:
                    continue

                name = ' '.join(name_tokens)
                # Strip trailing decorators from name (e.g. "Zydus*" → "Zydus")
                name = re.sub(r'[\*\^\#]+\s*$', '', name).strip()

                # Look-ahead: next line may be a wrapped name continuation
                while i < len(window_lines):
                    next_line = window_lines[i].strip()
                    if not next_line:
                        break
                    # Stop if it's a section separator
                    if SECTION_SEPARATOR.match(next_line):
                        break
                    next_tokens = next_line.split()
                    next_tc = count_trailing_nums(next_tokens)
                    # If next line itself is a data row, stop
                    if next_tc >= 4:
                        break
                    # If short (≤5 words) and no numbers, assume it's the wrapped name tail
                    if len(next_tokens) <= 5 and next_tc == 0:
                        # Don't absorb section separators
                        if SECTION_SEPARATOR.match(next_line):
                            break
                        tail = re.sub(r'[\*\^\#]+\s*$', '', next_line).strip()
                        name += ' ' + tail
                        i += 1
                    else:
                        break

                # Final name cleanup
                name = re.sub(r'\s+', ' ', name).strip()

                # Normalise special placeholders
                clean_values = []
                for v in value_tokens:
                    v2 = v.strip().rstrip('*^#')
                    if re.match(r'^\[.+\]$', v2):
                        v2 = '—'
                    clean_values.append(v2)

                rows.append({'name': name, 'values': clean_values})

            # Post-collection: filter out noise rows from WACA/weight tables
            # These are rows like "Fiscal year ended March 31, 2025  3.55  1"
            NOISE_NAME_RE = re.compile(
                r'^(?:fiscal year|financial year|year ended|quarter ended|'
                r'for the (?:year|period)|fy\s*\d{2,4})',
                re.IGNORECASE
            )
            def is_noise_row(row):
                # Skip rows with date-like names
                if NOISE_NAME_RE.match(row['name']):
                    return True
                # Skip rows where values look like [date_part, year, ratio, weight_int]
                # i.e. last value is a small integer 1–5 (weight) and second-to-last is a year-like value
                vals = row['values']
                if len(vals) == 4:
                    try:
                        last = int(vals[-1])
                        if 1 <= last <= 5 and ',' in vals[0]:
                            return True
                    except ValueError:
                        pass
                return False

            rows = [r for r in rows if not is_noise_row(r)]

            if rows:
                break  # stop at first successful page match

        if not rows:
            return None

        # Detect column headers: look for a line on the trigger page that contains
        # MULTIPLE RHP column-header keywords together (stricter than single match).
        detected_cols = []
        HEADER_KW_LIST = [
            'face value', r'\beps\b', 'diluted', 'basic', r'\bp/e\b', r'\bpe\b',
            'return', 'ronw', r'\bnav\b', 'revenue', 'cmp', 'total income',
            'ebitda', r'\bpat\b', 'debt.equity', r'\bkpi\b'
        ]
        HEADER_MULTI = re.compile(
            '|'.join(HEADER_KW_LIST), re.IGNORECASE
        )
        for pidx2 in peer_pages:
            lines2 = page_texts[pidx2].split('\n')
            in_section = False
            for line in lines2:
                if PEER_TRIGGER.search(line):
                    in_section = True
                if not in_section:
                    continue
                matches = HEADER_MULTI.findall(line)
                if len(matches) >= 2:
                    toks = [t.strip() for t in line.split() if t.strip()]
                    # Must be a reasonable header line length, not a paragraph
                    if 3 <= len(toks) <= 15:
                        detected_cols = toks
                        break
            if detected_cols:
                break

        # Fallback to generic headers if detection failed
        if not detected_cols:
            num_vals = rows[0]['values'] if rows else []
            generic = ['Face Val', 'Revenue(₹M)', 'Basic EPS', 'Diluted EPS',
                       'P/E', 'RoNW%', 'NAV/Share', 'CMP', 'Total Income']
            detected_cols = generic[:len(num_vals)]

        return {'columns': detected_cols, 'rows': rows}

    except Exception as e:
        import traceback
        sys.stderr.write(f"PEER_EXTRACT ERROR: {e}\n")
        traceback.print_exc(file=sys.stderr)
        return None


def extract_preipo_names(pdf_bytes, company_name=None):
    """
    Extract Pre-IPO investor names from the final RHP PDF.
    
    Note: DRHPs (Draft Red Herring Prospectus) typically only say the company
    "may consider" a Pre-IPO Placement. Actual investor names only appear
    in the final RHP after the placement is completed.
    
    Strategy:
    1. First check if the PDF is a DRHP (draft) — if so, pre-IPO data won't exist
    2. Look for 'History of Equity Share Capital' or 'Build Up of Equity Share Capital'
       tables which list allotments including pre-IPO placements
    3. Extract investor names from rows that mention 'pre-ipo' or 'private placement'
    """
    try:
        investors_dict = {}
        is_drhp = False
        def is_valid_investor_name(n):
            if len(n) < 5 or len(n) > 60: return False
            if len(n.split()) < 2: return False
            low = n.lower()
            bad_kws = [
                'compliance', 'rule', 'meet', 'total', 'promoter', 'company', 'board',
                'listing', 'equity', 'shares', 'stock', 'exchange', 'decide', 'business',
                'financial', 'statement', 'director', 'officer', 'manager', 'placement',
                'issue', 'cash', 'operating', 'activities', 'fiscal', 'shareholders',
                'terms', 'herring', 'pursuant', 'accordance', 'regulation', 'net', 'gross',
                'value', 'section', 'act,', 'tax', 'penalty', 'litigation', 'criminal',
                'complaints', 'goods', 'services', 'central', 'required', 'schedule',
                'particulars', 'nature', 'relation', 'against', 'public', 'programme',
                'commenced', 'substations', 'projects', 'floating', 'matters', 'includes',
                'include', 'hybrid', 'other', 'party', 'which', 'as', 'no.', 'sr.',
                'our', 'top', 'the', 'gw', 'kv', 'moa', 'january', 'february', 'march',
                'april', 'may', 'june', 'july', 'august', 'september', 'october',
                'november', 'december', 'anchor', 'investors', 'salary', 'college',
                'retail', 'bidder', 'bidders', 'portion', 'sales', 'domestic', 'export',
                # Indian states / union territories (to avoid extracting "Andhra Pradesh" etc.)
                'pradesh', 'bengal', 'karnataka', 'maharashtra', 'rajasthan', 'gujarat',
                'punjab', 'haryana', 'bihar', 'jharkhand', 'odisha', 'assam', 'kerala',
                'telangana', 'tamil', 'manipur', 'nagaland', 'meghalaya', 'mizoram',
                'tripura', 'arunachal', 'sikkim', 'goa', 'himachal', 'uttarakhand',
                'jammu', 'kashmir', 'chandigarh', 'ladakh', 'delhi',
                # Countries
                'ireland', 'arabia', 'arabia', 'kingdom', 'japan', 'china', 'singapore',
                'mauritius', 'cayman', 'islands',
                # Generic legal / acquisition phrases
                'acquisition', 'land', 'transfer', 'consideration', 'allotment',
                'diu', 'daman', 'congress', 'expo', 'up to',
            ]
            if any(kw in low.split() for kw in bad_kws): return False
            
            words = [w for w in n.split() if w.strip()]
            cap_words = sum(1 for w in words if w and (w.istitle() or w.isupper() or w[0].isupper()))
            if cap_words / len(words) < 0.5: 
                return False
            
            return True
        
        base_company_word = ""
        if company_name:
            # Get the first main word of the company to filter promoters (e.g. "Tankup")
            parts = [p.lower() for p in company_name.split() if len(p) > 2 and p.lower() not in ['the', 'and', 'ltd', 'limited', 'private']]
            if parts:
                base_company_word = parts[0]
        
                
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            in_share_history = False
            parse_window_left = 0
            for i, page in enumerate(pdf.pages[:250]):
                text = page.extract_text()
                if not text:
                    continue
                
                text_lower = text.lower()
                
                if ('history of equity' in text_lower or 
                    'build up' in text_lower or
                    'equity share capital' in text_lower or
                    'capital structure' in text_lower):
                    in_share_history = True
                
                if re.search(r'pre-ipo|pre ipo|preferential allotment|private placement|major shareholders', text_lower):
                    parse_window_left = 5
                elif re.search(r'(?:^\d+\.\s+)?[A-Z][A-Za-z\s\.,&]+?\s+[\d,]+\s+[\d\.]+%', text):
                    parse_window_left = 5
                
                if not (in_share_history and parse_window_left > 0):
                    continue
                
                parse_window_left -= 1
                
                # Snatch floating prices that wrap across newlines before the table
                current_context_price = None
                text_flat = text_lower.replace('\n', ' ')
                
                ip_match_global = re.search(r'(?:issue price|price of|at a price)\s*(?:of\s*)?(?:(?:inr|rs\.?|₹)\s*)?([\d\.]+)', text_flat)
                if ip_match_global:
                    try:
                        val = float(ip_match_global.group(1))
                        if 10 <= val <= 5000:
                            current_context_price = f" (₹{val:g})"
                    except: pass
                
                if not current_context_price:
                    prem_match_global = re.search(r'premium of\s*(?:(?:inr|rs\.?|₹)\s*)?([\d\.]+)', text_flat)
                    if prem_match_global:
                        try:
                            val = float(prem_match_global.group(1))
                            if 1 <= val <= 5000:
                                current_context_price = f" (₹{val+10:g})"
                        except: pass
                
                # Also use table extraction to catch secondary transfers wrapped in columns
                tables = page.extract_tables()
                if tables:
                    fund_kws = ['fund', 'ventures', 'capital', 'opportunities', 'limited', 'ltd', 'pvt', 'private', 'investment', 'llp', 'trust', 'holdings', 'advisors', 'partners', 'ccv', 'finavenue']
                    ignore_exact = ["authorized share capital", "offer capital", "capital (₹)", "capital", "equity share capital", "issued, subscribed", "offer equity"]
                    for table in tables:
                        for row in table:
                            for cell in row:
                                if cell and isinstance(cell, str):
                                    cell_clean = re.sub(r'\s+', ' ', cell).strip()
                                    if 5 < len(cell_clean) < 100:
                                        # Filter out headers containing generic phrasing
                                        lower_c = cell_clean.lower()
                                        if any(ignore in lower_c for ignore in ignore_exact):
                                            continue
                                        if any(kw in lower_c.split() for kw in fund_kws):
                                            # ensure it is capitalized properly, ignore full lowercase
                                            if re.match(r'^[A-Z]', cell_clean):
                                                # remove "transfer to " if present
                                                name = re.sub(r'^Transfer to\s+', '', cell_clean, flags=re.IGNORECASE)
                                                name = re.sub(r'^Allotment to\s+', '', name, flags=re.IGNORECASE)
                                                
                                                price_str = None
                                                for other_cell in row:
                                                    if other_cell and isinstance(other_cell, str) and other_cell != cell:
                                                        oc_clean = re.sub(r'\s+', '', other_cell)
                                                        if re.match(r'^₹?\d{2,4}(?:\.\d{1,2})?$', oc_clean):
                                                            pval_str = re.sub(r'[^0-9.]', '', oc_clean)
                                                            if pval_str:
                                                                try:
                                                                    pval = float(pval_str)
                                                                    if 10 <= pval <= 5000:
                                                                        price_str = f"₹{pval:g}"
                                                                except:
                                                                    pass
                                                
                                                if not is_valid_investor_name(name):
                                                    continue
                                                    
                                                if price_str:
                                                    investors_dict[name.lower()] = f"{name} ({price_str})"
                                                elif current_context_price:
                                                    investors_dict[name.lower()] = f"{name}{current_context_price}"
                                                else:
                                                    investors_dict[name.lower()] = name
                
                lines = text.split('\n')
                for line in lines:
                    line_lower = line.lower()
                    
                    # Capture grouped Private Placement rows (e.g. "Private Placement **** 40,19,326 10/- 120/- Cash ... 42")
                    grouped_match = re.search(r'(private placement|preferential allotment)[\*#\^]*\s+([\d,]+)\s+[\d\.]+/-\s+([\d\.]+)/-\s+cash.*?\s+(\d+)\s*$', line_lower)
                    if grouped_match:
                        label = grouped_match.group(1).title()
                        shares_str = grouped_match.group(2)
                        price_str = grouped_match.group(3)
                        investors_count = grouped_match.group(4)
                        
                        shares_num = int(shares_str.replace(',', ''))
                        if shares_num > 10000:
                            rep_key = f"grouped_{shares_num}"
                            investors_dict[rep_key] = f"{label} of {shares_str} shares to {investors_count} investors (@ ₹{price_str})"
                            continue

                    # Default helper to extract price from text line
                    price_suffix = current_context_price or ""
                    price_val_match = re.search(r'(?:at|price of)\s*(?:(?:inr|rs\.?|₹)\s*)?([\d\.]+)|(?:inr|rs\.?|₹)\s*([\d\.]+)[\s/-]|([\d\.]+)/-', line_lower)
                    if price_val_match:
                        extracted = price_val_match.group(1) or price_val_match.group(2) or price_val_match.group(3)
                        if extracted:
                            try:
                                pval = float(extracted)
                                if 10 <= pval <= 5000:
                                    price_suffix = f" (₹{pval:g})"
                            except:
                                pass

                    # Common format: Allotment to XYZ Fund pursuant to Pre-IPO Placement
                    name_match = re.search(r'(?:to|by)\s+([A-Z][A-Za-z\s\.,]+?)(?:\s+(?:pursuant|under|through|vide|on|at|aggregating))', line)
                    if name_match:
                        name = name_match.group(1).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = f"{name}{price_suffix}"
                    
                    # Alternative: "Name | shares | price | Pre-IPO Placement"
                    name_match2 = re.match(r'^([A-Z][A-Za-z\s\.,&]+?)\s+[\d,]+\s', line)
                    if name_match2:
                        name = name_match2.group(1).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = f"{name}{price_suffix}"

                    # Alternative 3: "Preferential allotment of [x] Equity Shares to Mr. John Doe"
                    name_match3 = re.search(r'to\s+(?:mr\.|mrs\.|ms\.|m/s\.)?\s*([A-Z][A-Za-z\s\.,&]+?)(?:\s+for|\s+at|\s+aggregating|\.|$)', line, re.IGNORECASE)
                    if name_match3:
                        name = name_match3.group(1).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = f"{name}{price_suffix}"

                    # Pace Digitek massive inline list: "(i) 238 Equity Shares to Mudduluru Dheeraj Varma;"
                    for match in re.finditer(r'([\d,]+)\s+(?:Equity\s+)?(?:shares|Shares)(?:\s+were\s+allotted)?\s+to\s+(?:m/s\.?\s+)?([A-Z][A-Za-z\s\.\&\,\-\(\)]+?)(?:;|(?=\s+\(|$))', line, re.IGNORECASE):
                        name = match.group(2).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = name
                            
                    # Yash Hitesh Patel "List of major shareholders" extraction: "5. Yash Hitesh Patel 2,00,000 3.11%"
                    sh_match = re.search(r'(?:^\d+\.\s+)?([A-Z][A-Za-z\s\.,&]+?)\s+([\d,]+)\s+[\d\.]+%', line)
                    if sh_match:
                        name = sh_match.group(1).strip()
                        if is_valid_investor_name(name):
                            investors_dict[name.lower()] = name
        
        # Filter down names that represent just random text or promoters
        final_list = []
        base_clean = ""
        if base_company_word:
            base_clean = re.sub(r'[^a-z0-9]', '', base_company_word)

        for v in investors_dict.values():
            v_lower = v.lower()
            if 'total' in v_lower or 'promoter' in v_lower or 'share capital' in v_lower or 'paid-up' in v_lower:
                continue
            
            v_clean = re.sub(r'[^a-z0-9]', '', v_lower)
            if base_clean and base_clean in v_clean:
                continue
            
            final_list.append(v)

        waca_val = None
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            full_text = ""
            for i, page in enumerate(pdf.pages[:250]):
                t = page.extract_text()
                if t: full_text += t + "\n"
                
            tl = full_text.lower()
            
            # Pattern A: Direct "Weighted average cost of acquisition 22.02" line (most specific)
            wA = re.search(r'weighted average cost of acquisition\s+([\d]+\.[\d]{1,2})(?:\^|\#|$|\s)', tl)
            # Pattern B: "WACA ... 22.02" from a table row
            wB = re.search(r'\bwaca\b.{0,80}?([\d]+\.[\d]{1,2})', tl)
            # Pattern C: "last 1 year / 18 months / 3 years N.NN" (existing)
            wC = re.search(r'last (?:\(?\d+\)?\s+)?(?:1 year|one.*?year|18 months|eighteen.*?months|3 years|three.*?years)\s+([\d\.]+)', tl)
            # Pattern D: "average cost of acquisition ... N.NN" generic fallback (but skip low face-value 10.00 traps)
            wD = re.search(r'(?:weighted )?average cost of acquisition[^\n]{0,200}?([\d]{2,4}\.[\d]{1,2})', tl, re.DOTALL)

            def valid_waca(v):
                try:
                    f = float(v)
                    return 1.0 <= f <= 5000.0
                except:
                    return False
            
            # Pick best match in priority order
            for w in [wA, wB, wC, wD]:
                if w and valid_waca(w.group(1)):
                    waca_val = float(w.group(1))
                    break

        return { "investors": list(set(final_list)), "waca": waca_val }
    except Exception as e:
        import traceback
        sys.stderr.write(f"EXTRACTION ERROR: {e}\n")
        traceback.print_exc(file=sys.stderr)
        return { "investors": [], "waca": None }


def main():
    parser = argparse.ArgumentParser(description="Extract Pre-IPO investors from RHP PDF")
    parser.add_argument("--company_name", help="Pass the base company name to filter out related-party promoters")
    parser.add_argument("--ipo_name", help="(Deprecated) Anchor investors now extracted via Node.js")
    parser.add_argument("--is_sme", action="store_true", help="(Deprecated)")
    parser.add_argument("--rhp", help="URL of RHP PDF")
    
    args = parser.parse_args()
    
    result = {
        "anchorInvestors": [],
        "preIpoInvestors": [],
        "waca": None,
        "peerComparison": None
    }
    
    if args.rhp:
        headers = {'User-Agent': 'Mozilla/5.0'}
        try:
            r = requests.get(args.rhp, headers=headers, timeout=30)
            if r.status_code == 200:
                content = r.content
                if content.startswith(b'PK\x03\x04') or args.rhp.lower().endswith('.zip'):
                    import zipfile
                    with zipfile.ZipFile(BytesIO(content)) as z:
                        pdf_names = [n for n in z.namelist() if n.lower().endswith('.pdf')]
                        if pdf_names:
                            # Prioritize PDFs with 'rhp' or 'prospectus' in the filename, excluding 'gid'
                            candidates = [n for n in pdf_names if ('rhp' in n.lower() or 'prospectus' in n.lower()) and 'gid' not in n.lower()]
                            if not candidates:
                                candidates = [n for n in pdf_names if 'gid' not in n.lower()]
                            if not candidates:
                                candidates = pdf_names
                            candidates.sort(key=lambda n: z.getinfo(n).file_size, reverse=True)
                            content = z.read(candidates[0])
                extract_res = extract_preipo_names(content, args.company_name)
                result["preIpoInvestors"] = extract_res.get("investors", [])
                result["waca"] = extract_res.get("waca")
                peer_res = extract_peer_comparison(content)
                if peer_res:
                    result["peerComparison"] = peer_res
        except Exception:
            pass
            
    print(json.dumps(result))

if __name__ == "__main__":
    main()
