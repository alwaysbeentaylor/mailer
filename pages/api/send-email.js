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
import {
  AppError,
  ERROR_CODES,
  formatErrorResponse,
  logError,
  wrapError
} from '../../utils/error-handler';

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
// Genereer Hormozi-style email op basis van site analyse - MET REASONING PHASE
async function generateEmailWithAnalysis({ businessName, websiteUrl, contactPerson, emailTone, siteAnalysis, sessionPrompt = "" }) {
  // 1. Laad tone instellingen
  const toneSettings = loadPromptTemplate(emailTone);

  // 2. Bereid context data voor (alleen waardevolle info voor de AI)
  const contextData = {
    business: {
      name: businessName,
      url: websiteUrl,
      contact: contactPerson || 'onbekend',
      city: siteAnalysis.city || 'onbekend',
      detectedNiche: siteAnalysis.niche || 'onbekend'
    },
    content: {
      slogans: siteAnalysis.slogans || [],
      claims: siteAnalysis.claims || [],
      services: siteAnalysis.services?.slice(0, 5) || [],
      usps: siteAnalysis.usps?.slice(0, 4) || [],
      testimonials: siteAnalysis.testimonials?.map(t => `"${t.text.slice(0, 50)}..." (${t.author || 'klant'})`) || [],
      promos: siteAnalysis.promos || [],
      stats: siteAnalysis.stats || [],
      team: siteAnalysis.teamMembers || [],
      aboutStory: siteAnalysis.aboutContent ? siteAnalysis.aboutContent.slice(0, 500) : ''
    },
    technical: {
      issues: siteAnalysis.issues || [],
      hasTestimonials: siteAnalysis.hasTestimonials,
      isFacebook: siteAnalysis.isFacebookPage
    }
  };

  // 3. Haal niche kennis op als referentie
  const allNiches = loadNiches();
  const nicheKnowledge = allNiches[siteAnalysis.niche] || allNiches['overig'] || {};

  // Define tone variables needed for the prompt
  const toneStyle = toneSettings.style;

  // Helper to replace placeholders in examples (for context)
  const replacePlaceholders = (text) => {
    if (!text) return '';
    return text
      .replace(/{businessName}/g, businessName)
      .replace(/{websiteUrl}/g, websiteUrl)
      .replace(/{firstName}/g, contactPerson ? contactPerson.split(' ')[0] : '');
  };

  const introExample = replacePlaceholders(toneSettings.introExample);
  const resultExample = replacePlaceholders(toneSettings.resultExample);
  const ctaExample = replacePlaceholders(toneSettings.ctaExample);

  // 4. Bouw de "Reasoning First" Prompt
  const prompt = `
Je bent een expert in cold email copywriting (Alex Hormozi stijl).
Je taak is om een ULTRA-PERSOONLIJKE email te schrijven naar "${businessName}".

=== 1. JE DATA BRONNEN ===
Hier is wat we weten over het bedrijf (JSON):
${JSON.stringify(contextData, null, 2)}

SUGGESTIES UIT BRANCHE KENNISBANK (${siteAnalysis.niche || 'algemeen'}):
Resultaat promise: "${nicheKnowledge.resultClaim || 'meer klanten'}"
Pijnpunten: "${nicheKnowledge.painPoints || 'tijdgebrek, lage conversie'}"

=== 2. JE OPDRACHT ===
Schrijf een email in deze toon: ${emailTone.toUpperCase()}

=== STIJL: ${emailTone.toUpperCase()} ===
⚠️ DIT IS DE BELANGRIJKSTE INSTRUCTIE! VOLG DEZE STIJL EXACT:

${toneStyle}

=== INSPIRATIE VOOR DE TOON (GEBRUIK JE EIGEN WOORDEN!) ===
Hieronder zie je voorbeelden van de gewenste HOUDING/VIBE.
❌ KOPIEER DE TEKST NIET LETTERLIJK!
✅ Gebruik de energie en structuur, maar schrijf een UNIEKE email passend bij ${contextData.business.name}.

VOORBEELD INTRO (Alleen voor de Vibe):
"${introExample}"

VOORBEELD RESULTAAT (Alleen voor de Vibe):
"${resultExample}"

VOORBEELD CTA (Alleen voor de Vibe):
"${ctaExample}"

BELANGRIJK: Je moet eerst NADENKEN voordat je schrijft.
Gebruik de Chain of Thought methode om de beste "hook" te vinden.

STAP A: ANALYSE (Thinking Phase)
- Kijk naar de data. Wat is het opvallendste? (Slogan? Stad? Een claim? Teamlid?)
- CHECK: Is er een 'aboutStory' (Over ons)? Zo ja, gebruik details (oprichtingsjaar, gezin, missie) voor een unieke opening!
- Bepaal de échte niche (is het echt een ${siteAnalysis.niche} of zie je iets anders?)
- Als de niche in de kennisbank SAAI is, verzin dan betere, specifiekere pijnpunten.
- Kies een specifieke observatie voor de INTRO. (Geen generieke "ik zag je site")

STAP B: DE EMAIL (Content Phase)
- Schrijf de email in het Nederlands.
- Hanteer de structuur: Subject -> Intro -> Audit -> Oplossing -> Resultaat -> CTA.
- De INTRO moet de observatie uit stap A bevatten.

=== 📖 SCHRIJFSTIJL (HEEL BELANGRIJK!) ===
Schrijf alsof je praat tegen een slimme 14-jarige. Alex Hormozi regel: "If a 5th grader can't understand it, rewrite it."

✅ WEL:
- Korte zinnen (max 12-15 woorden per zin)
- Simpele woorden die iedereen kent
- Spreektaal, alsof je een vriend een berichtje stuurt
- Actieve zinnen ("Ik zag..." niet "Er werd geobserveerd...")
- Concrete voorbeelden, geen abstracte concepten

❌ NIET:
- Moeilijke woorden (geen "optimaliseren", "implementeren", "faciliteren", "conversieratio")
- Lange zinnen met veel komma's
- Formeel taalgebruik ("Geachte heer/mevrouw", "Hoogachtend")
- Wollig taalgebruik ("in het kader van", "met betrekking tot")
- Jargon of vakterm

VOORBEELDEN van goede simpele zinnen:
- "Ik keek naar je site. Er missen dingen." ✅
- "Ik heb een grondige analyse uitgevoerd van uw digitale aanwezigheid." ❌
- "Je verliest klanten. Elke dag." ✅  
- "Er is sprake van suboptimale conversie." ❌
- "Bel me. 10 minuten. Ik laat het zien." ✅
- "Ik nodig u uit voor een vrijblijvend kennismakingsgesprek." ❌

=== 3. OUTPUT FORMAAT ===
Geef je antwoord EXACT in dit formaat:

THOUGHTS:
[Je interne monoloog en strategie. 
1. Analyse: ...
2. About-Check: Heb ik iets persoonlijks gevonden in 'aboutStory'?
3. Gekozen Hook: ...
4. Pijnpunten: ...]

EMAIL_CONTENT:
SUBJECT: [Korte, pakkende titel]

INTRO:
[De persoonlijke opening]

AUDIT:
[Korte lijst met gemiste kansen, max 3 bullets]

BOOSTERS:
[De oplossing/verbeterpunten, max 3 bullets]

RESULTAAT:
[Het droomresultaat voor de klant]

CTA:
[Korte call to action]

${sessionPrompt ? `\nEXTRA INSTRUCTIE: ${sessionPrompt}` : ''}
`;

  console.log(`\n🤖 AI Reasoning Prompt verstuurd voor ${businessName}...`);
  console.log(`   🎨 Tone: ${emailTone.toUpperCase()}`);
  console.log(`   📝 Style: "${toneSettings.style.substring(0, 60)}..."`);

  // Attempt generation with fallback models
  let text = "";
  let usedModel = "gemini-1.5-flash"; // Primary model

  try {
    // Attempt 1: Gemini 1.5 Flash (Fast & reliable)
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.85,
        topP: 0.95,
        maxOutputTokens: 4000,
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    text = response.text();

  } catch (error1) {
    console.warn(`⚠️ Model ${usedModel} failed: ${error1.message || error1}`);

    // Fallback logic
    try {
      usedModel = "gemini-1.5-pro"; // Try Pro model as fallback
      console.log(`🔄 Switching to fallback model: ${usedModel}...`);

      const modelFallback = genAI.getGenerativeModel({
        model: "gemini-1.5-pro",
        generationConfig: {
          temperature: 0.85,
          topP: 0.95,
          maxOutputTokens: 4000,
        }
      });

      const responseFallback = await modelFallback.generateContent(prompt);
      const resultFallback = await responseFallback.response;
      text = resultFallback.text();

    } catch (error2) {
      console.error(`❌ All models failed. Last error: ${error2.message || error2}`);
      throw error2;
    }
  }

  if (text) text = text.trim();
  console.log(`✅ AI Response received from ${usedModel}`);

  // === PARSING LOGIC ===

  // 1. Extraheer de gedachten (voor logging)
  const thoughtsMatch = text.match(/THOUGHTS:\s*([\s\S]*?)(?=EMAIL_CONTENT:|$)/i);
  const thoughts = thoughtsMatch ? thoughtsMatch[1].trim() : "Geen gedachten gegenereerd.";
  console.log(`\n🧠 AI THOUGHTS:\n${thoughts.split('\n').map(l => '   > ' + l).join('\n')}\n`);

  // 2. Extraheer de email content
  let emailContentBlock = text;
  if (text.includes("EMAIL_CONTENT:")) {
    emailContentBlock = text.split("EMAIL_CONTENT:")[1].trim();
  } else if (text.includes("THOUGHTS:")) {
    // Fallback: Alles na THOUGHTS blok
    emailContentBlock = text.split(/THOUGHTS:[\s\S]*?(?:\n\n|$)/)[1] || text;
  }

  // Clean up markdown formatting from headers to ensure regex matches
  // Remove ** or ## around typical headers
  const headers = ["SUBJECT", "INTRO", "AUDIT", "KANSEN", "BOOSTERS", "OPLOSSING", "RESULTAAT", "BELOFTE", "CTA"];
  headers.forEach(h => {
    // Replace **INTRO:** with INTRO:
    const re = new RegExp(`(?:\\*+|#+)\\s*${h}(?:\\*+)?`, 'ig');
    emailContentBlock = emailContentBlock.replace(re, h);
  });

  // 3. Parse secties
  let sections = {
    intro: '',
    audit: '',
    boosters: '',
    resultaat: '',
    cta: ''
  };

  // Robuuste regexes voor secties - nu ook met markdown variaties
  const parseSection = (name) => {
    // Match: "INTRO:", "**INTRO:**", "## INTRO:", "INTRO :", etc.
    const regex = new RegExp(`(?:\\*{1,2}|#{1,3})?\\s*${name}\\s*(?:\\*{1,2})?\\s*:\\s*([\\s\\S]*?)(?=(?:\\*{0,2}|#{0,3})\\s*(?:INTRO|AUDIT|BOOSTERS|OPLOSSING|RESULTAAT|BELOFTE|CTA)\\s*(?:\\*{0,2})?\\s*:|$)`, 'i');
    const match = emailContentBlock.match(regex);
    return match ? match[1].trim() : '';
  };

  sections.intro = parseSection('INTRO');
  sections.audit = parseSection('AUDIT') || parseSection('KANSEN');
  sections.boosters = parseSection('BOOSTERS') || parseSection('OPLOSSING');
  sections.resultaat = parseSection('RESULTAAT') || parseSection('BELOFTE');
  sections.cta = parseSection('CTA');

  // Debug: Als secties leeg zijn, log de raw content voor debugging
  if (!sections.intro && !sections.audit) {
    console.log(`⚠️ PARSE DEBUG: Geen secties gevonden. Eerste 500 chars van emailContentBlock:`);
    console.log(emailContentBlock.slice(0, 500));

    // 🆕 FALLBACK PARSING: Probeer de content te splitten op newlines en gebruik heuristics
    const lines = emailContentBlock.split('\n').filter(l => l.trim());

    if (lines.length > 3) {
      // Heuristic: First non-empty line after SUBJECT is intro
      let startIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('subject:')) {
          startIdx = i + 1;
          break;
        }
      }

      // Group remaining lines into sections (rough estimate)
      const contentLines = lines.slice(startIdx);
      if (contentLines.length > 0) {
        // First paragraph = intro
        const paragraphBreaks = [];
        for (let i = 0; i < contentLines.length; i++) {
          if (contentLines[i].trim() === '') {
            paragraphBreaks.push(i);
          }
        }

        // Simple split: separate by bullet points or paragraphs
        const bulletLines = contentLines.filter(l => l.trim().match(/^[-*•]/));
        const textLines = contentLines.filter(l => !l.trim().match(/^[-*•]/));

        if (textLines.length > 0) {
          sections.intro = textLines.slice(0, Math.min(2, textLines.length)).join('\n');
        }
        if (bulletLines.length > 0) {
          const half = Math.ceil(bulletLines.length / 2);
          sections.audit = bulletLines.slice(0, half).join('\n');
          sections.boosters = bulletLines.slice(half).join('\n');
        }
        if (textLines.length > 2) {
          sections.resultaat = textLines[textLines.length - 2] || '';
          sections.cta = textLines[textLines.length - 1] || '';
        }

        console.log(`✅ Fallback parsing toegepast - ${Object.values(sections).filter(s => s).length} secties gevonden`);
      }
    }
  }

  // Parse subject
  let subject = "Website check";
  const subjectMatch = emailContentBlock.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
  } else {
    // Fallback subject uit settings
    const subTemplates = toneSettings.subjectTemplates || [];
    if (subTemplates.length > 0) {
      subject = subTemplates[Math.floor(Math.random() * subTemplates.length)]
        .replace(/{businessName}/g, businessName);
    }
  }

  // Fallback body construction
  const body = `${sections.intro}\n\n${sections.audit}\n\n${sections.boosters}\n\n${sections.resultaat}\n\n${sections.cta}`;

  // Log section status for debugging
  console.log(`📧 Parsed sections:`);
  console.log(`   intro: ${sections.intro ? '✅' : '❌'} (${sections.intro?.length || 0} chars)`);
  console.log(`   audit: ${sections.audit ? '✅' : '❌'} (${sections.audit?.length || 0} chars)`);
  console.log(`   boosters: ${sections.boosters ? '✅' : '❌'} (${sections.boosters?.length || 0} chars)`);
  console.log(`   resultaat: ${sections.resultaat ? '✅' : '❌'} (${sections.resultaat?.length || 0} chars)`);
  console.log(`   cta: ${sections.cta ? '✅' : '❌'} (${sections.cta?.length || 0} chars)`);

  console.log(`   ✅ Email gegenereerd: "${subject}"`);

  return { subject, body, sections, thoughts }; // Return thoughts too optionally
}

