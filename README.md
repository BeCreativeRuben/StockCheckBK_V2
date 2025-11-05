# Battlekart Stock Management System

Een volledig stock management systeem voor Battlekart Gent 2025, met Google Sheets integratie voor bidirectionele data synchronisatie.

## Features

- 📊 **Stock Beheer**: Huidige voorraad bijhouden per item
- 📋 **Bestellijst Generatie**: Automatische generatie van bestellijsten voor items onder minimum
- 📈 **Excel Export**: Exporteer alle data naar CSV/Excel
- 👥 **Multi-user**: Meerdere gebruikers kunnen tegelijk werken
- 🔐 **Admin Panel**: Beheer items, minimumwaarden en sorteer volgorde
- 🔄 **Google Sheets Sync**: Bidirectionele sync met Google Spreadsheet
- 📱 **Responsive Design**: Werkt op desktop, tablet en mobile
- ⚠️ **Visuele Feedback**: Rood/geel indicatoren voor items onder/dichtbij minimum

## Technologie Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Backend**: Google Apps Script
- **Storage**: Google Sheets + localStorage (fallback)
- **Deployment**: GitHub Pages

## Setup

### 1. Google Apps Script Setup

1. Open de Google Sheet: `12gHHK06TSex6EOZuPsLaZMgsqk9gNv4XYqgF3Kp5Qqs`
2. Ga naar **Extensions** → **Apps Script**
3. Plak de code uit `Code.gs`
4. Klik op **Deploy** → **New deployment** → **Web app**
5. Instellingen:
   - **Execute as**: Me
   - **Who has access**: Anyone
6. Kopieer de Web App URL

### 2. Frontend Configuratie

1. Open `script.js`
2. Update regel 9 met de Google Apps Script Web App URL:
   ```javascript
   const GOOGLE_APPS_SCRIPT_URL = 'YOUR_WEB_APP_URL_HERE';
   ```

### 3. GitHub Pages Deployment

1. Push code naar GitHub repository
2. Ga naar **Settings** → **Pages**
3. Selecteer branch: `main`
4. Selecteer folder: `/ (root)`
5. Klik **Save**

De website is nu beschikbaar op: `https://BeCreativeRuben.github.io/StockCheckBK_V2/`

## Gebruik

### Inloggen
1. Open de website
2. Voer je naam in
3. Klik op **Inloggen**

### Stock Bijwerken
1. Zoek het item in de grid
2. Pas de **Huidige Stock** waarde aan
3. De wijziging wordt automatisch opgeslagen

### Bestellijst Genereren
1. Klik op **📋 Bestellijst Genereren**
2. Kopieer de lijst naar klembord
3. Plak in email naar leverancier

### Admin Panel
1. Klik op **⚙️ Admin Panel**
2. Voer admin wachtwoord in: `battlekart2025`
3. Beheer items, minimumwaarden en sorteer volgorde

## Spreadsheet Structuur

Het systeem gebruikt drie sheets in Google Sheets:

- **Stock Data**: Alle product items met voorraad informatie
- **Logging**: Wijzigingslogboek met timestamp en gebruiker
- **Config**: Systeem configuratie en laatste wijziging info

## Bestandsstructuur

```
StockBK_V2/
├── index.html          # Hoofd HTML structuur
├── styles.css          # Alle styling en responsive design
├── script.js           # JavaScript logica + Google Apps Script communicatie
├── Code.gs             # Google Apps Script backend code
├── .gitignore          # Git ignore bestand
└── README.md           # Deze documentatie
```

## Licentie

Dit project is gemaakt voor Battlekart Gent 2025.

