# Plan: Deep Personalization & Fact-Checking Upgrade

## Doelstelling
De AI moet veel persoonlijkere en feitelijk correcte e-mails sturen. De huidige aanpak (kiezen uit vooraf gedefinieerde opties) is te rigide. We hebben 20 seconden budget per email, wat ruimte biedt voor een "denkende" AI (Chain of Thought).

## Analyse Huidige Situatie
- **Prompt**: De prompt dwingt de AI om "Optie A, B, C..." te kiezen. Dit voorkomt dat de AI verbanden legt.
- **Logica**: De JavaScript code doet de selectie van personalisatie, niet de AI. Scraper regex bepaalt de niche, wat vaak misslaat.
- **Kennisbank**: Bevat goede data, maar wordt vaak niet geladen omdat de regex de niche niet herkent.

## Verbeterplan

### 1. Data Injectie & Slimme Classificatie
Huidige probleem: We gebruiken keywords (zoals "loodgieter") om de branche te bepalen. Als dat woord mist, faalt de match en krijgt de AI geen pijnpunten.
**Oplossing:** 
- We sturen de **ruwe site-tekst** (slogans, services, titels) naar de AI.
- De AI bepaalt in zijn "Thinking Phase": "Dit is een Loodgieter".
- De AI genereert *zelf* relevante pijnpunten op basis van die classificatie (of we voeden hem de KB data als context).

### 2. "Thinking Phase" (Chain of Thought)
We instrueren de AI om **eerst na te denken** voordat hij schrijft.
In de nieuwe prompt eisen we een structuur:
```text
THOUGHTS:
1. Analyse: Ik zie dat ze claimen "20 jaar ervaring" (claim) en gevestigd zijn in "Amsterdam" (stad).
2. Classificatie: Dit is duidelijk een 'Dakdekker'.
3. Context: Dakdekkers worstelen met seizoenspieken en weersomstandigheden.
4. Hoek: Ik combineer hun ervaring (betrouwbaarheid) met de naderende herfst (urgentie).
5. Fact Check: Ik mag niet verzinnen dat ze "bakker" zijn.
```

### 3. Vernieuwde Prompt Structuur in `send-email.js`
We herschrijven `generateEmailWithAnalysis` volledig:
- **Input**: JSON string van `siteAnalysis` (zonder voorselectie).
- **Instructie**: "Jij bent een elite copywriter. Analyseer eerst de data. Schrijf daarna de email."
- **Output Formaat**: 
  - `STRATEGY: ...` (Voor debugging/logging)
  - `EMAIL_CONTENT:` (De uiteindelijke e-mail content)

### 4. Implementatie Stappen
1. **Refactor `send-email.js`**:
   - Verwijder de oude `if/else` logica voor `forcedOpening`.
   - Bouw de nieuwe "Thinking" prompt.
   - Update de regex parsing om `STRATEGY` te scheiden van `EMAIL_CONTENT`.
2. **Kennisbank Integratie**:
   - We laden *alle* relevante niche-data (of een samenvatting) in de prompt als "Reference Material", zodat de AI daaruit kan putten als hij een match ziet.
3. **Validatie**:
   - De AI valideert zichzelf in de "Thinking Phase".

## Tijdlijn
- [ ] Code in `pages/api/send-email.js` aanpassen.
- [ ] Prompt herschrijven voor Reasoning First.
- [ ] Testen en loggen van de "Thoughts" om te zien of hij de niche snapt.