// === 🆕 AI QUALITY CHECK ===
// Controleert de gegenereerde email op logische fouten en onzinnige zinnen
async function validateEmailQuality(sections, businessName, emailTone) {
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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: validationPrompt }] }], // Correct content alignment
      generationConfig: { temperature: 0.1 }
    });
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
    smtpConfig: providedSmtpConfig = null, // Directe SMTP config (voor campaign systeem)
    smtpAccountId = null // SMTP account ID om credentials op te halen
  } = req.body;

  // Als er een smtpAccountId is meegegeven, haal de config op
  let smtpConfig = providedSmtpConfig;
  const hasMaskedPassword = smtpConfig?.pass?.includes('•••');

  if ((!smtpConfig || hasMaskedPassword) && smtpAccountId) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const smtpRes = await fetch(`${baseUrl}/api/get-smtp-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: smtpAccountId })
      });
      const smtpData = await smtpRes.json();
      if (smtpData.success) {
        smtpConfig = smtpData.smtpConfig;
        console.log(`📧 SMTP account geladen: ${smtpConfig.user}`);
      } else {
        console.warn(`⚠️ SMTP account niet gevonden: ${smtpAccountId}`);
      }
    } catch (err) {
      console.error('Error loading SMTP config:', err);
    }
  }

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
    const error = new AppError(ERROR_CODES.VALIDATION_MISSING_FIELDS, null, {
      missing: {
        toEmail: !toEmail,
        businessName: !businessName,
        websiteUrl: !websiteUrl
      }
    });
    return res.status(400).json(error.toJSON());
  }

  try {
    let subject, body;
    let sections = null;
    let usedAI = false;
    let siteAnalysis = null;
    let thoughts = '';

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
            thoughts = result.thoughts;
            usedAI = true;

            // 🆕 QUALITY CHECK - alleen als we sections hebben
            if (sections && (sections.intro || sections.audit)) {
              const quality = await validateEmailQuality(sections, businessName, emailTone);

              if (quality.shouldRegenerate && attempts <= MAX_RETRIES) {
                console.log(`   🔄 Kwaliteit te laag (${quality.score}/10), opnieuw genereren...`);
                continue; // Probeer opnieuw
              }

              // Na alle retries, accepteren we wat we hebben (zelfs als kwaliteit niet perfect is)
              qualityOK = true;
              if (quality.shouldRegenerate) {
                console.log(`   ⚠️ Kwaliteit niet ideaal (${quality.score}/10), maar we gebruiken het toch`);
              } else {
                console.log(`   ✅ Kwaliteit goedgekeurd: ${quality.score}/10`);
              }
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
        console.error(`   Tone: ${emailTone}`);

        // EXPOSE ERROR FOR DEBUGGING
        thoughts = `❌ AI ERROR: ${outerError.message}`;

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
        thoughts,
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
      sections, // Include broken down sections
      thoughts, // Include AI reasoning
      toEmail,
      businessName,
      siteAnalysis: siteAnalysis ? {
        issues: siteAnalysis.issues
      } : null,
      sentAt: new Date().toISOString()
    });

  } catch (err) {
    // Log the error with context
    logError(err, 'send-email');

    // Wrap and format the error for user-friendly response
    const formattedError = formatErrorResponse(err, {
      toEmail,
      businessName,
      websiteUrl,
      smtpAccountId
    });

    // Determine status code based on error type
    let statusCode = 500;
    if (formattedError.error.code?.startsWith('VAL_')) {
      statusCode = 400; // Validation errors
    } else if (formattedError.error.code?.startsWith('SMTP_005')) {
      statusCode = 400; // Not configured
    }

    return res.status(statusCode).json(formattedError);
  }
}
