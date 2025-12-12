import nodemailer from "nodemailer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from "cheerio";
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import { loadNiches } from '../../utils/knowledge';
import { analyzeWebsite } from '../../utils/scraper';
import { saveEmail } from '../../utils/database';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Cache voor geladen data
let _cachedNiches = null;
let _cachedPrompts = {};

// === KNOWLEDGE BASE LOADERS ===

// analyzeWebsite and loadNiches imported from utils

// Laad prompt template uit /knowledge/prompts/tone-{tone}.md
function loadPromptTemplate(tone) {
  if (_cachedPrompts[tone]) return _cachedPrompts[tone];

  const defaultTemplate = {
    style: "Zakelijk",
    subjectTemplates: ["{businessName} website check"],
    introExample: "Ik keek naar uw site...",
    resultExample: "Dit levert meer klanten op.",
    ctaExample: "Zullen we bellen?",
    auditPoints: "- Punt 1\n- Punt 2",
    solutionPoints: "- Oplossing 1\n- Oplossing 2",
    emojiLimit: 5
  };

  try {
    const filePath = path.join(process.cwd(), 'knowledge', 'prompts', `tone-${tone}.md`);
    if (!fs.existsSync(filePath)) {
      return defaultTemplate;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const { data, content: body } = matter(content);

    const parseSection = (header) => {
      const match = body.match(new RegExp(`# ${header}\\s+([\\s\\S]*?)(?=\\n#|$)`, 'i'));
      return match ? match[1].trim() : '';
    };

    const template = {
      style: parseSection('Style Instructions'),
      subjectTemplates: parseSection('Subject Templates').split('\n').filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, '').trim()),
      introExample: parseSection('Intro Example').replace(/^"/, '').replace(/"$/, ''),
      resultExample: parseSection('Result Example').replace(/^"/, '').replace(/"$/, ''),
      ctaExample: parseSection('CTA Example').replace(/^"/, '').replace(/"$/, ''),
      auditPoints: parseSection('Audit Points'),
      solutionPoints: parseSection('Solution Points'),
      emojiLimit: data.emoji_limit || 5
    };

    _cachedPrompts[tone] = template;
    return template;

  } catch (error) {
    console.error(`Error loading prompt for ${tone}:`, error);
    return defaultTemplate;
  }
}

// Niche-specifieke stats voor dynamische content (Pre-header etc.)
// Helper om stats op te halen (vervangt oude SHARED_NICHE_STATS)
function getNicheStat(niche) {
  const niches = loadNiches();
  return niches[niche]?.stat || '5+ nieuwe klanten';
}


