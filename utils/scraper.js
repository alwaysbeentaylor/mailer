import * as cheerio from "cheerio";
import { loadNiches } from './knowledge.js';

// Scrape en analyseer de website - DEEP PERSONALIZATION VERSION
export async function analyzeWebsite(url) {
    try {
        // Fetch de website
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        if (!response.ok) {
            return { error: `Website niet bereikbaar (${response.status})`, issues: [] };
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // === STAP 1: HAAL BELANGRIJKE TEKST OP ===
        const pageTitle = $('title').text().trim().toLowerCase();
        const metaDescription = $('meta[name="description"]').attr('content')?.toLowerCase() || '';
        const h1Text = $('h1').first().text().trim().toLowerCase();
        const mainHeadings = $('h1, h2').map((i, el) => $(el).text().trim().toLowerCase()).get().join(' ');

        // Combineer de BELANGRIJKSTE content voor niche detectie (gewogen)
        const priorityContent = `${pageTitle} ${pageTitle} ${pageTitle} ${h1Text} ${h1Text} ${metaDescription} ${mainHeadings}`;

        // === DIEPE ANALYSE: Zoek naar TEAM of OVER ONS pagina ===
        let extraHtml = '';
        try {
            // Zoek links die wijzen naar team/over ons
            let subLink = '';
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().toLowerCase();
                if (!subLink && href && (text.includes('team') || text.includes('over') || text.includes('about'))) {
                    if (!href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto')) {
                        subLink = href;
                    } else if (href.startsWith(url) || href.startsWith('/')) {
                        subLink = href;
                    }
                }
            });

            if (subLink) {
                console.log(`   ↪️ Diepe analyse: subpagina gevonden: ${subLink}`);
                const urlObj = new URL(url);
                // Correcte absolute URL bouwen
                const subUrl = subLink.startsWith('http') ? subLink : new URL(subLink, urlObj.origin).href;

                const subRes = await fetch(subUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 6000
                });
                if (subRes.ok) {
                    extraHtml = await subRes.text();
                    console.log(`   ✅ Subpagina content geladen (${extraHtml.length} bytes)`);
                }
            }
        } catch (e) {
            console.log(`   ⚠️ Kon subpagina niet laden: ${e.message}`);
        }

        // Combineer HTML voor extractie (zodat we teamleden/teksten van beide pagina's vinden)
        const combinedHtml = html + '\n' + extraHtml;

        // === NICHE/BRANCHE DETECTIE - DYNAMISCH ===
        const allNicheData = loadNiches();
        let detectedNiche = 'bedrijf';
        let nicheScore = 0;
        let allScores = {};

        for (const [niche, data] of Object.entries(allNicheData)) {
            let score = 0;
            const keywords = data.keywords || [];

            for (const keyword of keywords) {
                // Check in PRIORITEIT content (title, h1, meta) - 5x gewicht
                if (priorityContent.includes(keyword.toLowerCase())) {
                    score += 5;
                }
                // Check in volledige pagina - 1 punt, max 2 per keyword
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                const fullPageMatches = html.toLowerCase().match(regex);
                if (fullPageMatches) {
                    score += Math.min(fullPageMatches.length, 2);
                }
            }
            allScores[niche] = score;
            if (score > nicheScore) {
                nicheScore = score;
                detectedNiche = niche;
            }
        }

        // Alleen niche toekennen als score minimaal 5 is
        if (nicheScore < 5) {
            detectedNiche = 'bedrijf';
        }

        // Log scores voor debugging
        const topScores = Object.entries(allScores)
            .filter(([_, s]) => s > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        console.log(`   🔍 Niche scores: ${topScores.map(([n, s]) => `${n}(${s})`).join(', ') || 'geen'}`);
        console.log(`   ✅ Gekozen niche: ${detectedNiche} (score: ${nicheScore})`);

        // === CONTENT EXTRACTIE ===
        const $fresh = cheerio.load(combinedHtml);

        // Haal koppen op
        const allHeadings = [];
        $fresh('h1, h2, h3').each((i, el) => {
            const text = $fresh(el).text().trim();
            if (text && text.length > 5 && text.length < 100 &&
                !text.toLowerCase().includes('menu') &&
                !text.toLowerCase().includes('navigat')) {
                allHeadings.push(text);
            }
        });

        // Diensten uit specifieke secties
        const services = [];
        $fresh('[class*="service"] li, [class*="dienst"] li, main h3, article h3').each((i, el) => {
            let text = $fresh(el).text().trim();
            if (text.includes('\n')) text = text.split('\n')[0].trim();
            if (text && text.length > 3 && text.length < 60 &&
                !text.toLowerCase().includes('meer info') &&
                !text.toLowerCase().includes('lees meer')) {
                services.push(text);
            }
        });

        // Slogans
        const slogans = [];
        $fresh('h1, h2, .hero, [class*="hero"], [class*="slogan"]').each((i, el) => {
            const text = $fresh(el).text().trim();
            if (text && text.length > 10 && text.length < 120 &&
                !text.toLowerCase().includes('menu') &&
                !text.toLowerCase().includes('cookie')) {
                slogans.push(text);
            }
        });

        // Stats
        const statsRegex = /(\d+)\s*(?:\+|plus)?\s*(?:jaar|jaren|klanten|projecten|reviews)/gi;
        const foundStats = combinedHtml.toLowerCase().match(statsRegex) || [];

        // Team namen detectie (Geavanceerd)
        const teamNames = [];
        const extractedEmails = []; // 🆕 Verzamel alle emails voor domain-only enrichment
        const genericNames = ['info', 'contact', 'sales', 'support', 'admin', 'hello', 'hi', 'office', 'boekhouding', 'klantenservice', 'webmaster', 'no-reply', 'marketing', 'jobs', 'vacature'];

        // Methode 1: Zoek in Team/Over secties (bestaande logica)
        $fresh('[class*="team"], [class*="over"], [class*="about"]').each((i, el) => {
            const text = $fresh(el).text().trim();
            // Zoek naar "Voornaam Achternaam" patterns - iets strenger
            const nameMatch = text.match(/\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/g);
            if (nameMatch) {
                nameMatch.forEach(name => {
                    // Filter uit als het op de blocklist lijkt of te lang is
                    if (!genericNames.some(g => name.toLowerCase().includes(g)) && name.length < 30) {
                        teamNames.push(name);
                    }
                });
            }
        });

        // Methode 2: Extractie uit mailto links (NIEUW)
        $('a[href^="mailto:"]').each((i, el) => {
            const href = $(el).attr('href');
            const email = href.replace('mailto:', '').split('?')[0].trim(); // Verwijder subject params
            if (email && email.includes('@')) {
                // 🆕 Voeg email toe aan extractedEmails (voor domain-only enrichment)
                if (!extractedEmails.includes(email.toLowerCase())) {
                    extractedEmails.push(email.toLowerCase());
                }

                const parts = email.split('@');
                const localPart = parts[0];

                // Als de naam geen punt bevat (bijv. jan@...) en niet generiek is
                if (!localPart.includes('.') && !genericNames.includes(localPart.toLowerCase()) && localPart.length > 2) {
                    // Capitalize first letter
                    const name = localPart.charAt(0).toUpperCase() + localPart.slice(1).toLowerCase();
                    if (!teamNames.includes(name)) {
                        console.log(`   👤 Naam gevonden via email: ${name}`);
                        teamNames.push(name);
                    }
                }
                // Als naam wel punt bevat (jan.jansen@...)
                else if (localPart.includes('.') && !genericNames.includes(localPart.toLowerCase())) {
                    const nameParts = localPart.split('.');
                    // Neem de voornaam
                    if (nameParts[0].length > 2) {
                        const name = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase();
                        if (!teamNames.includes(name)) {
                            console.log(`   👤 Naam gevonden via email (punt): ${name}`);
                            teamNames.push(name);
                        }
                    }
                }
            }
        });

        // Stad detectie (Geavanceerd via Postcodes)
        // Oude methode: statische lijst
        // Nieuwe methode: Regex voor BE (4 cijfers) en NL (4 cijfers + 2 letters) postcodes
        let detectedCity = null;

        // Regex voor BE: 1000-9999 gevolgd door Stad (bijv: 3000 Leuven)
        // We zoeken naar een patroon in de tekst van de hele pagina
        const beZipRegex = /\b([1-9]\d{3})\s+([A-Z][a-z\u00C0-\u00FF]+(?:[\s-][A-Z][a-z\u00C0-\u00FF]+)*)/g;

        // Regex voor NL: 1000 AA - 9999 ZZ gevolgd door Stad
        const nlZipRegex = /\b([1-9]\d{3})\s?[A-Z]{2}\s+([A-Z][a-z\u00C0-\u00FF]+(?:[\s-][A-Z][a-z\u00C0-\u00FF]+)*)/g;

        // Scan footer en contact secties met voorrang (meest betrouwbaar)
        const contactText = $fresh('footer, [class*="footer"], [class*="contact"], [id*="contact"]').text().replace(/\s+/g, ' ');

        let match = beZipRegex.exec(contactText) || nlZipRegex.exec(contactText);

        if (!match) {
            // Fallback: scan hele body als niet gevonden in footer
            const bodyText = $fresh('body').text().replace(/\s+/g, ' ');
            match = beZipRegex.exec(bodyText) || nlZipRegex.exec(bodyText);
        }

        if (match && match[2]) {
            detectedCity = match[2].trim();
            // Filter uit valse positieven (bijv. "2023 Copyright")
            if (detectedCity.toLowerCase() === 'copyright' || detectedCity.toLowerCase() === 'all' || detectedCity.length < 3) {
                detectedCity = null;
            } else {
                console.log(`   📍 Stad gedetecteerd via postcode: ${detectedCity} (Code: ${match[1]})`);
            }
        }

        // Fallback naar de oude lijsten als regex faalt (voor grote steden zonder zichtbare postcode)
        if (!detectedCity) {
            const cities = ['Brussel', 'Antwerpen', 'Gent', 'Brugge', 'Leuven', 'Mechelen', 'Aalst', 'Hasselt', 'Oostende', 'Kortrijk', 'Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven', 'Tilburg', 'Groningen', 'Almere', 'Breda', 'Nijmegen'];
            for (const city of cities) {
                if (new RegExp(`\\b${city}\\b`, 'i').test(combinedHtml)) {
                    detectedCity = city;
                    break;
                }
            }
        }

        // About content
        let aboutContent = '';
        $fresh('[class*="about"], [class*="over"]').each((i, el) => {
            const text = $fresh(el).text().trim();
            if (text && text.length > 30 && text.length < 500 && !aboutContent) {
                aboutContent = text.replace(/\s+/g, ' ').slice(0, 200);
            }
        });

        // Feature flags
        const hasOpeningHours = /openingstijden|geopend|open van/i.test(combinedHtml);
        const hasTestimonials = $fresh('[class*="review"], [class*="testimonial"]').length > 0;
        const hasBlog = $fresh('[class*="blog"], [class*="news"], article').length > 0;
        const isFacebookPage = /facebook\.com|fb\.com/i.test(url);

        // Build analysis object
        // Determine which knowledge file this niche belongs to
        const nicheData = allNicheData[detectedNiche];
        const knowledgeFile = nicheData?.sourceFile || 'overig.md';

        // 🆕 SLIMME BEDRIJFSNAAM EXTRACTIE
        // Haal alleen de bedrijfsnaam uit de title (niet de hele header/slogan)
        const rawTitle = $fresh('title').text().trim();
        const ogSiteName = $fresh('meta[property="og:site_name"]').attr('content')?.trim();
        const firstH1 = $fresh('h1').first().text().trim();

        // Functie om bedrijfsnaam te extraheren uit title
        const extractCompanyName = (title) => {
            if (!title) return null;

            // Veel voorkomende scheidingstekens in website titels
            const separators = [' | ', ' - ', ' – ', ' · ', ' • ', ' :: ', ' » ', ' › '];

            for (const sep of separators) {
                if (title.includes(sep)) {
                    // Neem het EERSTE deel (voor het scheidingsteken) = meestal bedrijfsnaam
                    const parts = title.split(sep);
                    const firstPart = parts[0].trim();

                    // Check dat het geen generieke tekst is
                    const genericStarts = ['home', 'welkom', 'welcome', 'startpagina', 'homepage'];
                    if (firstPart.length > 2 && !genericStarts.some(g => firstPart.toLowerCase().startsWith(g))) {
                        return firstPart;
                    }
                    // Als eerste deel generiek is, probeer tweede deel
                    if (parts.length > 1 && parts[1].trim().length > 2) {
                        return parts[1].trim();
                    }
                }
            }

            // Geen scheidingsteken gevonden, check of titel niet te lang is
            if (title.length <= 40) {
                return title;
            }

            return null;
        };

        // Prioriteit: 1. og:site_name, 2. Geparsde title, 3. H1, 4. Raw title
        let companyName = ogSiteName || extractCompanyName(rawTitle) || firstH1 || rawTitle || 'Geen titel';

        // Extra cleanup: verwijder " - Home", " | Home" etc aan het einde
        companyName = companyName.replace(/\s*[-|·•]\s*(home|welkom|hoofdpagina|homepage)$/i, '').trim();

        console.log(`   🏢 Bedrijfsnaam: "${companyName}" (raw title: "${rawTitle?.slice(0, 50)}...")`);

        const analysis = {
            title: companyName,
            h1: $fresh('h1').first().text().trim() || '',
            niche: detectedNiche,
            nicheConfidence: nicheScore > 10 ? 'hoog' : nicheScore > 5 ? 'medium' : 'laag',
            headings: allHeadings.slice(0, 5),
            services: [...new Set(services)].slice(0, 6),
            slogans: [...new Set(slogans)].slice(0, 3),
            stats: [...new Set(foundStats)].slice(0, 3),
            teamMembers: [...new Set(teamNames)].slice(0, 3),
            city: detectedCity,
            aboutContent,
            hasOpeningHours,
            hasTestimonials,
            hasBlog,
            isFacebookPage,
            usesFacebookAsWebsite: isFacebookPage,
            knowledgeFile, // Which .md file in knowledge/niches/ to consult
            uniqueObservations: [],
            extractedEmails: [...new Set(extractedEmails)] // 🆕 Alle gevonden emails
        };

        // Generate observations
        if (analysis.city) analysis.uniqueObservations.push(`Gevestigd in ${analysis.city}`);
        if (analysis.slogans.length > 0) analysis.uniqueObservations.push(`Slogan: "${analysis.slogans[0]}"`);
        if (analysis.stats.length > 0) analysis.uniqueObservations.push(`Ze noemen: ${analysis.stats[0]}`);
        if (analysis.hasTestimonials) analysis.uniqueObservations.push("Heeft reviews op de site");
        if (analysis.isFacebookPage) analysis.uniqueObservations.push(`🔥 Gebruikt Facebook als website`);

        return analysis;
    } catch (error) {
        return {
            error: `Kon website niet analyseren: ${error.message}`,
            issues: ["Website niet bereikbaar of te traag"]
        };
    }
}
