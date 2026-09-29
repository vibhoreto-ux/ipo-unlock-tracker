import json, re, glob, os

def clean_num(s):
    if not s:
        return 0
    s_clean = re.sub(r"[^\d\.]", "", str(s))
    try:
        return float(s_clean)
    except:
        return 0

def parse_waca(text):
    # Search for certified WACA
    waca_matches = re.findall(r"(?:weighted average cost of acquisition|WACA)[^\n\d]*?(\d+(?:\.\d+)?)", text, re.IGNORECASE)
    for val in waca_matches:
        v = float(val)
        if 0.5 <= v <= 3000:
            return v
    return None

def parse_allotments(text, issue_price):
    investors = []
    
    # Split text into sections by date or allotment blocks
    # Look for patterns like "Date of allotment ... Issue Price per equity share ... Name of allottee ... Number of equity shares"
    lines = text.split("\n")
    
    current_date = None
    current_price = None
    current_nature = "Pre-IPO"
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Detect Date of allotment
        date_match = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(19\d\d|20\d\d)", line, re.IGNORECASE)
        if date_match:
            current_date = date_match.group(0)
            
            # Scan next 15 lines for price and nature
            for j in range(i, min(len(lines), i + 20)):
                l = lines[j].strip()
                if "bonus" in l.lower():
                    current_nature = "Bonus Issue"
                    current_price = 0.0
                elif "right" in l.lower():
                    current_nature = "Rights Issue"
                elif "private placement" in l.lower() or "preferential" in l.lower():
                    current_nature = "Private Placement"
                elif "further issue" in l.lower() or "allotment" in l.lower():
                    current_nature = "Equity Allotment"
                
                # Check for price
                # e.g. "10", "150", "270", "1,019"
                p_match = re.search(r"^(?:₹|Rs\.?)?\s*(\d{1,4}(?:\.\d{1,2})?)\s*$", l)
                if p_match and float(p_match.group(1)) > 0:
                    val = float(p_match.group(1))
                    if val in [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 125, 130, 140, 150, 160, 175, 200, 220, 230, 250, 270, 300, 350, 400, 500, 1000, 1019] or val < issue_price * 3:
                        current_price = val

        # Detect allottee lines: "1. Name 10,000" or "1  Name  10,000"
        inv_match = re.search(r"^(\d{1,3})\.?\s+([A-Za-z\s\.\&\(\)\-\'\/]{4,50})\s+([0-9\,]{3,12})$", line)
        if inv_match:
            sr = inv_match.group(1)
            name = inv_match.group(2).strip()
            shares_str = inv_match.group(3).replace(",", "")
            
            # Clean name
            name_clean = re.sub(r"^(Mr\.|Mrs\.|Ms\.|M\/s\.)\s*", "", name).strip()
            if len(name_clean) > 3 and not any(k in name_clean.lower() for k in ["equity", "shares", "number", "cumulative", "paid-up", "face value", "sr. no"]):
                try:
                    shares = int(shares_str)
                    bp = current_price if current_price is not None else 10.0
                    disc = round(((issue_price - bp) / issue_price) * 100, 2)
                    investors.append({
                        "name": name_clean,
                        "shares": shares,
                        "sharesFormatted": f"{shares:,}",
                        "buyPrice": bp,
                        "acquisitionPrice": bp,
                        "date": current_date or "Pre-IPO",
                        "category": current_nature,
                        "discountPct": disc,
                        "discount": disc
                    })
                except:
                    pass
        i += 1

    return investors

def main():
    with open("data/unlock-data.json", "r") as f:
        db = json.load(f)

    companies = db.get("companies", [])
    files = glob.glob("scratch/upcoming_cap/*.txt")
    print(f"Analyzing {len(files)} files...")

    updated_count = 0
    for fpath in files:
        fname = os.path.basename(fpath).replace(".txt", "")
        # match company
        matched_c = None
        for c in companies:
            cname_clean = re.sub(r"[^a-zA-Z0-9]", "_", c.get("companyName", ""))
            if fname == cname_clean or fname.lower() in cname_clean.lower() or cname_clean.lower() in fname.lower():
                matched_c = c
                break
        
        if not matched_c:
            continue

        cname = matched_c.get("companyName", "")
        issue_price = matched_c.get("issuePrice")
        if not issue_price and matched_c.get("priceBand"):
            pb = re.findall(r"(\d+)", matched_c.get("priceBand"))
            if pb:
                issue_price = float(pb[-1])
        if not issue_price:
            issue_price = 100.0

        with open(fpath, "r") as f:
            text = f.read()

        waca = parse_waca(text)
        investors = parse_allotments(text, issue_price)

        if waca and not matched_c.get("preIpoWaca"):
            matched_c["preIpoWaca"] = waca

        # If we found rich investors, deduplicate / aggregate by name
        if investors:
            # aggregate by name
            agg = {}
            for inv in investors:
                n = inv["name"]
                if n not in agg:
                    agg[n] = inv
                else:
                    agg[n]["shares"] += inv["shares"]
                    agg[n]["sharesFormatted"] = f"{agg[n]['shares']:,}"
            
            final_invs = list(agg.values())
            # sort by shares descending
            final_invs.sort(key=lambda x: x["shares"], reverse=True)
            
            # calculate WACA if not set
            if not matched_c.get("preIpoWaca") and final_invs:
                tot_s = sum(x["shares"] for x in final_invs)
                tot_val = sum(x["shares"] * x["buyPrice"] for x in final_invs)
                if tot_s > 0:
                    matched_c["preIpoWaca"] = round(tot_val / tot_s, 2)

            matched_c["preIpoInvestors"] = final_invs[:50]  # top 50
            matched_c["preIpoChecked"] = True
            updated_count += 1
            print(f"[SUCCESS] {cname}: {len(final_invs)} pre-IPO investors | WACA: ₹{matched_c.get('preIpoWaca')}")

    print(f"\nSuccessfully populated {updated_count} upcoming IPOs in unlock-data.json!")
    with open("data/unlock-data.json", "w") as f:
        json.dump(db, f, indent=2)

if __name__ == "__main__":
    main()