// Genereer Hormozi-style email op basis van site analyse
async function generateEmailWithAnalysis({ businessName, websiteUrl, contactPerson, emailTone, siteAnalysis, sessionPrompt = "" }) {
  // Laad tone instellingen dynamisch uit MD files
  const toneSettings = loadPromptTemplate(emailTone);

  const toneStyle = toneSettings.style;
  const subjectOptions = toneSettings.subjectTemplates;
  // Pick random subject fallback if list is empty
  const selectedSubjectTemplate = (subjectOptions && subjectOptions.length > 0)
    ? subjectOptions[Math.floor(Math.random() * subjectOptions.length)]
    : `${businessName} - website check`;

  const issuesList = siteAnalysis.issues?.length > 0
    ? siteAnalysis.issues.map(i => `- ${i}`).join('\n')
    : "- Site lijkt basis op orde, maar kan altijd beter converteren";

  // Selecteer de BESTE persoonlijke observatie om te gebruiken
  const bestObservation = siteAnalysis.slogans?.[0]
    || siteAnalysis.headings?.[0]
    || siteAnalysis.services?.[0]
    || siteAnalysis.stats?.[0]
    || siteAnalysis.title
    || '';

  // Bouw een VERPLICHTE opening zin gebaseerd op wat we vonden
  let forcedOpening = '';
  let hasSpecificIntroLink = false; // Tracks of er specifieke website content in intro komt

  if (siteAnalysis.isFacebookPage) {
    forcedOpening = `Zag dat jullie voornamelijk via Facebook communiceren`;
    hasSpecificIntroLink = true;
  } else if (siteAnalysis.slogans?.[0]) {
    forcedOpening = `Zag jullie boodschap "${siteAnalysis.slogans[0]}" op de site`;
    hasSpecificIntroLink = true;
  } else if (siteAnalysis.teamMembers?.[0]) {
    forcedOpening = `Zag dat ${siteAnalysis.teamMembers[0]} deel is van het team`;
    hasSpecificIntroLink = true;
  } else if (siteAnalysis.headings?.[0]) {
    forcedOpening = `Zag "${siteAnalysis.headings[0]}" op jullie homepage`;
    hasSpecificIntroLink = true;
  } else if (siteAnalysis.services?.[0]) {
    forcedOpening = `Zag dat jullie ${siteAnalysis.services[0]} aanbieden`;
    hasSpecificIntroLink = true;
  } else if (siteAnalysis.stats?.[0]) {
    forcedOpening = `Zag dat jullie ${siteAnalysis.stats[0]} claimen`;
    hasSpecificIntroLink = true;
  } else if (siteAnalysis.city) {
    forcedOpening = `Zag dat jullie actief zijn in ${siteAnalysis.city}`;
    hasSpecificIntroLink = true;
  } else if (siteAnalysis.niche && siteAnalysis.niche !== 'bedrijf') {
    forcedOpening = `Zag jullie ${siteAnalysis.niche} website`;
    hasSpecificIntroLink = false; // Alleen niche = niet specifiek genoeg
  }

  // Als geen specifieke link in intro: VERPLICHT beroep noemen in resultaat voor personalisatie
  const mustMentionNicheInResult = !hasSpecificIntroLink && siteAnalysis.niche && siteAnalysis.niche !== 'bedrijf';

  // Selecteer het belangrijkste probleem voor deze specifieke branche
  const mainIssue = siteAnalysis.issues?.[0] || 'de site kan beter converteren';

  // Branche-specifieke resultaat claim & PIJNPUNTEN uit kennisbank
  const allNicheData = loadNiches();
  const nicheData = allNicheData[siteAnalysis.niche] || {};
  const resultClaim = nicheData.resultClaim || 'klanten die al overtuigd zijn voordat ze contact opnemen';
  const painPoints = nicheData.painPoints || '';

  // Niche label voor resultaat (leesbare versie) - met stad als fallback
  let nicheLabel = 'ondernemer';
  if (siteAnalysis.niche && siteAnalysis.niche !== 'bedrijf') {
    nicheLabel = siteAnalysis.niche;
  } else if (siteAnalysis.city) {
    // Als beroep niet duidelijk is, gebruik stad voor personalisatie
    nicheLabel = `ondernemer in ${siteAnalysis.city}`;
  }

  // Tone-specific examples from settings - replace placeholders
  // Veelgebruikte placeholders: {businessName}, {websiteUrl}, {nicheLabel}, {resultClaim}
  const replacePlaceholders = (text) => {
    return text
      .replace(/{businessName}/g, businessName)
      .replace(/{websiteUrl}/g, websiteUrl)
      .replace(/{nicheLabel}/g, nicheLabel)
      .replace(/{resultClaim}/g, resultClaim)
      .replace(/{firstName}/g, contactPerson ? contactPerson.split(' ')[0] : '');
  };

  const introExample = replacePlaceholders(toneSettings.introExample);
  const resultExample = replacePlaceholders(toneSettings.resultExample);
  const ctaExample = replacePlaceholders(toneSettings.ctaExample);

  // Tone-specific audit and solution points
  const auditContent = toneSettings.auditPoints;
  const solutionContent = toneSettings.solutionPoints;

  const prompt = `
Je schrijft een cold email namens Hope van SKYE.

=== BEDRIJFSINFO ===
Naam: ${businessName}
URL: ${websiteUrl}
Branche: ${siteAnalysis.niche || 'bedrijf'}
${siteAnalysis.title ? `Site titel: "${siteAnalysis.title}"` : ''}

=== 🎯 VERPLICHTE PERSONALISATIE - KIES MINIMAAL ÉÉN ===
Je MOET de email beginnen met een van deze specifieke observaties van hun site.
Dit is het BELANGRIJKSTE onderdeel - het bewijst dat je hun site echt hebt bekeken!

${siteAnalysis.claims?.[0] ? `✅ OPTIE A - CLAIM: "Zag dat jullie ${siteAnalysis.claims[0]} - indrukwekkend!"` : ''}
${siteAnalysis.testimonials?.[0] ? `✅ OPTIE B - REVIEW: "Las de review${siteAnalysis.testimonials[0].author ? ` van ${siteAnalysis.testimonials[0].author}` : ''} op jullie site..."` : ''}
${siteAnalysis.specializations?.[0] ? `✅ OPTIE C - SPECIALISATIE: "Zag dat jullie gespecialiseerd zijn in ${siteAnalysis.specializations[0]}..."` : ''}
${siteAnalysis.teamMembers?.[0] ? `✅ OPTIE D - TEAM: "Zag dat ${siteAnalysis.teamMembers[0]} deel is van het team..."` : ''}
${siteAnalysis.city ? `✅ OPTIE E - LOCATIE: "Als bedrijf in ${siteAnalysis.city} weten jullie..."` : ''}
${siteAnalysis.promos?.[0] ? `✅ OPTIE F - ACTIE: "Zag jullie actie '${siteAnalysis.promos[0]}' - slimme marketing!"` : ''}
${siteAnalysis.services?.[0] ? `✅ OPTIE G - DIENST: "Zag dat jullie ${siteAnalysis.services[0]} aanbieden..."` : ''}
${siteAnalysis.stats?.[0] ? `✅ OPTIE H - STATS: "Jullie claimen ${siteAnalysis.stats[0]} - dat is mooi!"` : ''}

⚠️ KIES EEN VAN BOVENSTAANDE OPTIES EN VARIEER DE ZINSOPBOUW IN ${emailTone.toUpperCase()} STIJL!
${!siteAnalysis.claims?.[0] && !siteAnalysis.city && !siteAnalysis.services?.[0] ? `⚠️ Weinig specifieke data gevonden - noem dan minimaal het beroep "${nicheLabel}" in de intro!` : ''}

=== EXTRA WEBSITE DATA (VOOR CONTEXT) ===
${siteAnalysis.services?.slice(0, 4).map(s => `• Dienst: "${s}"`).join('\n') || ''}
${siteAnalysis.usps?.slice(0, 3).map(u => `• USP: "${u}"`).join('\n') || ''}
${siteAnalysis.prices?.slice(0, 2).map(p => `• Prijs: ${p}`).join('\n') || ''}
${siteAnalysis.aboutContent ? `• Over hen: "${siteAnalysis.aboutContent.slice(0, 120)}..."` : ''}

=== STIJL: ${emailTone.toUpperCase()} ===
⚠️ DIT IS DE BELANGRIJKSTE INSTRUCTIE! VOLG DEZE STIJL EXACT:

${toneStyle}

VOORBEELD INTRO (KOPIEER DEZE STIJL!):
${introExample}

VOORBEELD RESULTAAT (KOPIEER DEZE STIJL!):
${resultExample}

VOORBEELD CTA (KOPIEER DEZE STIJL!):
${ctaExample}

=== ⚠️ VERPLICHT OUTPUT FORMAAT ===
Je MOET de email in EXACT dit formaat schrijven met deze labels:

SUBJECT: [onderwerp hier]

INTRO:
[Persoonlijke opening - KIES EEN VAN DE PERSONALISATIE OPTIES HIERBOVEN]

AUDIT:
[3 bullet points met problemen]

OPLOSSING:
[3 bullet points met oplossingen]

RESULTAAT:
[Wat ze kunnen bereiken - noem hun beroep als er geen specifieke observatie was]

CTA:
[Call to action - uitnodiging voor gesprek]

=== KRITIEKE REGELS ===
1. GEBRUIK EXACT de labels INTRO:, AUDIT:, OPLOSSING:, RESULTAAT:, CTA: - anders werkt de email niet!
2. De INTRO moet een SPECIFIEKE observatie van hun site bevatten (kies uit de opties hierboven!)
3. De INTRO, RESULTAAT en CTA moeten DUIDELIJK de ${emailTone.toUpperCase()} stijl hebben!
4. Gebruik Maximaal ${toneSettings.emojiLimit} emoji's in de hele email.
5. GEEN generieke zinnen zoals "ik bekeek jullie site" - wees SPECIFIEK!
${sessionPrompt ? `
=== ⚠️ EXTRA INSTRUCTIES VAN DE VERZENDER (BELANGRIJK!) ===
${sessionPrompt}
⚠️ VERWERK DEZE EXTRA INSTRUCTIES IN DE EMAIL!
` : ''}

=== VOORBEELD VAN HET JUISTE FORMAAT ===
SUBJECT: Bakkerij de Koning - even langskomen 👋

INTRO:
Hoi! Ik las jullie slogan "Vers gebakken met liefde" en dacht direct: wat een mooie boodschap! Maar ik zag ook een paar dingen op de site die jullie vast niet doorhebben.

AUDIT:
- 📱 De site werkt niet zo fijn op telefoon
- 🤔 Bezoekers weten niet goed wat de volgende stap is  
- ⏳ De laadtijd kan wat sneller

OPLOSSING:
- 🌟 Een snellere site maakt iedereen blij
- 👆 Een duidelijke bestelknop helpt bezoekers verder
- 💫 Een moderne look geeft vertrouwen

RESULTAAT:
Als bakker kan je met kleine aanpassingen veel meer uit de site halen. Klanten die online bestellen voordat ze langskomen! 😊

CTA:
Zullen we even bellen? Dan leg ik het rustig uit en kijken we samen wat past.

=== SCHRIJF NU DE EMAIL ===
`;

  // Log wat we naar de AI sturen voor debugging
  console.log(`\n🤖 AI Prompt bevat:`);
  console.log(`   → Tone: "${emailTone}"`);
  console.log(`   → Subject template: "${selectedSubjectTemplate}"`);
  console.log(`   → Result claim: "${resultClaim}"`);
  console.log(`   → Pain points: "${painPoints ? '✅ Ja' : '❌ Nee'}"`);
  console.log(`   → Session prompt: "${sessionPrompt ? '✅ Ja (' + sessionPrompt.slice(0, 40) + '...)' : '❌ Nee'}"`);

  // Gebruik nieuwste Flash model
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.9,
      topP: 0.95,
      topK: 40,
    }
  });

  const result = await model.generateContent(prompt);


  const text = result.response.text().trim();

  // Clean subject placeholders
  const cleanUrl = (url) => url.replace(/(^\w+:|^)\/\//, '').replace('www.', '').replace(/\/$/, '');
  const cleanName = cleanUrl(businessName); // Zorgt dat URLs in subject er strak uitzien

  // Use the tone-specific subject template as default - PROPERLY replace placeholder
  let subject = selectedSubjectTemplate.replace(/{businessName}/g, cleanName);
  let sections = {
    intro: '',
    audit: '',
    boosters: '',
    resultaat: '',
    cta: ''
  };

  // Parse subject from AI output (override if AI provides one)
  if (text.includes("SUBJECT:")) {
    const subjectMatch = text.match(/SUBJECT:\s*(.+?)(?:\n|$)/);
    if (subjectMatch && subjectMatch[1].trim().length > 5) {
      // Also replace placeholders in AI-generated subject
      subject = subjectMatch[1].trim().replace(/{businessName}/g, cleanName);
    }
  }

  // Parse each section - nieuwe structuur
  const introMatch = text.match(/INTRO:\s*([\s\S]*?)(?=AUDIT:|KANSEN:|$)/i);
  const auditMatch = text.match(/(?:AUDIT|KANSEN):\s*([\s\S]*?)(?=BOOSTERS:|OPLOSSING:|$)/i);
  const boostersMatch = text.match(/(?:BOOSTERS|OPLOSSING):\s*([\s\S]*?)(?=RESULTAAT:|BELOFTE:|$)/i);
  const resultaatMatch = text.match(/(?:RESULTAAT|BELOFTE):\s*([\s\S]*?)(?=CTA:|$)/i);
  const ctaMatch = text.match(/CTA:\s*([\s\S]*?)$/i);

  if (introMatch) sections.intro = introMatch[1].trim();
  if (auditMatch) sections.audit = auditMatch[1].trim();
  if (boostersMatch) sections.boosters = boostersMatch[1].trim();
  if (resultaatMatch) sections.resultaat = resultaatMatch[1].trim();
  if (ctaMatch) sections.cta = ctaMatch[1].trim();

  // Fallback: if sections weren't parsed, use the whole body
  const body = sections.intro || sections.audit ? null : text.replace(/SUBJECT:.*\n/, '').replace(/BODY:\s*/, '').trim();

  console.log(`   ✅ Email gegenereerd met subject: "${subject.slice(0, 50)}..."`);
  console.log(`   📝 Secties: intro=${!!sections.intro}, audit=${!!sections.audit}, boosters=${!!sections.boosters}, resultaat=${!!sections.resultaat}, cta=${!!sections.cta}`);

  return { subject, body, sections };
}

