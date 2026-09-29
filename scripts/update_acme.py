import json

with open("data/unlock-data.json", "r") as f:
    db = json.load(f)

acme_india_preipo = [
    {"name": "Sanshi Fund – I", "shares": 525600, "sharesFormatted": "5,25,600", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Rajesh Gupta", "shares": 79200, "sharesFormatted": "79,200", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Sunrise Investment Trust – Sunrise Opportunities Fund", "shares": 52800, "sharesFormatted": "52,800", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Viney Growth Fund", "shares": 52800, "sharesFormatted": "52,800", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Borana Weaves", "shares": 52800, "sharesFormatted": "52,800", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Khushboo Parakh", "shares": 52800, "sharesFormatted": "52,800", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Pitam Goel", "shares": 52800, "sharesFormatted": "52,800", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Sanjay Popatlal Jain", "shares": 52800, "sharesFormatted": "52,800", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Pooja Bansal", "shares": 27600, "sharesFormatted": "27,600", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Anant Trafina Private Limited", "shares": 26400, "sharesFormatted": "26,400", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Knockta Dealcomm Private Limited", "shares": 26400, "sharesFormatted": "26,400", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Anjuli Kothari", "shares": 26400, "sharesFormatted": "26,400", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Naresh Kumar Bhargava", "shares": 26400, "sharesFormatted": "26,400", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06},
    {"name": "Hotspot Infodot Private Limited", "shares": 25200, "sharesFormatted": "25,200", "buyPrice": 190.0, "acquisitionPrice": 190.0, "date": "11-Dec-2025", "category": "Pre-IPO Private Placement", "discountPct": 3.06, "discount": 3.06}
]

for c in db.get("companies", []):
    cname = c.get("companyName", "")
    if "acme india" in cname.lower():
        c["preIpoInvestors"] = acme_india_preipo
        c["preIpoWaca"] = 190.0
        c["preIpoChecked"] = True
        print(f"Updated {cname} Pre-IPO: {len(acme_india_preipo)} investors @ Rs 190 (WACA: 190.0)")

with open("data/unlock-data.json", "w") as f:
    json.dump(db, f, indent=2)
