# 🚀 SKYE Mail Agent

**AI-Powered Cold Email Outreach** - Genereer en verstuur gepersonaliseerde cold emails automatisch via Gmail.

![SKYE Mail Agent](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-blue)

## ✨ Features

- **🤖 AI-Generated Emails** - OpenAI GPT-4o-mini schrijft gepersonaliseerde cold emails
- **📧 Direct Gmail Versturen** - Emails worden direct verstuurd via je eigen Gmail account
- **🎨 4 Email Tonen** - Professioneel, Casual, Urgent, of Persoonlijk
- **👁️ Preview Modus** - Bekijk de gegenereerde email voor je verstuurt
- **📦 Batch Modus** - Verstuur meerdere emails tegelijk met rate limiting
- **📊 CSV Import** - Importeer leads vanuit Excel/CSV
- **📈 Statistieken** - Houdt bij hoeveel emails je hebt verstuurd
- **🌙 Premium Dark UI** - Strakke, moderne interface met glassmorphism

## 🛠️ Installatie

### 1. Clone & Install

```bash
cd skye-mail-agent
npm install
```

### 2. Gmail API Setup (eenmalig)

1. Ga naar [Google Cloud Console](https://console.cloud.google.com/)
2. Maak een nieuw project (of selecteer een bestaand project)
3. Ga naar **APIs & Services** → **Enabled APIs & Services**
4. Klik **+ ENABLE APIS AND SERVICES**
5. Zoek naar "Gmail API" en enable deze
6. Ga naar **APIs & Services** → **Credentials**
7. Klik **+ CREATE CREDENTIALS** → **OAuth client ID**
8. Configureer OAuth consent screen (External, basic info)
9. Maak OAuth client ID aan:
   - Application type: **Desktop app**
   - Name: `SKYE Mail Agent`
10. Download de JSON en hernoem naar `gmail_credentials.json`
11. Plaats in de root van het project

### 3. Gmail Refresh Token Ophalen

```bash
node get-gmail-refresh-token.js
```

1. Open de URL die getoond wordt in je browser
2. Log in met je Gmail account
3. Geef toestemming
4. Kopieer de code uit de redirect URL
5. Plak in de terminal
6. Je krijgt je `GMAIL_REFRESH_TOKEN`

### 4. Environment Variables

Maak een `.env.local` bestand:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Gmail OAuth
GMAIL_CLIENT_ID=xxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-...
GMAIL_REFRESH_TOKEN=1//...
GMAIL_USER=jouw-email@gmail.com
```

### 5. Start de App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📧 Gebruik

### Single Email
1. Vul de lead gegevens in
2. Kies een email toon
3. (Optioneel) Voeg extra notities toe
4. Klik **Preview** om de email te zien
5. Klik **Verstuur Email** om te versturen

### Batch Modus
1. Ga naar [/batch](http://localhost:3000/batch)
2. Voeg leads handmatig toe, of:
3. Upload een CSV bestand
4. Klik **Alle Versturen**

### CSV Formaat
```csv
email,bedrijfsnaam,website,contactpersoon,tone
info@bakkerij.be,Bakkerij Jan,https://bakkerij-jan.be,Jan,professional
info@restaurant.be,Restaurant De Gouden Leeuw,https://goudenleeuw.be,Pieter,casual
```

## 🔧 API Endpoints

### POST /api/send-email
Verstuur een enkele email.

```json
{
  "toEmail": "info@bedrijf.be",
  "businessName": "Bedrijf BV",
  "websiteUrl": "https://bedrijf.be",
  "contactPerson": "Jan Janssen",
  "emailTone": "professional",
  "customNotes": "Focus op mobiele website",
  "dryRun": false
}
```

### POST /api/send-batch
Verstuur meerdere emails.

```json
{
  "leads": [
    { "toEmail": "...", "businessName": "...", "websiteUrl": "..." },
    { "toEmail": "...", "businessName": "...", "websiteUrl": "..." }
  ],
  "delayBetweenEmails": 5000
}
```

## ⚠️ Rate Limits

- Gmail API: ~500 emails/dag voor gratis accounts
- De batch modus wacht 5 seconden tussen emails
- OpenAI: Afhankelijk van je tier

## 🔒 Beveiliging

- Bewaar je `.env.local` veilig
- Voeg `.env.local` en `gmail_credentials.json` toe aan `.gitignore`
- Gebruik nooit je refresh token in client-side code

## 📁 Project Structuur

```
skye-mail-agent/
├── pages/
│   ├── api/
│   │   ├── send-email.js      # Single email API
│   │   └── send-batch.js      # Batch email API
│   ├── index.js               # Main UI
│   └── batch.js               # Batch mode UI
├── get-gmail-refresh-token.js # OAuth setup script
├── gmail_credentials.json     # OAuth credentials (niet committen!)
├── .env.local                 # Environment variables (niet committen!)
└── env.example                # Voorbeeld env bestand
```

## 🚀 Deploy

### Vercel (Aanbevolen)
1. Push naar GitHub
2. Importeer in Vercel
3. Voeg environment variables toe in Vercel dashboard
4. Deploy!

## 📝 License

MIT - Gebruik het hoe je wilt!

---

**Built with ⚡ by SKYE Unlimited**
