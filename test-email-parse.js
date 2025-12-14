// Test script om AI email generatie te testen
// Run: node test-email-parse.js

require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require('@google/genai');

const googleAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testEmailGeneration() {
    console.log('🧪 Testing AI email generation...\n');
    console.log('API Key:', process.env.GEMINI_API_KEY ? '✅ Present' : '❌ Missing');

    const testPrompt = `
Je bent een expert in cold email copywriting.
Schrijf een korte test email voor "Test Bedrijf".

Geef je antwoord EXACT in dit formaat:

THOUGHTS:
[Je analyse]

EMAIL_CONTENT:
SUBJECT: Test onderwerp

INTRO:
Dit is een test intro.

AUDIT:
- Punt 1
- Punt 2

BOOSTERS:
- Oplossing 1
- Oplossing 2

RESULTAAT:
Dit is het resultaat.

CTA:
Bel me!
`;

    try {
        console.log('📤 Sending request to Gemini...\n');

        const response = await googleAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: testPrompt,
            config: {
                temperature: 0.7,
                maxOutputTokens: 4000,
            }
        });

        const text = response.text;
        console.log('📥 Raw AI Response:');
        console.log('='.repeat(60));
        console.log(text);
        console.log('='.repeat(60));
        console.log('\n');

        // Test parsing
        console.log('🔍 Testing parsing...\n');

        // Extract EMAIL_CONTENT
        let emailContentBlock = text;
        if (text.includes("EMAIL_CONTENT:")) {
            emailContentBlock = text.split("EMAIL_CONTENT:")[1].trim();
            console.log('✅ Found EMAIL_CONTENT block');
        } else {
            console.log('⚠️ No EMAIL_CONTENT block found');
        }

        // Clean markdown
        const headers = ["SUBJECT", "INTRO", "AUDIT", "BOOSTERS", "RESULTAAT", "CTA"];
        headers.forEach(h => {
            const re = new RegExp(`(?:\\*+|#+)\\s*${h}(?:\\*+)?`, 'ig');
            emailContentBlock = emailContentBlock.replace(re, h);
        });

        // Parse sections
        const parseSection = (name) => {
            const regex = new RegExp(`(?:\\*{1,2}|#{1,3})?\\s*${name}\\s*(?:\\*{1,2})?\\s*:\\s*([\\s\\S]*?)(?=(?:\\*{0,2}|#{0,3})\\s*(?:INTRO|AUDIT|BOOSTERS|OPLOSSING|RESULTAAT|CTA)\\s*(?:\\*{0,2})?\\s*:|$)`, 'i');
            const match = emailContentBlock.match(regex);
            return match ? match[1].trim() : '';
        };

        const sections = {
            intro: parseSection('INTRO'),
            audit: parseSection('AUDIT'),
            boosters: parseSection('BOOSTERS'),
            resultaat: parseSection('RESULTAAT'),
            cta: parseSection('CTA')
        };

        console.log('\n📧 Parsed Sections:');
        console.log('-------------------');
        for (const [key, value] of Object.entries(sections)) {
            console.log(`${key}: ${value ? `✅ (${value.length} chars)` : '❌ EMPTY'}`);
            if (value) {
                console.log(`   "${value.substring(0, 100)}${value.length > 100 ? '...' : ''}"`);
            }
        }

        const emptyCount = Object.values(sections).filter(s => !s).length;
        if (emptyCount > 0) {
            console.log(`\n⚠️ ${emptyCount} sections are empty!`);
        } else {
            console.log('\n✅ All sections parsed successfully!');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }
}

testEmailGeneration();
