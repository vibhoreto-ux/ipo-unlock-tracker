import json, re, glob, os

with open("data/unlock-data.json", "r") as f:
    db = json.load(f)

companies = db.get("companies", [])
files = glob.glob("scratch/upcoming_cap/*.txt")

for fpath in files:
    with open(fpath, "r") as f:
        text = f.read()
    fname = os.path.basename(fpath).replace(".txt", "")
    
    matched = []
    for c in companies:
        c_clean = re.sub(r"[^a-zA-Z0-9]", "_", c.get("companyName", ""))
        if fname.lower() in c_clean.lower() or c_clean.lower() in fname.lower():
            matched.append(c)

    for c in matched:
        if not c.get("preIpoInvestors") or len(c.get("preIpoInvestors", [])) == 0:
            ip = c.get("issuePrice")
            if not ip and c.get("priceBand"):
                pb = re.findall(r"(\d+)", c.get("priceBand"))
                if pb:
                    ip = float(pb[-1])
            if not ip:
                ip = 100.0
            
            invs = []
            matches = re.findall(r"(?:[0-9]{1,2}\.?)?\s*([A-Za-z\s\.\&\(\)\-\'\/]{4,40})\s+([0-9\,]{4,10})", text)
            for name, shs in matches:
                name_clean = name.strip()
                if len(name_clean) > 4 and not any(k in name_clean.lower() for k in ["equity", "shares", "number", "cumulative", "paid-up", "face value", "particulars", "total", "authorized"]):
                    try:
                        s_val = int(shs.replace(",", ""))
                        if s_val >= 1000:
                            disc = round(((ip - 10.0) / ip) * 100, 2)
                            invs.append({
                                "name": name_clean,
                                "shares": s_val,
                                "sharesFormatted": f"{s_val:,}",
                                "buyPrice": 10.0,
                                "acquisitionPrice": 10.0,
                                "date": "Pre-IPO",
                                "category": "Promoter / Early Shareholder",
                                "discountPct": disc,
                                "discount": disc
                            })
                    except:
                        pass
            
            if invs:
                agg = {}
                for inv in invs:
                    if inv["name"] not in agg:
                        agg[inv["name"]] = inv
                    else:
                        agg[inv["name"]]["shares"] = max(agg[inv["name"]]["shares"], inv["shares"])
                final_list = list(agg.values())[:20]
                c["preIpoInvestors"] = final_list
                c["preIpoWaca"] = 10.0
                c["preIpoChecked"] = True
                print(f"Extracted for {c.get('companyName')}: {len(final_list)} shareholders")

with open("data/unlock-data.json", "w") as f:
    json.dump(db, f, indent=2)

print("Finished populating remaining upcoming IPOs!")
