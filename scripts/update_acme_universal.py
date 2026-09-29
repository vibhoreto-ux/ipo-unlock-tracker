import json

with open("data/unlock-data.json", "r") as f:
    db = json.load(f)

acme_universal_preipo = [
    {"name": "Manoj Agarwal", "shares": 102630, "sharesFormatted": "1,02,630", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Sanjay Popatlal Jain", "shares": 102630, "sharesFormatted": "1,02,630", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Jignesh Amrutlal Thobhani", "shares": 102630, "sharesFormatted": "1,02,630", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Citrine Investments / Santosh Rani", "shares": 78960, "sharesFormatted": "78,960", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Manish Kumar", "shares": 55260, "sharesFormatted": "55,260", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Utsav Pramodkumar Srivastav", "shares": 39480, "sharesFormatted": "39,480", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Vinod Somani", "shares": 23700, "sharesFormatted": "23,700", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Himadri Agarwal Sharma", "shares": 15780, "sharesFormatted": "15,780", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Sandeep Aggarwal", "shares": 15780, "sharesFormatted": "15,780", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Ajit Kumar", "shares": 15780, "sharesFormatted": "15,780", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Prosperity Catalyst OPC Private Limited", "shares": 15780, "sharesFormatted": "15,780", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80},
    {"name": "Ankita Agrawal", "shares": 7890, "sharesFormatted": "7,890", "buyPrice": 63.33, "acquisitionPrice": 63.33, "date": "16-Jan-2026 (Split+Bonus: 20-Feb-2026)", "category": "Pre-IPO Preferential Allotment", "discountPct": 10.80, "discount": 10.80}
]

for c in db.get("companies", []):
    cname = c.get("companyName", "")
    if "acme universal" in cname.lower():
        c["preIpoInvestors"] = acme_universal_preipo
        c["preIpoWaca"] = 63.33
        c["preIpoChecked"] = True
        print(f"Updated {cname} Pre-IPO: {len(acme_universal_preipo)} investors @ Rs 63.33 (WACA: 63.33)")

with open("data/unlock-data.json", "w") as f:
    json.dump(db, f, indent=2)
