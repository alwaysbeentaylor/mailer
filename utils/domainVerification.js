// Domain Verification using check-host.net API
// Verifies that a domain is reachable before sending emails

/**
 * Extract domain from email address
 */
function getDomainFromEmail(email) {
    if (!email || !email.includes('@')) return null;
    return email.split('@')[1].toLowerCase();
}

/**
 * Extract domain from website URL
 */
function getDomainFromUrl(url) {
    if (!url) return null;
    try {
        // Add protocol if missing
        let fullUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            fullUrl = 'https://' + url;
        }
        const urlObj = new URL(fullUrl);
        return urlObj.hostname.replace('www.', '').toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Verify domain using check-host.net DNS check
 * Returns: { valid: boolean, error?: string, details?: object }
 */
export async function verifyDomain(domain) {
    if (!domain) {
        return { valid: false, error: 'Geen domein opgegeven' };
    }

    try {
        // Step 1: Initiate DNS check
        const checkResponse = await fetch(
            `https://check-host.net/check-dns?host=${encodeURIComponent(domain)}&max_nodes=3`,
            {
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        if (!checkResponse.ok) {
            return { valid: false, error: `Check-host API fout: ${checkResponse.status}` };
        }

        const checkData = await checkResponse.json();

        if (!checkData.ok || !checkData.request_id) {
            return { valid: false, error: 'Ongeldige response van check-host API' };
        }

        // Step 2: Wait a moment for the check to complete
        await new Promise(r => setTimeout(r, 2000));

        // Step 3: Get results
        const resultResponse = await fetch(
            `https://check-host.net/check-result/${checkData.request_id}`,
            {
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        if (!resultResponse.ok) {
            return { valid: false, error: `Resultaat ophalen mislukt: ${resultResponse.status}` };
        }

        const results = await resultResponse.json();

        // Step 4: Analyze results - check if at least one node found valid DNS records
        let hasValidDns = false;
        let nodeResults = [];

        for (const [node, data] of Object.entries(results)) {
            if (data === null) {
                // Still checking
                nodeResults.push({ node, status: 'pending' });
                continue;
            }

            if (Array.isArray(data) && data.length > 0) {
                const dnsData = data[0];
                if (dnsData && (dnsData.A?.length > 0 || dnsData.AAAA?.length > 0)) {
                    hasValidDns = true;
                    nodeResults.push({
                        node,
                        status: 'valid',
                        ipv4: dnsData.A || [],
                        ipv6: dnsData.AAAA || []
                    });
                } else {
                    nodeResults.push({ node, status: 'no_records' });
                }
            }
        }

        return {
            valid: hasValidDns,
            domain,
            error: hasValidDns ? null : 'Domein heeft geen geldige DNS records',
            details: {
                requestId: checkData.request_id,
                nodes: nodeResults
            }
        };

    } catch (error) {
        console.error('Domain verification error:', error);
        return {
            valid: false,
            error: `Verificatie mislukt: ${error.message}`
        };
    }
}

/**
 * Verify domain from email address
 */
export async function verifyEmailDomain(email) {
    const domain = getDomainFromEmail(email);
    if (!domain) {
        return { valid: false, error: 'Ongeldig email adres' };
    }
    return verifyDomain(domain);
}

/**
 * Verify domain from website URL
 */
export async function verifyWebsiteDomain(url) {
    const domain = getDomainFromUrl(url);
    if (!domain) {
        return { valid: false, error: 'Ongeldige website URL' };
    }
    return verifyDomain(domain);
}

/**
 * Quick domain check - just checks if domain resolves (faster, less detailed)
 * Uses simple HTTP check instead of DNS for speed
 */
export async function quickDomainCheck(domain) {
    if (!domain) {
        return { valid: false };
    }

    try {
        // Use HTTP check which is faster
        const checkResponse = await fetch(
            `https://check-host.net/check-http?host=https://${encodeURIComponent(domain)}&max_nodes=1`,
            {
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        if (!checkResponse.ok) {
            return { valid: false };
        }

        const checkData = await checkResponse.json();

        if (!checkData.ok || !checkData.request_id) {
            return { valid: false };
        }

        // Wait briefly
        await new Promise(r => setTimeout(r, 1500));

        // Get result
        const resultResponse = await fetch(
            `https://check-host.net/check-result/${checkData.request_id}`,
            {
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        if (!resultResponse.ok) {
            return { valid: false };
        }

        const results = await resultResponse.json();

        // Check if any node got a response
        for (const [node, data] of Object.entries(results)) {
            if (Array.isArray(data) && data.length > 0 && data[0] !== null) {
                // Got a response (even if it's an error code, the domain exists)
                return { valid: true, domain };
            }
        }

        return { valid: false };

    } catch {
        return { valid: false };
    }
}

export { getDomainFromEmail, getDomainFromUrl };