// === 🆕 AI QUALITY CHECK ===
// Controleert de gegenereerde email op logische fouten en onzinnige zinnen
async function validateEmailQuality(sections, businessName, emailTone) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.1 } // Lage temp voor consistente beoordeling
  });

  const emailContent = `
INTRO: ${sections.intro || '(leeg)'}
AUDIT: ${sections.audit || '(leeg)'}
OPLOSSING: ${sections.boosters || '(leeg)'}
RESULTAAT: ${sections.resultaat || '(leeg)'}
CTA: ${sections.cta || '(leeg)'}
  `.trim();

  const validationPrompt = `
Je bent een strenge kwaliteitscontrole voor cold emails. 
Beoordeel de volgende email voor ${businessName} op deze criteria:

1. LOGICA: Zijn alle zinnen logisch en begrijpelijk? Geen onafgemaakte zinnen?
2. RELEVANTIE: Past de inhoud bij een bedrijf (geen onzin)?
3. STRUCTUUR: Heeft elke sectie echte content (niet alleen placeholder tekst)?
4. TAAL: Is het correct Nederlands zonder rare woorden/karakters?
5. PERSONALISATIE: Wordt er iets specifieks over het bedrijf genoemd?

EMAIL:
${emailContent}

ANTWOORD IN DIT EXACTE FORMAAT:
SCORE: [1-10]
PROBLEMEN: [lijst van problemen, of "geen"]
VERDICT: [OK of HERGENEREREN]

Voorbeelden:
- Score 8-10 = OK (kleine issues zijn acceptabel)
- Score 5-7 = HERGENEREREN (matige kwaliteit)
- Score 1-4 = HERGENEREREN (slechte kwaliteit)
`;

  try {
    const result = await model.generateContent(validationPrompt);
    const response = result.response.text().trim();

    // Parse het antwoord
    const scoreMatch = response.match(/SCORE:\s*(\d+)/i);
    const verdictMatch = response.match(/VERDICT:\s*(OK|HERGENEREREN)/i);
    const problemsMatch = response.match(/PROBLEMEN:\s*(.+?)(?=VERDICT:|$)/is);

    const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;
    const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : 'OK';
    const problems = problemsMatch ? problemsMatch[1].trim() : 'geen';

    console.log(`   🔍 Quality check: Score ${score}/10 - ${verdict}`);
    if (problems !== 'geen' && problems.toLowerCase() !== 'geen') {
      console.log(`   ⚠️ Problemen: ${problems.slice(0, 100)}...`);
    }

    return {
      score,
      verdict,
      problems,
      shouldRegenerate: verdict === 'HERGENEREREN' || score < 6
    };
  } catch (error) {
    console.log(`   ⚠️ Quality check mislukt: ${error.message}`);
    // Bij fout, gewoon doorgaan
    return { score: 7, verdict: 'OK', problems: 'check failed', shouldRegenerate: false };
  }
}

