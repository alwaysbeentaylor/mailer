
import { analyzeWebsite, extractEmailsFromWebsite } from '../../utils/scraper';
import { validateDomain } from '../../utils/check-host';
import { GoogleGenerativeAI } from "@google/generative-ai";

const GENERIC_PROVIDERS = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
    'msn.com', 'icloud.com', 'me.com', 'protonmail.com', 'aol.com',
    'telenet.be', 'skynet.be', 'proximus.be', 'scarlet.be', 'kpnmail.nl',
    'ziggo.nl', 'home.nl', 'planet.nl', 'hetnet.nl', 'chello.nl'
];

// Generieke email prefixes die we liever overslaan
const GENERIC_EMAIL_PREFIXES = [
    'info', 'contact', 'sales', 'support', 'admin', 'hello', 'hi', 'office',
    'boekhouding', 'klantenservice', 'webmaster', 'no-reply', 'noreply',
    'marketing', 'jobs', 'vacature', 'hr', 'algemeen', 'receptie', 'team'
];

// AI Helper Function
async function enhanceWithGemini(analysis, domain) {
    if (!process.env.GEMINI_API_KEY) {
        console.log('   ⚠️ Geen GEMINI_API_KEY, sla AI over.');
        return analysis;
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Fast & efficient

        const prompt = `
        Je bent een B2B sales expert. Analyseer deze website data voor domein: ${domain}.

        RAW DATA:
        Title: ${analysis.title}
        H1: ${analysis.h1}
        About: ${analysis.aboutContent || ''}
        Services: ${analysis.services?.join(', ') || ''}
        Slogans: ${analysis.slogans?.join(', ') || ''}
        
        JOUW TAAK:
        1. Bepaal de exacte Niche (bijv. "Loodgieter", "SaaS Boekhoudpakket", "Webdesign Bureau").
        2. Extractor de schone Bedrijfsnaam (zonder BV, slogans, etc.).
        3. Schrijf een hyper-korte samenvatting (1 zin) van wat ze doen.
        4. Bedenk 2 unieke, gepersonaliseerde observaties (hooks) voor een cold email.

        Return ALLEEN JSON:
        {
            "niche": "...",
            "companyName": "...",
            "summary": "...",
            "uniqueObservations": ["...", "..."]
        }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();

        const aiData = JSON.parse(text);

        console.log(`   🤖 AI Enrichment Geslaagd: ${aiData.companyName} (${aiData.niche})`);

        // Merge AI data with scraper data (AI wins on Niche/Name/Summary if valid)
        return {
            ...analysis,
            niche: aiData.niche || analysis.niche,
            title: aiData.companyName || analysis.title, // Update company name w/ AI version
            summary: aiData.summary, // New field
            uniqueObservations: [
                ...(aiData.uniqueObservations || []),
                ...(analysis.uniqueObservations || [])
            ].slice(0, 5) // Keep top 5 hooks
        };

    } catch (e) {
        console.error("   ❌ AI Enrichment Error:", e.message);
        return analysis; // Fallback to original scraper data
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, domain: inputDomain, skipValidation = false } = req.body;

    // Bepaal of dit een email of domein input is
    const isEmailInput = email && email.includes('@');
    const isDomainInput = inputDomain && !inputDomain.includes('@');

    if (!isEmailInput && !isDomainInput) {
        return res.status(400).json({ error: 'Voer een email of domein in' });
    }

    try {
        // Extract domain from email or use direct domain input
        let domain;
        let originalEmail = null;

        if (isEmailInput) {
            domain = email.split('@')[1].toLowerCase().trim();
            originalEmail = email;
        } else {
            // Clean domain input (remove https://, www., trailing slashes)
            domain = inputDomain
                .toLowerCase()
                .trim()
                .replace(/^https?:\/\//, '')
                .replace(/^www\./, '')
                .replace(/\/.*$/, '');
        }

        // 1. Check of het een generiek domein is
        if (GENERIC_PROVIDERS.includes(domain)) {
            return res.status(200).json({
                success: false,
                status: 'no_website_generic',
                email,
                domain,
                message: 'Generiek email domein (geen bedrijfswebsite)'
            });
        }

        // 2. 🆕 CHECK-HOST VALIDATIE - Eerst checken of domein leeft!
        // Dit bespaart tijd door dode links vroeg te filteren
        if (!skipValidation) {
            console.log(`🔍 Stap 1: Valideren of ${domain} bereikbaar is...`);
            const validation = await validateDomain(domain, { timeout: 4000, maxNodes: 2 });

            if (!validation.isValid) {
                console.log(`   ❌ Domein ${domain} is DOOD (${validation.status})`);
                return res.status(200).json({
                    success: false,
                    status: 'domain_dead',
                    email,
                    domain,
                    validation: {
                        status: validation.status,
                        latency: validation.latency,
                        successRate: validation.successRate
                    },
                    message: `Domein niet bereikbaar (${validation.status})`
                });
            }

            console.log(`   ✅ Domein ${domain} is ALIVE (${validation.latency}ms)`);
        }

        // 3. Nu pas de volledige website analyse (alleen voor levende sites!)
        // We proberen eerst met www. omdat dat veiliger is voor bedrijfsinfo
        let urlToTest = `https://www.${domain}`;
        let analysis = await analyzeWebsite(urlToTest);

        // Als dat faalt of een error geeft, probeer zonder www
        if (analysis.error) {
            console.log(`   ⚠️ www.${domain} faalde, probeer naked domain...`);
            urlToTest = `https://${domain}`;
            analysis = await analyzeWebsite(urlToTest);
        }

        // 4. Verwerk het resultaat
        if (analysis.error) {
            return res.status(200).json({
                success: false,
                status: 'website_unreachable',
                email,
                domain,
                message: 'Website niet bereikbaar'
            });
        }

        // 5. 🆕 OME AI ENRICHMENT (Gemini Step)
        console.log(`   🤖 Start Ome AI (Gemini) analyse...`);
        const aiEnhancedAnalysis = await enhanceWithGemini(analysis, domain);

        // 6. Succes! Extract only the required info for the CSV
        // We keep it minimal - the agent will use the knowledgeFile for guidance

        // 🆕 Als dit een domain-only input is, probeer email te vinden
        let foundEmail = originalEmail; // Als er al een email was, gebruik die
        let foundEmails = [];

        if (!originalEmail && aiEnhancedAnalysis.extractedEmails) {
            // Emails zijn geëxtraheerd door de scraper
            foundEmails = aiEnhancedAnalysis.extractedEmails || [];

            // Sorteer: persoonlijke emails eerst (niet info@, contact@, etc.)
            const personalEmails = foundEmails.filter(e => {
                const prefix = e.split('@')[0].toLowerCase();
                return !GENERIC_EMAIL_PREFIXES.includes(prefix);
            });

            const genericEmails = foundEmails.filter(e => {
                const prefix = e.split('@')[0].toLowerCase();
                return GENERIC_EMAIL_PREFIXES.includes(prefix);
            });

            // Gebruik persoonlijke email als die er is, anders generieke
            foundEmail = personalEmails[0] || genericEmails[0] || null;

            console.log(`   📧 Gevonden emails: ${foundEmails.length} (persoonlijk: ${personalEmails.length})`);
            if (foundEmail) {
                console.log(`   ✅ Beste email: ${foundEmail}`);
            }
        }

        // Als er geen email gevonden is bij domain-only input
        if (!originalEmail && !foundEmail) {
            return res.status(200).json({
                success: false,
                status: 'no_email_found',
                email: null,
                domain,
                websiteUrl: urlToTest,
                message: 'Geen email gevonden op website',
                data: {
                    companyName: aiEnhancedAnalysis.title || domain,
                    contactPerson: aiEnhancedAnalysis.teamMembers?.[0] || '',
                    knowledgeFile: aiEnhancedAnalysis.knowledgeFile || 'overig.md',
                    allEmails: foundEmails, // Alle gevonden emails (mogelijk leeg)
                    ...aiEnhancedAnalysis
                }
            });
        }

        return res.status(200).json({
            success: true,
            status: 'success',
            email: foundEmail,
            domain,
            websiteUrl: urlToTest,
            inputType: originalEmail ? 'email' : 'domain',
            data: {
                companyName: aiEnhancedAnalysis.title || domain, // Bedrijfsnaam
                contactPerson: aiEnhancedAnalysis.teamMembers?.[0] || '', // Contactpersoon (optioneel)
                knowledgeFile: aiEnhancedAnalysis.knowledgeFile || 'overig.md', // Pointer naar juiste niche file
                allEmails: foundEmails, // Alle gevonden emails (voor referentie)
                summary: aiEnhancedAnalysis.summary, // AI Summary
                uniqueObservations: aiEnhancedAnalysis.uniqueObservations // AI + Scraper Hooks
            }
        });

    } catch (error) {
        console.error('Enrichment error:', error);
        return res.status(500).json({
            success: false,
            status: 'error',
            email: email || null,
            domain: inputDomain || null,
            message: error.message
        });
    }
}
