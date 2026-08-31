import sys
import json
import urllib.request
import urllib.parse
import re
from bs4 import BeautifulSoup
import argparse
import warnings

warnings.filterwarnings('ignore')

def extract_news(company_name):
    # Clean company name
    clean_name = re.sub(r'(?i)\b(ltd\.?|limited|trust|invit|ipo|incorporation|inc)\b', '', company_name).strip()
    query = urllib.parse.quote(f'"{clean_name}" IPO guidance OR target OR revenue')
    req = urllib.request.Request('https://news.google.com/rss/search?q=' + query, headers={'User-Agent': 'Mozilla/5.0'})
    
    try:
        xml = urllib.request.urlopen(req, timeout=10).read()
        soup = BeautifulSoup(xml, 'html.parser')
        
        highlights = []
        for item in soup.find_all('item')[:3]:
            title = item.title.text if item.title else ""
            if title:
                # Remove the source name at the end (e.g. "- BusinessLine")
                title = re.sub(r'\s*-\s*[^-]+$', '', title)
                highlights.append("📰 " + title)
                
        return highlights
    except Exception as e:
        print(f"Error extracting news: {e}", file=sys.stderr)
        return []

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--company_name", required=True)
    args = parser.parse_args()
    
    highlights = extract_news(args.company_name)
    if not highlights:
        highlights = ["⚠️ X/Twitter scraping is blocked by login walls. No recent Google News guidance found."]
        
    print(json.dumps({
        "url": "https://news.google.com/search?q=" + urllib.parse.quote(args.company_name),
        "highlights": highlights
    }))

if __name__ == "__main__":
    main()
