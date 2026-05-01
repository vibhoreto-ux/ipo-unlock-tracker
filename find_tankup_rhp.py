import requests
from bs4 import BeautifulSoup
import PyPDF2
import io
import re

url = "https://www.hemsecurities.com/investor-relations/offer-documents"
try:
    response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    soup = BeautifulSoup(response.text, 'html.parser')
    links = soup.find_all('a', href=True)
    tankup_link = None
    for link in links:
        if 'tankup' in link.text.lower() or 'tankup' in link['href'].lower():
            if 'rhp' in link.text.lower() or 'red' in link.text.lower() or 'rhp' in link['href'].lower():
                tankup_link = link['href']
                break
    
    if tankup_link:
        if not tankup_link.startswith('http'):
            tankup_link = 'https://www.hemsecurities.com' + tankup_link
        print(f"FOUND TANKUP RHP: {tankup_link}")
    else:
        print("Tankup RHP not found on HEM Securities.")
except Exception as e:
    print(f"Error checking HEM Securities: {e}")
