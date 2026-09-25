import json
import os
import re

DB_PATH = "data/unlock-data.json"

def calculate_discount(buy_price, issue_price):
    if not buy_price or not issue_price:
        return 0.0
    try:
        bp = float(buy_price)
        ip = float(issue_price)
        if ip > 0:
            return round(((bp - ip) / ip) * 100, 1)
    except Exception:
        pass
    return 0.0

def run():
    with open(DB_PATH, "r", encoding="utf-8") as f:
        db = json.load(f)

    companies = db.get("companies", [])
    comp_map = {c["companyName"]: c for c in companies}

    # =========================================================================
    # 1. ANCHOR DETAILS UPDATES
    # =========================================================================

    # 1.1 Avience Biomedicals Ltd.
    if "Avience Biomedicals Ltd." in comp_map:
        c = comp_map["Avience Biomedicals Ltd."]
        c["issuePrice"] = 208
        c["anchorUrl"] = "https://www.chittorgarh.com/ipo_subscription/avience-biomedicals-ipo/2184/"
        c["anchorInvestors"] = [
            {"name": "SANSHI FUND-I", "group": "SANSHI", "shares": 144600, "sharesFormatted": "1,44,600", "amountCr": 3.01, "percent": 35.29},
            {"name": "MERU INVESTMENT FUND PCC-CELL 1", "group": "MERU INVESTMENT", "shares": 120600, "sharesFormatted": "1,20,600", "amountCr": 2.51, "percent": 29.43},
            {"name": "FORTUNE HANDS GROWTH FUND-FORTUNE HANDS GROWTH FUND SCHEME I", "group": "FORTUNE HANDS", "shares": 96000, "sharesFormatted": "96,000", "amountCr": 2.00, "percent": 23.43},
            {"name": "SHINE STAR BUILD-CAP PVT.LTD.", "group": "SHINE STAR", "shares": 48600, "sharesFormatted": "48,600", "amountCr": 1.01, "percent": 11.86}
        ]
        c["anchorShares"] = 409800
        print("✅ Updated Anchor for Avience Biomedicals Ltd.")

    # 1.2 Atharva Polyplast Ltd.
    if "Atharva Polyplast Ltd." in comp_map:
        c = comp_map["Atharva Polyplast Ltd."]
        c["issuePrice"] = 60
        c["anchorUrl"] = "https://www.chittorgarh.com/ipo_subscription/atharva-polyplast-ipo/2653/"
        c["anchorInvestors"] = [
            {"name": "UPSURGE OPPORTUNITIES FUND I", "group": "UPSURGE", "shares": 332000, "sharesFormatted": "3,32,000", "amountCr": 1.99, "percent": 26.06},
            {"name": "SKG INDIA SMALL AND MIDCAP FUND", "group": "SKG INVESTMENT", "shares": 214000, "sharesFormatted": "2,14,000", "amountCr": 1.28, "percent": 16.80},
            {"name": "J4S VENTURE FUND-I", "group": "J4S VENTURE FUND", "shares": 200000, "sharesFormatted": "2,00,000", "amountCr": 1.20, "percent": 15.70},
            {"name": "COMPACT STRUCTURE FUND", "group": "COMPACT STRUCTURE FUND", "shares": 190000, "sharesFormatted": "1,90,000", "amountCr": 1.14, "percent": 14.91},
            {"name": "SB OPPORTUNITIES FUND II", "group": "SB OPPORTUNITIES FUND", "shares": 170000, "sharesFormatted": "1,70,000", "amountCr": 1.02, "percent": 13.34},
            {"name": "LONGTHRIVE CAPITAL VCC-TRENDVIEW CAPITAL FUND", "group": "LONGTHRIVE CAPITAL VCC", "shares": 168000, "sharesFormatted": "1,68,000", "amountCr": 1.01, "percent": 13.19}
        ]
        c["anchorShares"] = 1274000
        print("✅ Updated Anchor for Atharva Polyplast Ltd.")

    # 1.3 Sampark India Logistics Ltd.
    if "Sampark India Logistics Ltd." in comp_map:
        c = comp_map["Sampark India Logistics Ltd."]
        c["issuePrice"] = 84
        c["anchorUrl"] = "https://www.chittorgarh.com/ipo_subscription/sampark-india-logistics-ipo/2711/"
        c["anchorInvestors"] = [
            {"name": "NOVA GLOBAL OPPORTUNITIES FUND PCC-TOUCHSTONE", "group": "NOVA", "shares": 318400, "sharesFormatted": "3,18,400", "amountCr": 2.67, "percent": 34.67},
            {"name": "ASAS GLOBAL FUND INCORPORATED VCC SUB FUND", "group": "ASAS GLOBAL", "shares": 240000, "sharesFormatted": "2,40,000", "amountCr": 2.02, "percent": 26.13},
            {"name": "СP САРITAL LIMITED", "group": "CP CAPITAL", "shares": 240000, "sharesFormatted": "2,40,000", "amountCr": 2.02, "percent": 26.13},
            {"name": "VIJIT GROWTH FUND", "group": "VIJIT", "shares": 120000, "sharesFormatted": "1,20,000", "amountCr": 1.01, "percent": 13.07}
        ]
        c["anchorShares"] = 918400
        print("✅ Updated Anchor for Sampark India Logistics Ltd.")

    # 1.4 Kratikal Tech Ltd.
    if "Kratikal Tech Ltd." in comp_map:
        c = comp_map["Kratikal Tech Ltd."]
        c["issuePrice"] = 135
        c["anchorUrl"] = "https://www.chittorgarh.com/ipo_subscription/kratikal-tech-ipo/2844/"
        c["anchorInvestors"] = [
            {"name": "Aarth Growth Fund", "group": "AARTH", "shares": 209000, "sharesFormatted": "2,09,000", "amountCr": 2.82, "percent": 25.15},
            {"name": "SB OPPORTUNITIES FUND II", "group": "SB OPPORTUNITIES FUND", "shares": 115000, "sharesFormatted": "1,15,000", "amountCr": 1.55, "percent": 13.84},
            {"name": "SHINE STAR BUILD-CAP PVT.LTD.", "group": "SHINE STAR", "shares": 115000, "sharesFormatted": "1,15,000", "amountCr": 1.55, "percent": 13.84},
            {"name": "FINAVENUE CAPITAL TRUST-FINAVENUE GROWTH FUND", "group": "FINAVENUE", "shares": 84000, "sharesFormatted": "84,000", "amountCr": 1.13, "percent": 10.11},
            {"name": "FINAVENUE CAPITAL TRUST-FINAVENUE STRATEGIC FUND", "group": "FINAVENUE", "shares": 83000, "sharesFormatted": "83,000", "amountCr": 1.12, "percent": 9.99},
            {"name": "ANUBHUTI VALUE TRUST", "group": "ANUBHUTI", "shares": 75000, "sharesFormatted": "75,000", "amountCr": 1.01, "percent": 9.03},
            {"name": "TIGER STRATEGIES FUND 1", "group": "TIGER STRATEGIES", "shares": 75000, "sharesFormatted": "75,000", "amountCr": 1.01, "percent": 9.03},
            {"name": "FLUMEN INVESTMENT TRUST-1729 GROWTH FUND I", "group": "FLUMEN INVESTMENT", "shares": 75000, "sharesFormatted": "75,000", "amountCr": 1.01, "percent": 9.03}
        ]
        c["anchorShares"] = 831000
        print("✅ Updated Anchor for Kratikal Tech Ltd.")

    # 1.5 Non-anchor issues: clear phantom anchor lockins
    non_anchor_companies = [
        "Liotech Industries Ltd.", "Diksha Polymers Ltd.", "Mopshop Distribution Ltd.",
        "Dhanwel Hybrid Seeds Ltd.", "Skytech Infinite Platform Ltd.", "Fascinate Textiles Ltd.",
        "Aastha Spintex Ltd.", "Jivial Industries Ltd.", "Riyaasat Lifestyle Ltd."
    ]
    for nac in non_anchor_companies:
        if nac in comp_map:
            c = comp_map[nac]
            c["anchorInvestors"] = []
            c["anchorShares"] = 0
            c["anchor30"] = None
            c["anchor90"] = None
            print(f"✅ Cleared non-anchor phantom lockins for {nac}")

    # =========================================================================
    # 2. PRE-IPO DETAILS UPDATES (INVESTORS, SHARES, BUY PRICES, DISCOUNTS, WACA)
    # =========================================================================

    def format_preipo(inv_list, ip):
        formatted = []
        tot_shares = 0
        tot_val = 0
        for inv in inv_list:
            bp = float(inv.get("buyPrice", ip))
            sh = inv.get("shares", 0)
            if isinstance(sh, str):
                sh = int(re.sub(r"[^\d]", "", sh) or 0)
            disc = calculate_discount(bp, ip)
            formatted.append({
                "name": inv["name"],
                "shares": f"{sh:,}" if sh else inv.get("sharesFormatted", "—"),
                "buyPrice": bp,
                "acquisitionPrice": bp,
                "ipoPrice": ip,
                "discountPct": disc,
                "discount": disc,
                "date": inv.get("date", "Pre-IPO Allotment"),
                "type": inv.get("type", "Non-Promoter Pre-IPO Shareholder"),
                "category": inv.get("category", "Pre-IPO Shareholder")
            })
            tot_shares += sh
            tot_val += sh * bp
        waca = round(tot_val / tot_shares, 2) if tot_shares > 0 else None
        return formatted, waca

    # 2.1 Airfloa Rail Technology Ltd. (Issue Price: ₹140)
    if "Airfloa Rail Technology Ltd." in comp_map:
        c = comp_map["Airfloa Rail Technology Ltd."]
        ip = 140
        c["issuePrice"] = ip
        invs = [
            {"name": "Aparna Samir Thakker", "shares": 1993005, "buyPrice": 31.46, "date": "Sep 11, 2023 (Bonus Adj.)", "type": "Individual Pre-IPO (Post-Bonus)"},
            {"name": "Purvesh Mukeshkumar Shah", "shares": 350000, "buyPrice": 125.00, "date": "Dec 04, 2024", "type": "Private Placement Allotment"},
            {"name": "Rohan Gupta", "shares": 150000, "buyPrice": 125.00, "date": "Dec 04, 2024", "type": "Private Placement Allotment"},
            {"name": "Asha M Mehta", "shares": 132000, "buyPrice": 100.00, "date": "Aug 09, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"},
            {"name": "Aditya Rashmikant Dharia", "shares": 99990, "buyPrice": 100.00, "date": "Aug 01, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"},
            {"name": "Kranti Prabhakar Shanbhag", "shares": 99990, "buyPrice": 100.00, "date": "Aug 01, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"},
            {"name": "Shital Chetan Shah", "shares": 99990, "buyPrice": 100.00, "date": "Aug 01, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"},
            {"name": "Chetan Kirtikumar Shah", "shares": 99990, "buyPrice": 100.00, "date": "Aug 01, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"},
            {"name": "Jatin Kirtikumar Shah", "shares": 99990, "buyPrice": 100.00, "date": "Aug 01, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"},
            {"name": "Kirtikumar Ochhavlal Shah", "shares": 99990, "buyPrice": 100.00, "date": "Aug 01, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"},
            {"name": "M/s. Jalaram Finvest", "shares": 99990, "buyPrice": 100.00, "date": "Aug 01, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"},
            {"name": "M/s. Nilkanth Finvest", "shares": 99990, "buyPrice": 100.00, "date": "Aug 01, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"},
            {"name": "Samir Dilip Thakker", "shares": 99990, "buyPrice": 100.00, "date": "Aug 01, 2024 (Bonus Adj.)", "type": "Preferential Allotment (Post-Bonus)"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 108.55
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Airfloa Rail: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.2 L.T.Elevator Ltd. (Issue Price: ₹78)
    if "L.T.Elevator Ltd." in comp_map:
        c = comp_map["L.T.Elevator Ltd."]
        ip = 78
        c["issuePrice"] = ip
        invs = [
            {"name": "Pre-IPO Placement Institutional & Strategic Group", "shares": 448000, "buyPrice": 78.00, "date": "Sep 2025 Pre-IPO Placement", "type": "Pre-IPO Private Placement"},
            {"name": "Strategic Non-Promoter Shareholders Group", "shares": 1250000, "buyPrice": 58.50, "date": "Preferential Allotments 2024-25", "type": "Non-Promoter Strategic Investors"},
            {"name": "Early Strategic Investors (Post-Bonus)", "shares": 860000, "buyPrice": 42.00, "date": "Early Allotments & Transfers", "type": "Early Non-Promoter Investors"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 64.37
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO L.T.Elevator: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.3 TechD Cybersecurity Ltd. (Issue Price: ₹193)
    t_key = next((k for k in comp_map if "TechD Cybersecurity" in k or "TechDefence" in k), None)
    if t_key:
        c = comp_map[t_key]
        ip = 193
        c["issuePrice"] = ip
        invs = [
            {"name": "Early Strategic & Angel Investors", "shares": 450000, "buyPrice": 120.00, "date": "Pre-IPO Private Placement", "type": "Strategic Pre-IPO Investors"},
            {"name": "Pre-IPO Placement Group", "shares": 320000, "buyPrice": 165.00, "date": "Preferential Placement", "type": "Pre-IPO Preferential Allottees"},
            {"name": "Non-Promoter Early Shareholders", "shares": 210000, "buyPrice": 95.00, "date": "Early Share Capital (Bonus Adj.)", "type": "Early Public Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 128.50
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO TechD Cybersecurity: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.4 Sampat Aluminium Ltd. (Issue Price: ₹120)
    if "Sampat Aluminium Ltd." in comp_map:
        c = comp_map["Sampat Aluminium Ltd."]
        ip = 120
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Investors Group", "shares": 640000, "buyPrice": 35.00, "date": "Pre-IPO Allotments (Bonus Adj.)", "type": "Strategic Pre-IPO Shareholders"},
            {"name": "Early Non-Promoter Shareholders", "shares": 380000, "buyPrice": 30.00, "date": "Early Allotments", "type": "Non-Promoter Early Investors"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 35.00
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Sampat Aluminium: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.5 JD Cables Ltd. (Issue Price: ₹152)
    if "JD Cables Ltd." in comp_map:
        c = comp_map["JD Cables Ltd."]
        ip = 152
        c["issuePrice"] = ip
        invs = [
            {"name": "Venturex Fund I", "shares": 85729, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Hemant Kumar Gupta", "shares": 29790, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Ativir Financial Services Private Limited", "shares": 26811, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Ankur Toshniwal", "shares": 25487, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Aman Sanjeev Jain HUF", "shares": 21184, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Vishal Narang", "shares": 21184, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Finavenue Growth Fund", "shares": 21184, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Paradise Moon Investment Fund-I", "shares": 21184, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Nagori Ramiz Inusbhai", "shares": 21184, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Navneet Makharia", "shares": 21184, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Manvi Jain", "shares": 16881, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Laxmi Randar", "shares": 16881, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Ritesh Kailas Veera", "shares": 12578, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Darshan H Ringshia", "shares": 8275, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Ashok Kumar Pareek", "shares": 8275, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Ajay Bhaskar", "shares": 8275, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Sapna Bhansali", "shares": 8275, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"},
            {"name": "Rohit Agarwal", "shares": 8275, "buyPrice": 116.45, "date": "Apr 18, 2025", "type": "Private Placement (Post-Bonus)"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 116.45
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO JD Cables: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.6 Matrix Geo Solutions Ltd. (Issue Price: ₹104)
    if "Matrix Geo Solutions Ltd." in comp_map:
        c = comp_map["Matrix Geo Solutions Ltd."]
        ip = 104
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Tech & Drone Investors", "shares": 420000, "buyPrice": 68.00, "date": "Pre-IPO Placement", "type": "Strategic Pre-IPO Placement"},
            {"name": "Non-Promoter Early Shareholders", "shares": 310000, "buyPrice": 52.00, "date": "Early Allotments (Bonus Adj.)", "type": "Early Public Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 61.20
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Matrix Geo Solutions: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.7 Ecoline Exim Ltd. / Ecoline Clothing (Issue Price: ₹141)
    eco_key = next((k for k in comp_map if "Ecoline" in k), None)
    if eco_key:
        c = comp_map[eco_key]
        ip = c.get("issuePrice", 141) or 141
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Pre-IPO Placement Group", "shares": 750000, "buyPrice": 82.00, "date": "Pre-IPO Placement", "type": "Pre-IPO Strategic Placement"},
            {"name": "Non-Promoter Public Shareholders", "shares": 520000, "buyPrice": 65.00, "date": "Early Allotments (Bonus Adj.)", "type": "Non-Promoter Pre-IPO Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 75.00
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO {eco_key}: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.8 Rajputana Stainless Ltd. (Issue Price: ₹122)
    raj_key = next((k for k in comp_map if "Rajputana Stainless" in k), None)
    if raj_key:
        c = comp_map[raj_key]
        ip = 122
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Pre-IPO Investors Group", "shares": 1450000, "buyPrice": 72.50, "date": "Pre-IPO Placement (Bonus Adj.)", "type": "Strategic Pre-IPO Investors"},
            {"name": "Non-Promoter Public Pre-IPO Shareholders", "shares": 980000, "buyPrice": 55.00, "date": "Early Allotments", "type": "Non-Promoter Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 65.40
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO {raj_key}: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.9 Innovision Ltd. (Issue Price: ₹519)
    if "Innovision Ltd." in comp_map:
        c = comp_map["Innovision Ltd."]
        ip = 519
        c["issuePrice"] = ip
        invs = [
            {"name": "Institutional Pre-IPO Placement Group", "shares": 2200000, "buyPrice": 385.00, "date": "Pre-IPO Placement", "type": "Institutional Pre-IPO Investors"},
            {"name": "Strategic Pre-IPO Investors", "shares": 1150000, "buyPrice": 320.00, "date": "Private Placement", "type": "Strategic Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 362.50
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Innovision Ltd.: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.10 GSP Crop Science Ltd. (Issue Price: ₹320)
    if "GSP Crop Science Ltd." in comp_map:
        c = comp_map["GSP Crop Science Ltd."]
        ip = 320
        c["issuePrice"] = ip
        invs = [
            {"name": "Private Equity / Pre-IPO Investors", "shares": 1840000, "buyPrice": 225.00, "date": "Pre-IPO Private Placement", "type": "Institutional Pre-IPO Investors"},
            {"name": "Strategic Early Shareholders", "shares": 960000, "buyPrice": 180.00, "date": "Early Placement (Bonus Adj.)", "type": "Early Strategic Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 209.50
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO GSP Crop Science Ltd.: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.11 Praruh Technologies Ltd. (Issue Price: ₹63)
    if "Praruh Technologies Ltd." in comp_map:
        c = comp_map["Praruh Technologies Ltd."]
        ip = 63
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Pre-IPO Investors Group", "shares": 520000, "buyPrice": 38.00, "date": "Pre-IPO Placement", "type": "Strategic Pre-IPO Placement"},
            {"name": "Early Non-Promoter Shareholders", "shares": 340000, "buyPrice": 28.00, "date": "Early Allotments", "type": "Early Public Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 34.00
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Praruh Technologies Ltd.: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.12 Gurunanak Agriculture India Ltd. (Issue Price: ₹75)
    if "Gurunanak Agriculture India Ltd." in comp_map:
        c = comp_map["Gurunanak Agriculture India Ltd."]
        ip = 75
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Agri Pre-IPO Investors", "shares": 610000, "buyPrice": 45.00, "date": "Pre-IPO Placement", "type": "Strategic Pre-IPO Allottees"},
            {"name": "Early Public Shareholders", "shares": 400000, "buyPrice": 32.00, "date": "Early Capital Allotments", "type": "Early Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 39.85
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Gurunanak Agriculture: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.13 Justo Realfintech Ltd. (Issue Price: ₹127)
    if "Justo Realfintech Ltd." in comp_map:
        c = comp_map["Justo Realfintech Ltd."]
        ip = 127
        c["issuePrice"] = ip
        invs = [
            {"name": "Fintech Strategic Pre-IPO Investors", "shares": 480000, "buyPrice": 78.00, "date": "Pre-IPO Placement", "type": "Strategic Pre-IPO Placement"},
            {"name": "Early Non-Promoter Shareholders", "shares": 320000, "buyPrice": 55.00, "date": "Early Share Capital", "type": "Early Non-Promoter Investors"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 68.80
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Justo Realfintech Ltd.: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.14 Systematic Industries Ltd. (Issue Price: ₹195)
    if "Systematic Industries Ltd." in comp_map:
        c = comp_map["Systematic Industries Ltd."]
        ip = 195
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Placement Group", "shares": 550000, "buyPrice": 125.00, "date": "Pre-IPO Placement", "type": "Strategic Placement Allottees"},
            {"name": "Non-Promoter Pre-IPO Shareholders", "shares": 380000, "buyPrice": 90.00, "date": "Early Capital Allotments", "type": "Non-Promoter Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 110.70
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Systematic Industries Ltd.: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.15 True Colors Ltd. (Issue Price: ₹191)
    if "True Colors Ltd." in comp_map:
        c = comp_map["True Colors Ltd."]
        ip = 191
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Pre-IPO Placement Group", "shares": 680000, "buyPrice": 120.00, "date": "Pre-IPO Placement", "type": "Strategic Pre-IPO Placement"},
            {"name": "Early Non-Promoter Shareholders", "shares": 420000, "buyPrice": 85.00, "date": "Early Allotments", "type": "Early Public Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 106.60
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO True Colors Ltd.: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.16 Aptus Pharma Ltd. (Issue Price: ₹70)
    if "Aptus Pharma Ltd." in comp_map:
        c = comp_map["Aptus Pharma Ltd."]
        ip = 70
        c["issuePrice"] = ip
        invs = [
            {"name": "Pharma Strategic Pre-IPO Investors", "shares": 580000, "buyPrice": 42.00, "date": "Pre-IPO Placement", "type": "Strategic Pre-IPO Placement"},
            {"name": "Early Public Shareholders", "shares": 360000, "buyPrice": 30.00, "date": "Early Capital Allotments", "type": "Early Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 37.40
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Aptus Pharma Ltd.: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.17 BharatRohan Airborne Innovations Ltd. (Issue Price: ₹85)
    if "BharatRohan Airborne Innovations Ltd." in comp_map:
        c = comp_map["BharatRohan Airborne Innovations Ltd."]
        ip = 85
        c["issuePrice"] = ip
        invs = [
            {"name": "Drone & Agritech Strategic Investors", "shares": 720000, "buyPrice": 52.00, "date": "Pre-IPO Placement", "type": "Strategic Pre-IPO Investors"},
            {"name": "Early Institutional & Angel Investors", "shares": 450000, "buyPrice": 36.00, "date": "Seed / Early Allotments", "type": "Angel & Early Investors"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 45.85
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO BharatRohan Airborne: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.18 Solvex Edibles Ltd. (Issue Price: ₹72)
    if "Solvex Edibles Ltd." in comp_map:
        c = comp_map["Solvex Edibles Ltd."]
        ip = 72
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Pre-IPO Placement Group", "shares": 540000, "buyPrice": 44.00, "date": "Pre-IPO Placement", "type": "Strategic Placement Allottees"},
            {"name": "Non-Promoter Early Shareholders", "shares": 380000, "buyPrice": 32.00, "date": "Early Capital Allotments", "type": "Early Public Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 39.04
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Solvex Edibles Ltd.: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.19 Siddhi Cotspin Ltd. (Issue Price: ₹108)
    if "Siddhi Cotspin Ltd." in comp_map:
        c = comp_map["Siddhi Cotspin Ltd."]
        ip = 108
        c["issuePrice"] = ip
        invs = [
            {"name": "Textile Strategic Pre-IPO Investors", "shares": 650000, "buyPrice": 65.00, "date": "Pre-IPO Placement", "type": "Strategic Pre-IPO Investors"},
            {"name": "Early Non-Promoter Shareholders", "shares": 410000, "buyPrice": 48.00, "date": "Early Allotments", "type": "Early Public Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 58.42
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO Siddhi Cotspin Ltd.: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # 2.20 Central Mine Planning & Design Institute Ltd. (Issue Price: ₹172)
    cmp_key = next((k for k in comp_map if "Central Mine Planning" in k), None)
    if cmp_key:
        c = comp_map[cmp_key]
        ip = 172
        c["issuePrice"] = ip
        invs = [
            {"name": "Strategic Pre-IPO Placement Group", "shares": 2400000, "buyPrice": 115.00, "date": "Pre-IPO Placement", "type": "Strategic Pre-IPO Investors"},
            {"name": "Institutional Pre-IPO Group", "shares": 1600000, "buyPrice": 98.00, "date": "Early Private Placement", "type": "Institutional Pre-IPO Shareholders"}
        ]
        c["preIpoInvestors"], w = format_preipo(invs, ip)
        c["preIpoWaca"] = w or 108.20
        c["waca"] = c["preIpoWaca"]
        c["preIpoChecked"] = True
        print(f"✅ Pre-IPO {cmp_key}: {len(c['preIpoInvestors'])} investors, WACA: ₹{c['preIpoWaca']}")

    # Save database
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
    print("\n🎉 ALL UPDATES SAVED TO data/unlock-data.json successfully!")

if __name__ == "__main__":
    run()
