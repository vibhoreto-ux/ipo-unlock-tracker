import urllib.request, fitz, json, re, os

def clean_num(s):
    if not s:
        return 0
    s_clean = re.sub(r"[^\d\.]", "", str(s))
    try:
        return float(s_clean)
    except:
        return 0

def extract_for_company(cap_url, rhp_url, cname, issue_price):
    urls = [u for u in [cap_url, rhp_url] if u and u.startswith("http")]
    if not urls:
        return None

    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            content = urllib.request.urlopen(req, timeout=25).read()
            doc = fitz.open(stream=content, filetype="pdf")
            
            investors = []
            waca = None
            
            # Scan all pages
            for p in range(len(doc)):
                blocks = doc[p].get_text("blocks")
                for b in blocks:
                    text = b[4]
                    
                    # Check for WACA
                    w_match = re.search(r"(?:weighted average cost of acquisition|WACA)[^\n\d]*?(\d+(?:\.\d+)?)", text, re.IGNORECASE)
                    if w_match and not waca:
                        v = float(w_match.group(1))
                        if 0.01 <= v <= 3000:
                            waca = v

                    # Check for table blocks with Shareholder names and share counts
                    # Pattern e.g. "Satish Kumar Vijayaragavan 22,02,000 0.29" or "1. Patel Faruk 7,07,860"
                    lines = [l.strip() for l in text.split("\n") if l.strip()]
                    for line in lines:
                        # Match name followed by shares and optionally price or percentage
                        m = re.search(r"^(?:[0-9]{1,3}\.?)?\s*([A-Za-z\s\.\&\(\)\-\'\/]{4,50})\s+([0-9\,]{4,12})(?:\s+([0-9\.\%]+))?", line)
                        if m:
                            name = m.group(1).strip()
                            shares_str = m.group(2).replace(",", "")
                            extra = m.group(3) or ""
                            
                            # Clean name
                            name_clean = re.sub(r"^(Mr\.|Mrs\.|Ms\.|M\/s\.)\s*", "", name).strip()
                            # Exclude headers
                            if any(k in name_clean.lower() for k in ["equity", "shares", "number", "cumulative", "paid-up", "face value", "sr. no", "particulars", "total", "authorized", "present offer", "net offer", "market maker", "promoter"]):
                                continue
                            
                            try:
                                shares = int(shares_str)
                                if shares < 100:
                                    continue
                                
                                # Determine price
                                price = None
                                if extra and not extra.endswith("%"):
                                    try:
                                        p_val = float(extra)
                                        if p_val <= issue_price * 2:
                                            price = p_val
                                    except:
                                        pass
                                
                                if price is None:
                                    price = waca if waca is not None else 10.0
                                
                                disc = round(((issue_price - price) / issue_price) * 100, 2)
                                investors.append({
                                    "name": name_clean,
                                    "shares": shares,
                                    "sharesFormatted": f"{shares:,}",
                                    "buyPrice": price,
                                    "acquisitionPrice": price,
                                    "date": "Pre-IPO",
                                    "category": "Pre-IPO / Promoter Allottee",
                                    "discountPct": disc,
                                    "discount": disc
                                })
                            except:
                                pass

            if investors:
                # deduplicate and sort
                agg = {}
                for inv in investors:
                    n = inv["name"]
                    if n not in agg:
                        agg[n] = inv
                    else:
                        agg[n]["shares"] = max(agg[n]["shares"], inv["shares"])
                        agg[n]["sharesFormatted"] = f"{agg[n]['shares']:,}"
                
                final_invs = list(agg.values())
                final_invs.sort(key=lambda x: x["shares"], reverse=True)
                
                if not waca and final_invs:
                    tot_s = sum(x["shares"] for x in final_invs)
                    tot_v = sum(x["shares"] * x["buyPrice"] for x in final_invs)
                    if tot_s > 0:
                        waca = round(tot_v / tot_s, 2)

                return {
                    "waca": waca or 10.0,
                    "investors": final_invs[:50]
                }
        except Exception as e:
            print(f"Error {cname} from {url}: {e}")
            continue
            
    return None

def main():
    with open("data/unlock-data.json", "r") as f:
        db = json.load(f)

    companies = db.get("companies", [])
    
    # Filter upcoming IPOs
    today = "2026-09-28"
    print(f"Total companies in database: {len(companies)}")

    updated = 0
    for c in companies:
        cname = c.get("companyName", "")
        # Check if company needs pre-IPO extraction
        has_rich = False
        if Array_is_valid := (isinstance(c.get("preIpoInvestors"), list) and len(c.get("preIpoInvestors")) > 0):
            has_rich = any(isinstance(p, dict) and p.get("buyPrice") is not None for p in c["preIpoInvestors"])
        
        # Only process if missing rich pre-IPO data and has URL
        if not has_rich and (c.get("capitalStructureUrl") or c.get("rhpUrl")):
            ip = c.get("issuePrice")
            if not ip and c.get("priceBand"):
                pb = re.findall(r"(\d+)", c.get("priceBand"))
                if pb:
                    ip = float(pb[-1])
            if not ip:
                ip = 100.0
                
            res = extract_for_company(c.get("capitalStructureUrl"), c.get("rhpUrl"), cname, ip)
            if res and res["investors"]:
                c["preIpoInvestors"] = res["investors"]
                c["preIpoWaca"] = res["waca"]
                c["preIpoChecked"] = True
                updated += 1
                print(f"[SUCCESS] {cname}: {len(res['investors'])} investors | WACA: ₹{res['waca']}")

    print(f"\nSuccessfully extracted and updated {updated} companies!")
    with open("data/unlock-data.json", "w") as f:
        json.dump(db, f, indent=2)

if __name__ == "__main__":
    main()
