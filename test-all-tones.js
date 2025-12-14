// Test script om ALLE email tonen te testen
// Run: node test-all-tones.js

require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const googleAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Load prompt template
function loadPromptTemplate(tone) {
    const defaultTemplate = {
        style: "Zakelijk",
        subjectTemplates: ["{businessName} website check"],
        introExample: "Ik keek naar uw site...",
        resultExample: "Dit levert meer klanten op.",
        ctaExample: "Zullen we bellen?",
        emojiLimit: 5
    };

    try {
        const filePath = path.join(process.cwd(), 'knowledge', 'prompts', `tone-${tone}.md`);
        if (!fs.existsSync(filePath)) {
            console.log(`   ⚠️ File not found: ${filePath}`);
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
            emojiLimit: data.emoji_limit || 5
        };

        return template;
    } catch (error) {
        console.error(`   ❌ Error loading prompt for ${tone}:`, error.message);
        return defaultTemplate;
    }
}

async function testTone(tone) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎨 Testing TONE: ${tone.toUpperCase()}`);
    console.log('='.repeat(60));

    const toneSettings = loadPromptTemplate(tone);
    console.log(`   Style loaded: "${toneSettings.style.substring(0, 50)}..."`);
    console.log(`   Intro example: "${toneSettings.introExample.substring(0, 50)}..."`);

    const prompt = `
Je bent een expert in cold email copywriting.
Schrijf een email voor "Test Restaurant" (https://test-restaurant.be).

TOON: ${tone.toUpperCase()}
STIJL INSTRUCTIE: ${toneSettings.style}

VOORBEELD INTRO (voor de vibe, niet kopiëren):
"${toneSettings.introExample}"

VOORBEELD RESULTAAT (voor de vibe, niet kopiëren):
"${toneSettings.resultExample}"

VOORBEELD CTA (voor de vibe, niet kopiëren):
"${toneSettings.ctaExample}"

Geef je antwoord in dit formaat:

THOUGHTS:
[Korte analyse]

EMAIL_CONTENT:
SUBJECT: [Onderwerp passend bij ${tone} stijl]

INTRO:
[Persoonlijke opening]

AUDIT:
- [Probleem 1]
- [Probleem 2]

BOOSTERS:
- [Oplossing 1]
- [Oplossing 2]

RESULTAAT:
[Droomresultaat]

CTA:
[Call to action]
`;

    try {
        const response = await googleAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                temperature: 0.8,
                maxOutputTokens: 4000,
            }
        });

        const text = response.text;

        // Check if response is complete
        const hasAllSections =
            text.includes('SUBJECT:') &&
            text.includes('INTRO:') &&
            text.includes('AUDIT:') &&
            text.includes('BOOSTERS:') &&
            text.includes('RESULTAAT:') &&
            text.includes('CTA:');

        if (hasAllSections) {
            console.log(`   ✅ Response complete - All sections found`);

            // Parse and show snippets
            const subjectMatch = text.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
            const introMatch = text.match(/INTRO:\s*([\s\S]*?)(?=AUDIT:|$)/i);

            if (subjectMatch) {
                console.log(`   📧 Subject: "${subjectMatch[1].trim()}"`);
            }
            if (introMatch) {
                const intro = introMatch[1].trim().substring(0, 80);
                console.log(`   📝 Intro: "${intro}..."`);
            }
        } else {
            console.log(`   ⚠️ Response INCOMPLETE - Missing sections!`);
            console.log(`   Raw (first 500 chars):`);
            console.log(text.substring(0, 500));
        }

        return hasAllSections;

    } catch (error) {
        console.log(`   ❌ API Error: ${error.message}`);
        return false;
    }
}

async function runAllTests() {
    console.log('🧪 Testing ALL email tones...\n');
    console.log('API Key:', process.env.GEMINI_API_KEY ? '✅ Present' : '❌ Missing');

    const tones = ['professional', 'casual', 'urgent', 'friendly'];
    const results = {};

    for (const tone of tones) {
        results[tone] = await testTone(tone);
        // Small delay between requests
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    for (const [tone, success] of Object.entries(results)) {
        console.log(`   ${tone}: ${success ? '✅ WORKS' : '❌ FAILS'}`);
    }
}

runAllTests();
