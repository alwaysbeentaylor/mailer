/**
 * Check-Host.net API Integration
 * 
 * Snelle domain validatie VOORDAT we de site volledig analyseren.
 * Dit bespaart tijd en resources door dode links vroeg te filteren.
 */

const CHECK_HOST_BASE = 'https://check-host.net';

// Lokale node (sneller voor Belgische/Nederlandse sites)
const PREFERRED_NODES = ['nl1', 'de1', 'be1', 'fr1'];

/**
 * Start een ping check naar een domein
 * @param {string} host - Het domein om te checken (zonder protocol)
 * @param {number} maxNodes - Max aantal nodes om te gebruiken (default 2 voor snelheid)
 * @returns {Promise<{requestId: string, nodes: object}>}
 */
export async function initiatePing(host, maxNodes = 2) {
    const url = `${CHECK_HOST_BASE}/check-ping?host=${encodeURIComponent(host)}&max_nodes=${maxNodes}`;

    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`Check-host initiate failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok) {
        throw new Error('Check-host returned error status');
    }

    return {
        requestId: data.request_id,
        nodes: data.nodes,
        permanentLink: data.permanent_link
    };
}

/**
 * Haal ping resultaten op (moet even wachten na initiate)
 * @param {string} requestId - Request ID van initiatePing
 * @returns {Promise<object>} - Raw resultaten per node
 */
export async function getResults(requestId) {
    const url = `${CHECK_HOST_BASE}/check-result/${requestId}`;

    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`Check-host results failed: ${response.status}`);
    }

    return await response.json();
}

/**
 * Parse de ruwe resultaten naar een eenvoudige verdict
 * @param {object} rawResults - Resultaten van getResults()
 * @returns {{status: 'alive'|'dead'|'unstable', avgLatency: number|null, successRate: number}}
 */
function parseResults(rawResults) {
    let totalPings = 0;
    let successfulPings = 0;
    let totalLatency = 0;

    for (const [node, results] of Object.entries(rawResults)) {
        // null = node nog bezig
        if (results === null) continue;

        // [[null]] = DNS resolution failed
        if (Array.isArray(results) && results[0] && results[0][0] === null) {
            // DNS failed = dead
            return { status: 'dead', avgLatency: null, successRate: 0 };
        }

        // Parse ping results array
        if (Array.isArray(results) && Array.isArray(results[0])) {
            for (const ping of results[0]) {
                if (!Array.isArray(ping)) continue;

                totalPings++;

                if (ping[0] === 'OK') {
                    successfulPings++;
                    totalLatency += ping[1] * 1000; // Convert to ms
                }
                // TIMEOUT, MALFORMED = failed ping
            }
        }
    }

    // Geen resultaten = nog bezig of gefaald
    if (totalPings === 0) {
        return { status: 'unknown', avgLatency: null, successRate: 0 };
    }

    const successRate = successfulPings / totalPings;
    const avgLatency = successfulPings > 0 ? Math.round(totalLatency / successfulPings) : null;

    // Determine status
    let status;
    if (successRate >= 0.75) {
        status = 'alive';
    } else if (successRate >= 0.25) {
        status = 'unstable';
    } else {
        status = 'dead';
    }

    return { status, avgLatency, successRate: Math.round(successRate * 100) };
}

/**
 * Complete domain validatie - de main functie om te gebruiken
 * 
 * @param {string} domain - Het domein (bijv. "example.com")
 * @param {object} options - Opties
 * @param {number} options.timeout - Max wachttijd in ms (default 5000)
 * @param {number} options.maxNodes - Aantal nodes (default 2)
 * @returns {Promise<{
 *   isValid: boolean,
 *   status: 'alive'|'dead'|'unstable'|'error',
 *   latency: number|null,
 *   successRate: number,
 *   error?: string
 * }>}
 */
export async function validateDomain(domain, options = {}) {
    const { timeout = 5000, maxNodes = 2 } = options;

    // Clean domain (remove protocol if present)
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

    console.log(`🔍 Check-host: Validating ${cleanDomain}...`);

    try {
        // Step 1: Initiate the check
        const { requestId } = await initiatePing(cleanDomain, maxNodes);

        // Step 2: Wait a bit for nodes to respond (they need ~2-3 seconds)
        const pollInterval = 1000;
        const maxPolls = Math.ceil(timeout / pollInterval);

        for (let i = 0; i < maxPolls; i++) {
            // Wait before polling
            await new Promise(resolve => setTimeout(resolve, pollInterval));

            const results = await getResults(requestId);
            const parsed = parseResults(results);

            // Als we genoeg data hebben, return
            if (parsed.status !== 'unknown') {
                console.log(`   ✅ Result: ${parsed.status} (${parsed.avgLatency}ms, ${parsed.successRate}% success)`);
                return {
                    isValid: parsed.status === 'alive' || parsed.status === 'unstable',
                    status: parsed.status,
                    latency: parsed.avgLatency,
                    successRate: parsed.successRate
                };
            }
        }

        // Timeout - geen definitief resultaat
        console.log(`   ⚠️ Check-host timeout, assuming unstable`);
        return {
            isValid: true, // Benefit of the doubt
            status: 'unstable',
            latency: null,
            successRate: 0
        };

    } catch (error) {
        console.error(`   ❌ Check-host error: ${error.message}`);
        return {
            isValid: false,
            status: 'error',
            latency: null,
            successRate: 0,
            error: error.message
        };
    }
}

/**
 * Snelle check - alleen kijken of domein bestaat (DNS resolves)
 * Nog sneller dan full validateDomain, maar minder info
 * 
 * @param {string} domain
 * @returns {Promise<boolean>}
 */
export async function quickCheck(domain) {
    try {
        const result = await validateDomain(domain, { timeout: 3000, maxNodes: 1 });
        return result.isValid;
    } catch {
        return false;
    }
}