// Fallback template - NOW WITH TONE SUPPORT
function generateFallbackEmail(data) {
  const analysis = data.siteAnalysis || {};
  const niche = analysis.niche || 'ondernemer';
  const websiteUrl = data.websiteUrl || 'jullie site';
  const emailTone = data.emailTone || 'professional';
  const contactPerson = data.contactPerson || '';

  // Niche label met stad als fallback (zelfde logica als AI prompt)
  let nicheLabel = 'ondernemer';
  if (niche && niche !== 'bedrijf') {
    nicheLabel = niche;
  } else if (analysis.city) {
    nicheLabel = `ondernemer in ${analysis.city}`;
  }

  // Clean business name for subject
  const cleanName = data.businessName.replace(/(^\w+:|^)\/\//, '').replace('www.', '').replace(/\//g, '');

  // Personal greeting based on contact person
  const hasContact = contactPerson && contactPerson.trim().length > 0;
  const firstName = hasContact ? contactPerson.split(' ')[0] : '';

  // TONE-SPECIFIC CONTENT with optional contact person - NU MET BEROEP IN RESULTAAT
  // Check for observation hooks
  const slogan = analysis.slogans?.[0];
  const city = analysis.city;
  const hook = slogan ? `Zag jullie slogan "${slogan}"` : (city ? `Zag dat jullie in ${city} zitten` : '');

  const toneContent = {
    professional: {
      subject: `${cleanName} - website analyse`,
      intro: hasContact
        ? `Beste ${firstName}, ${hook ? hook + ' en' : 'ik'} analyseerde ${websiteUrl}. Ik identificeerde drie optimalisatiemogelijkheden.`
        : `${hook ? hook + ' en' : 'Ik'} analyseerde ${websiteUrl}. Ik identificeerde drie optimalisatiemogelijkheden.`,
      audit: `- ❌ Niet mobielvriendelijk\n- ❌ Geen duidelijke call-to-action\n- ❌ Suboptimale laadtijd`,
      boosters: `- ✅ Responsief design = bredere bereik\n- ✅ Conversie-geoptimaliseerde CTA's\n- ✅ Performante infrastructuur`,
      resultaat: `Voor een ${nicheLabel} zoals u betekent dit: meer gekwalificeerde klanten die al overtuigd zijn voordat ze contact opnemen.`,
      cta: `Interesse? 10 minuten van uw tijd voor concrete inzichten.`
    },
    casual: {
      subject: `Hey ${cleanName}! Even gekeken.. 👀`,
      intro: hasContact
        ? `Yooo ${firstName}! ${hook ? hook + ' en dacht direct' : 'Keek naar je site en dacht'}: dit kan beter! 🔥 Geen hate, gewoon een tip.`
        : `Yooo! ${hook ? hook + ' en dacht direct' : 'Keek naar je site en dacht'}: dit kan beter! 🔥 Geen hate, gewoon een tip.`,
      audit: `- 😬 Site werkt niet lekker op mobiel\n- 🤷 Geen duidelijke "bestel nu" knop\n- 🐌 Beetje traag allemaal`,
      boosters: `- 🔥 Snelle site = blije bezoekers\n- 💪 Duidelijke actieknop = meer sales\n- ✨ Fresh design = instant vertrouwen`,
      resultaat: `Serieus, als ${nicheLabel} krijg je met een betere site klanten die van tevoren al sold zijn! 🚀`,
      cta: `Zin om ff te bellen? Ik laat je zien wat ik bedoel! 🤙`
    },
    urgent: {
      subject: `${cleanName} - je mist klanten (elke dag)`,
      intro: hasContact
        ? `${firstName}, elke dag dat ${websiteUrl} zo blijft, loop je klanten mis. ${hook ? `Zelfs met "${slogan}"` : ''} zag ik problemen.`
        : `Elke dag dat ${websiteUrl} zo blijft, loop je klanten mis. ${hook ? `Zelfs met "${slogan}"` : ''} zag ik problemen.`,
      audit: `- ⚠️ NIET mobielvriendelijk - je verliest NU klanten\n- 🚨 Geen actieknop - bezoekers weten niet wat te doen\n- ⏰ Trage site - elke seconde kost je geld`,
      boosters: `- ⚡ Snelle site = direct meer conversies\n- 🎯 Sterke CTA = klanten die actie nemen\n- 💰 Modern = vertrouwen = verkoop`,
      resultaat: `Elke dag dat je als ${nicheLabel} wacht = gemiste klanten. Andere ${nicheLabel}s die dit fixen zien DIRECT resultaat.`,
      cta: `Hoe langer je wacht, hoe meer je mist. 10 min bellen? Vandaag nog?`
    },
    friendly: {
      subject: `${cleanName} - even langskomen 👋`,
      intro: hasContact
        ? `Hoi ${firstName}! ${hook ? hook + ' en dat ziet er leuk uit!' : 'Ik kwam jullie site tegen.'} Maar ik zag ook dingen die jullie vast niet doorhebben.`
        : `Hoi! ${hook ? hook + ' en dat ziet er leuk uit!' : 'Ik kwam jullie site tegen.'} Maar ik zag ook dingen die jullie vast niet doorhebben.`,
      audit: `- 📱 De site werkt niet zo fijn op telefoon\n- 🤔 Bezoekers weten niet goed wat de volgende stap is\n- ⏳ De laadtijd kan wat sneller`,
      boosters: `- 🌟 Een snellere site maakt iedereen blij\n- 👆 Een duidelijke knop helpt bezoekers verder\n- 💫 Een moderne look geeft vertrouwen`,
      resultaat: `Als ${nicheLabel} kan je met kleine aanpassingen veel meer uit de site halen. Het hoeft niet ingewikkeld te zijn. 😊`,
      cta: `Zullen we even bellen? Dan leg ik het rustig uit.`
    }
  };

  const content = toneContent[emailTone] || toneContent.professional;

  return {
    subject: content.subject,
    body: `${content.intro}\n\n${content.audit}\n\n${content.boosters}\n\n${content.resultaat}\n\n${content.cta}`,
    sections: {
      intro: content.intro,
      audit: content.audit,
      boosters: content.boosters,
      resultaat: content.resultaat,
      cta: content.cta
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    toEmail,
    businessName,
    websiteUrl,
    contactPerson,
    emailTone: requestedTone = "professional",
    dryRun = false,
    analyzeFirst = true,  // Nieuwe optie: analyseer website eerst
    preGeneratedData = null, // Nieuwe optie: gebruik bestaande data
    customSubject = "", // Custom subject line (leeg = auto)
    customPreheader = "", // Custom pre-header (leeg = auto)
    sessionPrompt = "", // Tijdelijke extra AI instructies (voor batch sessie)
    smtpConfig = null // Dynamische SMTP configuratie (voor campaign systeem)
  } = req.body;

  // Handle "random" tone - kies willekeurige stijl
  const availableTones = ["professional", "casual", "urgent", "friendly"];
  const emailTone = requestedTone === "random"
    ? availableTones[Math.floor(Math.random() * availableTones.length)]
    : requestedTone;

  console.log("API Key Status:", !!process.env.GEMINI_API_KEY ? "Aanwezig" : "NIET AANWEZIG");

  // Log welke stijl is gekozen (handig voor debugging)
  if (requestedTone === "random") {
    console.log(`🎲 Random stijl gekozen: ${emailTone}`);
  }

  if (!toEmail || !businessName || !websiteUrl) {
    return res.status(400).json({
      error: "Verplichte velden ontbreken",
      details: "toEmail, businessName en websiteUrl zijn verplicht"
    });
  }

  try {
    let subject, body;
    let sections = null;
    let usedAI = false;
    let siteAnalysis = null;

    // STAP 1: Analyseer de website
    if (analyzeFirst) {
      console.log(`🔍 Analyseren: ${websiteUrl}...`);
      siteAnalysis = await analyzeWebsite(websiteUrl);
      console.log(`\n✅ Analyse klaar voor ${businessName}:`);
      console.log(`   📌 Niche: ${siteAnalysis.niche || 'onbekend'} (${siteAnalysis.nicheConfidence || 'laag'})`);
      console.log(`   💬 Slogan: ${siteAnalysis.slogans?.[0] || 'geen gevonden'}`);
      console.log(`   📝 Eerste kop: ${siteAnalysis.headings?.[0] || 'geen gevonden'}`);
      console.log(`   🛠️ Diensten: ${siteAnalysis.services?.slice(0, 3).join(', ') || 'geen gevonden'}`);
      console.log(`   ⚠️ Problemen: ${siteAnalysis.issues?.length || 0}`);
      if (siteAnalysis.issues?.length > 0) {
        console.log(`      → ${siteAnalysis.issues[0]}`);
      }
    }

    // STAP 2: Genereer email met AI + analyse OF gebruik bestaande data
    if (preGeneratedData && !dryRun) {
      console.log(`\n📦 Gebruik pre-generated data uit preview...`);
      subject = preGeneratedData.subject;
      body = preGeneratedData.body;
      sections = preGeneratedData.sections;
      siteAnalysis = preGeneratedData.siteAnalysis || siteAnalysis;
      usedAI = true;
      console.log(`✅ Pre-generated content ingeladen!`);
    } else if (process.env.GEMINI_API_KEY) {
      console.log(`\n🤖 AI generatie starten...`);

      try {
        const MAX_RETRIES = 2;
        let attempts = 0;
        let qualityOK = false;

        while (attempts <= MAX_RETRIES && !qualityOK) {
          attempts++;
          console.log(`   📝 Poging ${attempts}/${MAX_RETRIES + 1}...`);

          try {
            const result = await generateEmailWithAnalysis({
              businessName,
              websiteUrl,
              contactPerson,
              emailTone,
              siteAnalysis: siteAnalysis || {},
              sessionPrompt: attempts > 1
                ? `${sessionPrompt}\n\n⚠️ VORIGE POGING WAS AFGEKEURD - SCHRIJF BETERE, LOGISCHERE ZINNEN!`
                : sessionPrompt
            });
            subject = result.subject;
            body = result.body;
            sections = result.sections;
            usedAI = true;

            // 🆕 QUALITY CHECK - alleen als we sections hebben
            if (sections && (sections.intro || sections.audit)) {
              const quality = await validateEmailQuality(sections, businessName, emailTone);

              if (quality.shouldRegenerate && attempts <= MAX_RETRIES) {
                console.log(`   🔄 Kwaliteit te laag (${quality.score}/10), opnieuw genereren...`);
                continue; // Probeer opnieuw
              }

              qualityOK = true;
              console.log(`   ✅ Kwaliteit goedgekeurd: ${quality.score}/10`);
            } else {
              // Geen sections = skip quality check
              qualityOK = true;
            }

          } catch (aiError) {
            console.error(`   ❌ AI poging ${attempts} mislukt: ${aiError.message}`);
            if (attempts > MAX_RETRIES) {
              throw aiError; // Geef door naar outer catch
            }
          }
        }

        console.log(`✅ AI email succesvol gegenereerd na ${attempts} poging(en)!`);
      } catch (outerError) {
        // Fallback als ALLE pogingen mislukken
        console.error(`\n❌ AI FOUT - Fallback wordt gebruikt!`);
        console.error(`   Error: ${outerError.message}`);
        const fallback = generateFallbackEmail({ businessName, websiteUrl, contactPerson, siteAnalysis, emailTone });
        subject = fallback.subject;
        body = fallback.body;
        sections = fallback.sections;
      }
    } else {
      console.warn(`\n⚠️ GEEN GEMINI_API_KEY gevonden! Fallback wordt gebruikt.`);
      const fallback = generateFallbackEmail({ businessName, websiteUrl, contactPerson, siteAnalysis, emailTone });
      subject = fallback.subject;
      body = fallback.body;
      sections = fallback.sections;
    }

    // Override subject als custom is opgegeven
    if (customSubject && customSubject.trim()) {
      const cleanUrl = (url) => url.replace(/(^\w+:|^)\/\//, '').replace('www.', '').replace(/\/$/, '');
      subject = customSubject.trim()
        .replace(/{businessName}/g, businessName)
        .replace(/{websiteUrl}/g, cleanUrl(websiteUrl));
      console.log(`📝 Custom subject gebruikt: "${subject}"`);
    }

    // Bereken pre-header (custom of auto)
    let preheader = '';
    if (customPreheader && customPreheader.trim()) {
      const cleanUrl = (url) => url.replace(/(^\w+:|^)\/\//, '').replace('www.', '').replace(/\/$/, '');
      preheader = customPreheader.trim()
        .replace(/{businessName}/g, businessName)
        .replace(/{websiteUrl}/g, cleanUrl(websiteUrl))
        .replace(/{niche}/g, siteAnalysis?.niche || 'bedrijf');
      console.log(`📝 Custom pre-header gebruikt: "${preheader}"`);
    } else {
      // Auto pre-header gebaseerd op niche
      preheader = `Je mist ${getNicheStat(siteAnalysis?.niche) || 'klanten'}. Ik laat zien waarom.`;
    }

    // Als dry run, return preview + analyse met ALLE personalisatie data
    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        usedAI,
        subject,
        preheader,
        body,
        sections,
        toEmail,
        businessName,
        // Stijl info (handig voor random)
        selectedTone: emailTone,
        wasRandom: requestedTone === "random",
        siteAnalysis: siteAnalysis ? {
          title: siteAnalysis.title,
          // Personalisatie data
          niche: siteAnalysis.niche,
          nicheConfidence: siteAnalysis.nicheConfidence,
          headings: siteAnalysis.headings,
          services: siteAnalysis.services,
          slogans: siteAnalysis.slogans,
          stats: siteAnalysis.stats,
          teamMembers: siteAnalysis.teamMembers,
          city: siteAnalysis.city,
          aboutContent: siteAnalysis.aboutContent,
          uniqueObservations: siteAnalysis.uniqueObservations,
          // Facebook detectie
          isFacebookPage: siteAnalysis.isFacebookPage,
          usesFacebookAsWebsite: siteAnalysis.usesFacebookAsWebsite,
          // Extra info
          hasTestimonials: siteAnalysis.hasTestimonials,
          hasBlog: siteAnalysis.hasBlog,
          hasOpeningHours: siteAnalysis.hasOpeningHours
        } : null
      });
    }

    // STAP 3: Verstuur email met complete SKYE HTML template

    // Genereer uniek email ID voor tracking
    const emailId = uuidv4();

    // Helper functie om tracked URLs te maken
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const createTrackedUrl = (originalUrl, linkType) => {
      const encodedUrl = encodeURIComponent(originalUrl);
      return `${BASE_URL}/api/track?id=${emailId}&type=${linkType}&url=${encodedUrl}`;
    };

    // Dynamische SMTP: gebruik smtpConfig als aanwezig, anders env vars
    let transporter;
    let fromAddress;

    if (smtpConfig && smtpConfig.host && smtpConfig.user && smtpConfig.pass) {
      // Gebruik dynamische SMTP configuratie
      console.log(`📡 Dynamische SMTP: ${smtpConfig.host}:${smtpConfig.port || 587}`);
      transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: parseInt(smtpConfig.port) || 587,
        secure: parseInt(smtpConfig.port) === 465,
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000
      });
      fromAddress = smtpConfig.fromName
        ? `"${smtpConfig.fromName}" <${smtpConfig.user}>`
        : smtpConfig.user;
    } else {
      // Fallback naar env vars (Gmail)
      console.log('📡 SMTP via env vars (Gmail)');
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });
      fromAddress = `"SKYE" <${process.env.GMAIL_USER}>`;
    }

    // Extract sections (or fallback if empty)
    if (!sections) {
      if (body) {
        // We have a body (e.g. from preview or fallback), try to parse it into sections
        sections = {
          intro: '',
          audit: '',
          boosters: '',
          resultaat: '',
          cta: ''
        };

        const pars = body.split('\n\n');

        // Basic mapping attempt based on common paragraph structure
        if (pars.length >= 4) {
          sections.intro = pars[0] + (pars[1] ? '\n\n' + pars[1] : '');
          sections.audit = pars[2] || '';
          sections.boosters = pars[3] || '';
          sections.resultaat = pars[4] || '';
          sections.cta = pars[5] || '';
        } else {
          sections.intro = pars[0] || '';
          sections.audit = pars[1] || '';
          sections.boosters = pars[2] || '';
          sections.resultaat = pars[3] || '';
          sections.cta = pars[4] || '';
        }
      }

      // ONLY use hardcoded fallback if ALL sections are truly empty
      if (!sections || (!sections.intro && !sections.audit && !sections.boosters && !sections.resultaat && !sections.cta)) {
        console.log('⚠️ Geen content geparsed, gebruik hardcoded fallback');
        sections = {
          intro: `Jullie site **verliest klanten**. **Trage laadtijd**, niet mobiel, geen duidelijke actieknop. Hieronder wat ik zag op jullie site:`,
          audit: `- ❌ Niet mobielvriendelijk\n- ❌ Geen duidelijke call-to-action\n- ❌ Trage laadtijd`,
          boosters: `- 🔥 Snelle site = blije klant\n- 🔥 Actieknop = meer conversies\n- 🔥 Modern design = vertrouwen`,
          resultaat: `Voor ondernemers zoals jullie betekent dit gemiddeld 30-50% meer klanten.`,
          cta: `10 min bellen? Dan laat ik het zien. 🤙`
        };
      }
    }

    // Log sections for debugging
    console.log('📧 Email sections:');
    console.log(`   intro: ${sections.intro ? '✅' : '❌'} (${sections.intro?.length || 0} chars)`);
    console.log(`   audit: ${sections.audit ? '✅' : '❌'} (${sections.audit?.length || 0} chars)`);
    console.log(`   boosters: ${sections.boosters ? '✅' : '❌'} (${sections.boosters?.length || 0} chars)`);
    console.log(`   resultaat: ${sections.resultaat ? '✅' : '❌'} (${sections.resultaat?.length || 0} chars)`);
    console.log(`   cta: ${sections.cta ? '✅' : '❌'} (${sections.cta?.length || 0} chars)`);

    // Helper function to format text (paragraphs + bullet points)
    const formatSectionContent = (text, textColor = '#333333', fontSize = '13px') => {
      if (!text) return '';
      const lines = text.split('\n');
      let html = '';
      let inList = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // More robust bullet detection (-, *, •)
        const isBullet = line.startsWith('-') || line.startsWith('*') || line.startsWith('•');

        if (isBullet) {
          if (!inList) {
            html += `<ul style="margin:0 0 12px 0; padding-left:20px; color:${textColor};">`;
            inList = true;
          }
          // Remove the bullet char
          let content = line.replace(/^[-*•]\s*/, '').trim();
          // Convert **bold** to <strong>bold</strong>
          content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          html += `<li style="margin-bottom:4px; font-size:${fontSize}; line-height:1.5;">${content}</li>`;
        } else {
          if (inList) {
            html += '</ul>';
            inList = false;
          }
          let content = line;
          // Convert **bold** to <strong>bold</strong>
          content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          html += `<p style="margin:0 0 12px 0; font-size:${fontSize}; line-height:1.6; color:${textColor};">${content}</p>`;
        }
      }
      if (inList) html += '</ul>';
      return html;
    };

    const toHtmlParagraphs = (text) => formatSectionContent(text); // Backward compatibility for Intro/CTA

    // Complete SKYE Email Template - White content, dark header/footer, SECTIONS
    const fullHtml = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SKYE Email</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f5;">
  
  <!-- PRE-HEADER: Onzichtbare tekst die in de inbox preview verschijnt -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
    ${preheader}
  </div>
  <!-- Spacer to push preview text (LONG version to hide header text) -->
  <div style="display:none; max-height:0; overflow:hidden;">
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
  
  <!-- OUTER WRAPPER - Light grey background -->
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family: Arial, Helvetica, sans-serif; background:#f5f5f5; padding:30px 15px;">
    <tr>
      <td align="center">
        
        <!-- MAIN CONTAINER -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">
          
          <!-- ═══════════════════════════════════════════════════════════ -->
          <!-- HEADER BAR - Dark branded -->
          <!-- ═══════════════════════════════════════════════════════════ -->
          <tr>
            <td>
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#050910; border-radius:12px 12px 0 0;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <!-- LOGO -->
                        <td align="left" valign="middle">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:26px; font-weight:800; color:#ffffff; letter-spacing:0.06em;">
                                SKYE
                              </td>
                              <td style="padding-left:6px;">
                                <div style="
                                  width:16px;
                                  height:16px;
                                  border-radius:50%;
                                  background:#00A4E8;
                                "></div>
                              </td>
                            </tr>
                            <tr>
                              <td colspan="2" style="padding-top:4px; font-size:10px; color:#bfc6cf; letter-spacing:0.22em; text-transform:uppercase;">
                                THE DEVELOPER
                              </td>
                            </tr>
                          </table>
                        </td>
                        <!-- WEBSITE LINK -->
                        <td align="right" valign="middle">
                          <a href="${createTrackedUrl('https://skye-unlimited.be', 'website')}" target="_blank" style="color:#00A4E8; text-decoration:none; font-size:12px; font-weight:600;">
                            skye-unlimited.be
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- ═══════════════════════════════════════════════════════════ -->
          <!-- MAIN CONTENT - White background, elegant spacing -->
          <!-- ═══════════════════════════════════════════════════════════ -->
          <tr>
            <td>
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;">
                
                <!-- ────────────────────────────────────────────────────── -->
                <!-- SECTIE 1: VOORSTELLING -->
                <!-- ────────────────────────────────────────────────────── -->
                <tr>
                  <td style="padding:32px 32px 20px 32px;">
                    <div style="font-size:16px; line-height:1.7; color:#333333;">
                    ${formatSectionContent(sections.intro, '#333333', '16px')}
                    </div>
                  </td>
                </tr>

                <!-- ────────────────────────────────────────────────────── -->
                <!-- GRATIS AUDIT | CONVERSIE BOOSTERS -->
                <!-- ────────────────────────────────────────────────────── -->
                <tr>
                    <td style="padding:0 24px 12px 24px;">
                        <!-- BLOK 1: GRATIS AUDIT (ROOD) -->
                        <table cellpadding="0" cellspacing="0" border="0" width="100%"
                            style="background:#fef2f2; border-radius:8px; margin-bottom: 12px;">
                            <tr>
                                <td style="padding:16px;">
                                    <p style="margin:0 0 8px 0; font-size:12px; font-weight:800; color:#dc2626; text-transform:uppercase;">
                                        💡 Gratis Audit
                                    </p>
                                    ${formatSectionContent(sections.audit, '#7f1d1d')}
                                </td>
                            </tr>
                        </table>

                        <!-- BLOK 2: CONVERSIE BOOSTERS (3 punten) -->
                        <table cellpadding="0" cellspacing="0" border="0" width="100%"
                            style="background:#f0fdf4; border-radius:8px;">
                            <tr>
                                <td style="padding:16px;">
                                    <p style="margin:0 0 8px 0; font-size:12px; font-weight:800; color:#16a34a; text-transform:uppercase;">
                                        ✅ SKYE Oplossing
                                    </p>
                                    ${formatSectionContent(sections.boosters, '#14532d')}
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- ────────────────────────────────────────────────────── -->
                <!-- RESULTAAT (met niche referentie) -->
                <!-- ────────────────────────────────────────────────────── -->
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf5ff; border-radius:8px;">
                      <tr>
                        <td style="padding:16px;">
                          <p style="margin:0 0 8px 0; font-size:12px; font-weight:800; color:#9333ea; text-transform:uppercase;">
                            🚀 Resultaat
                          </p>
                          <div style="color:#581c87;">
                            ${formatSectionContent(sections.resultaat, '#581c87', '15px')}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Spacing -->
                <tr><td style="height:12px;"></td></tr>

                
                <!-- ────────────────────────────────────────────────────── -->
                <!-- SECTIE 5: CTA -->
                <!-- ────────────────────────────────────────────────────── -->
                <tr>
                  <td style="padding:0 32px 32px 32px; text-align:center;">
                    <div style="font-size:16px; margin-bottom:20px; font-weight:600;">
                    ${formatSectionContent(sections.cta, '#333333', '16px')}
                    </div>
                    <!-- CTA Button -->
                    <table cellpadding="0" cellspacing="0" border="0" align="center">
                      <tr>
                        <td>
                          <a href="${createTrackedUrl('https://wa.me/31645998932', 'cta')}" target="_blank" style="
                            display:inline-block;
                            padding:14px 28px;
                            background:#00A4E8;
                            color:#ffffff;
                            font-size:14px;
                            font-weight:600;
                            text-decoration:none;
                            border-radius:8px;
                          ">
                            Plan een gesprek →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
          
          <!-- ═══════════════════════════════════════════════════════════ -->
          <!-- FOOTER - Dark branded -->
          <!-- ═══════════════════════════════════════════════════════════ -->
          <tr>
            <td>
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#050910; border-radius:0 0 12px 12px;">
                <tr>
                  <td style="padding:24px;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <!-- LEFT: SKYE Logo -->
                        <td align="left" valign="middle">
                          <a href="${createTrackedUrl('https://skye-unlimited.be', 'footer-logo')}" target="_blank" style="text-decoration:none;">
                            <table cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td style="font-size:22px; font-weight:800; color:#ffffff; letter-spacing:0.06em;">
                                  SKYE
                                </td>
                                <td style="padding-left:5px;">
                                  <div style="
                                    width:12px;
                                    height:12px;
                                    border-radius:50%;
                                    background:#00A4E8;
                                  "></div>
                                </td>
                              </tr>
                              <tr>
                                <td colspan="2" style="padding-top:3px; font-size:9px; color:#6e7681; letter-spacing:0.18em; text-transform:uppercase;">
                                  Design & Automation
                                </td>
                              </tr>
                            </table>
                          </a>
                        </td>
                        
                        <!-- RIGHT: WhatsApp -->
                        <td align="right" valign="middle">
                          <a href="${createTrackedUrl('https://wa.me/31645998932', 'footer-whatsapp')}" target="_blank" style="
                            display:inline-block;
                            padding:10px 18px;
                            border-radius:6px;
                            border:1px solid #25D366;
                            background:#032015;
                            color:#25D366;
                            font-size:12px;
                            font-weight:600;
                            text-decoration:none;
                            letter-spacing:0.04em;
                          ">
                            WhatsApp
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
        <!-- END MAIN CONTAINER -->
        
      </td>
    </tr>
  </table>
  
</body>
</html>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: subject,
      text: body,  // Plain text fallback
      html: fullHtml  // HTML version with banner
    });

    console.log(`✅ Email verstuurd naar ${toEmail}: ${info.messageId}`);

    // Sla email op in database voor analytics
    try {
      await saveEmail({
        id: emailId,
        toEmail,
        businessName,
        websiteUrl,
        niche: siteAnalysis?.niche || null,
        emailTone,
        subject,
        contactPerson: contactPerson || null
      });
      console.log(`📊 Email opgeslagen in analytics DB: ${emailId}`);
    } catch (dbError) {
      console.error('⚠️ Database save failed (email was still sent):', dbError.message);
    }

    return res.status(200).json({
      success: true,
      emailId,  // Toegevoegd voor tracking referentie
      messageId: info.messageId,
      usedAI,
      subject,
      body,
      toEmail,
      businessName,
      siteAnalysis: siteAnalysis ? {
        issues: siteAnalysis.issues
      } : null,
      sentAt: new Date().toISOString()
    });

  } catch (err) {
    console.error("❌ Error:", err);

    return res.status(500).json({
      error: "Er ging iets mis",
      details: err.message
    });
  }
}
