from flask import Flask, jsonify, render_template
from flask_cors import CORS
import requests, pdfplumber, re, io, time, json
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

nse = requests.Session()
nse.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
})

def init_session():
    try:
        nse.get("https://www.nseindia.com", timeout=10)
        time.sleep(1.5)
        nse.get("https://www.nseindia.com/companies-listing/corporate-filings-announcements", timeout=10)
        time.sleep(1)
    except: pass

def fetch_anns(from_date, to_date):
    try:
        r = nse.get("https://www.nseindia.com/api/corporate-announcements",
                    params={"index":"equities","from_date":from_date,"to_date":to_date}, timeout=15)
        return r.json() if r.status_code == 200 else []
    except: return []

def is_ams(a):
    txt = (a.get("desc","") + a.get("subject","") + a.get("attchmnt","")).lower()
    return "trading approval" in txt or ("ams" in a.get("attchmnt","").lower() and "preferential" in txt)

def parse_pdf(url):
    try:
        r = nse.get(url, timeout=20)
        with pdfplumber.open(io.BytesIO(r.content)) as pdf:
            text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception as e:
        return None

    out = {"symbol":None,"company":None,"isin":None,"shares":None,"unlock_date":None,"series":"EQ"}

    m = re.search(r"Symbol\s*[:\-]?\s*([A-Z0-9&]+)", text)
    if m: out["symbol"] = m.group(1).strip()

    m = re.search(r"ISIN\s*[:\-]?\s*(IN[A-Z0-9]{10})", text)
    if m: out["isin"] = m.group(1).strip()

    m = re.search(r"([\w\s&\.]+(?:Limited|Ltd\.?))", text)
    if m: out["company"] = m.group(1).strip()

    # shares — matches Indian number format
    for pat in [
        r"(?:trading approval|admitted to dealings)[^0-9]*([\d,]+)\s*(?:equity\s*)?shares",
        r"No\.\s*of\s*Securities[^0-9]*([\d,]+)",
        r"([\d,]{5,})\s*(?:Equity\s*)?[Ss]hares\s*of\s*Rs",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            out["shares"] = int(m.group(1).replace(",",""))
            break

    # unlock date — "Date upto which lock-in" table column
    for pat in [
        r"Date\s*upto\s*which\s*lock.in[^\d]*([\d]{1,2}[-/][\d]{1,2}[-/][\d]{2,4})",
        r"lock.in[^\d]*([\d]{1,2}[-/][\d]{1,2}[-/][\d]{2,4})",
        r"(\d{2}-\d{2}-\d{4})\s*(?:\n|$)",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            for fmt in ["%d-%m-%Y","%d/%m/%Y","%d-%m-%y"]:
                try:
                    out["unlock_date"] = datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
                    break
                except: pass
            if out["unlock_date"]: break

    m = re.search(r"\b(EQ|SM|BE|BL)\b", text)
    if m: out["series"] = m.group(1)

    return out

@app.route("/api/scan")
def scan():
    init_session()
    end = datetime.today()
    start = end - timedelta(days=60)
    all_ann, cur = [], start
    while cur < end:
        ce = min(cur + timedelta(days=7), end)
        batch = fetch_anns(cur.strftime("%d-%m-%Y"), ce.strftime("%d-%m-%Y"))
        all_ann.extend(batch)
        time.sleep(1.2)
        cur = ce + timedelta(days=1)

    ams = [a for a in all_ann if is_ams(a)]
    results = []
    for a in ams:
        att = a.get("attchmnt","")
        pdf_url = f"https://nsearchives.nseindia.com/corporate/{att}" if att else None
        parsed = (parse_pdf(pdf_url) or {}) if pdf_url else {}
        time.sleep(0.4)
        results.append({
            "symbol":      parsed.get("symbol") or a.get("symbol",""),
            "company":     parsed.get("company") or a.get("comp",""),
            "isin":        parsed.get("isin",""),
            "shares":      parsed.get("shares"),
            "unlock_date": parsed.get("unlock_date"),
            "series":      parsed.get("series","EQ"),
            "broadcast_dt":a.get("bDt",""),
            "pdf_url":     pdf_url,
        })

    results.sort(key=lambda x: x.get("unlock_date") or "9999")
    return jsonify(results)

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True, port=5005)
