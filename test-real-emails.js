// Test script: 8 echte emails versturen (2 per stijl)
// Run: node test-real-emails.js

require('dotenv').config({ path: '.env.local' });

const TEST_EMAIL = 'develop.json@gmail.com';

// 8 Echte Nederlandse/Belgische bedrijven (mix van branches)
const testBusinesses = [
    // Professional (ROI Focus) - 2 bedrijven
    {
        businessName: 'Restaurant De Gouden Leeuw',
        websiteUrl: 'https://www.degoudenleeuw.be',
        tone: 'professional'
    },
    {
        businessName: 'Bakkerij Van den Berg',
        websiteUrl: 'https://www.bakkerijvandenberg.nl',
        tone: 'professional'
    },

    // Casual (Value Drop) - 2 bedrijven
    {
        businessName: 'Fitness First Antwerpen',
        websiteUrl: 'https://www.fitnessfirst.be',
        tone: 'casual'
    },
    {
        businessName: 'Kapsalon Style Studio',
        websiteUrl: 'https://www.stylestudio.nl',
        tone: 'casual'
    },

    // Urgent (FOMO) - 2 bedrijven
    {
        businessName: 'Autogarage Janssens',
        websiteUrl: 'https://www.garagejanssens.be',
        tone: 'urgent'
    },
    {
        businessName: 'Tandartspraktijk Gezond Gebit',
        websiteUrl: 'https://www.gezondgebit.nl',
        tone: 'urgent'
    },

    // Friendly (Warm Direct) - 2 bedrijven
    {
        businessName: 'Bloemenwinkel Flora',
        websiteUrl: 'https://www.florabloemen.be',
        tone: 'friendly'
    },
    {
        businessName: 'Fysiotherapie Centrum',
        websiteUrl: 'https://www.fysiocentrum.nl',
        tone: 'friendly'
    }
];

async function sendTestEmail(business, index) {
    const toneLabels = {
        'professional': '💰 ROI Focus',
        'casual': '🎯 Value Drop',
        'urgent': '🔥 FOMO',
        'friendly': '🤝 Warm Direct'
    };

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📧 Email ${index + 1}/8: ${business.businessName}`);
    console.log(`   🎨 Stijl: ${toneLabels[business.tone]} (${business.tone})`);
    console.log(`   🌐 URL: ${business.websiteUrl}`);
    console.log('='.repeat(60));

    try {
        const response = await fetch('http://localhost:3000/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                toEmail: TEST_EMAIL,
                businessName: business.businessName,
                websiteUrl: business.websiteUrl,
                emailTone: business.tone,
                contactPerson: '',
                // Laat de API de SMTP config ophalen
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log(`   ✅ VERZONDEN!`);
            console.log(`   📧 Subject: "${result.subject}"`);
            console.log(`   🤖 AI Used: ${result.usedAI ? 'Ja' : 'Nee (Fallback)'}`);

            // Check sections
            if (result.sections) {
                const filled = Object.entries(result.sections)
                    .filter(([k, v]) => v && v.length > 10)
                    .map(([k]) => k);
                console.log(`   📊 Secties: ${filled.join(', ')}`);
            }

            return { success: true, tone: business.tone };
        } else {
            console.log(`   ❌ FOUT: ${result.error || result.details}`);
            return { success: false, tone: business.tone, error: result.error };
        }
    } catch (err) {
        console.log(`   ❌ REQUEST FOUT: ${err.message}`);
        return { success: false, tone: business.tone, error: err.message };
    }
}

async function runTests() {
    console.log('\n🧪 START: 8 Test Emails Versturen');
    console.log(`📬 Alle emails gaan naar: ${TEST_EMAIL}`);
    console.log(`⏰ Start: ${new Date().toLocaleTimeString('nl-NL')}\n`);

    const results = [];

    for (let i = 0; i < testBusinesses.length; i++) {
        const result = await sendTestEmail(testBusinesses[i], i);
        results.push(result);

        // Wacht 5 seconden tussen emails (om rate limits te voorkomen)
        if (i < testBusinesses.length - 1) {
            console.log(`   ⏳ Wachten 5 seconden...`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SAMENVATTING');
    console.log('='.repeat(60));

    const tones = ['professional', 'casual', 'urgent', 'friendly'];
    const toneLabels = {
        'professional': '💰 ROI Focus',
        'casual': '🎯 Value Drop',
        'urgent': '🔥 FOMO',
        'friendly': '🤝 Warm Direct'
    };

    for (const tone of tones) {
        const toneResults = results.filter(r => r.tone === tone);
        const success = toneResults.filter(r => r.success).length;
        const total = toneResults.length;
        const status = success === total ? '✅' : (success > 0 ? '⚠️' : '❌');
        console.log(`   ${status} ${toneLabels[tone]}: ${success}/${total} succesvol`);
    }

    const totalSuccess = results.filter(r => r.success).length;
    console.log(`\n   📧 Totaal: ${totalSuccess}/${results.length} emails verzonden`);
    console.log(`   ⏰ Klaar: ${new Date().toLocaleTimeString('nl-NL')}`);
}

runTests().catch(console.error);
