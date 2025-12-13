// API Endpoint: SMTP Accounts CRUD
// Slaat SMTP accounts op in Vercel KV (of localStorage fallback)

// Simple in-memory fallback for development (will be replaced by KV in production)
let memoryStore = {};

// Helper to get KV client (if available)
async function getKV() {
    try {
        // Try to import Vercel KV
        const { kv } = await import('@vercel/kv');
        return kv;
    } catch (e) {
        return null;
    }
}

export default async function handler(req, res) {
    const kv = await getKV();
    const KV_KEY = 'smtp_accounts';

    // GET - Lijst alle SMTP accounts
    if (req.method === 'GET') {
        try {
            let accounts = [];

            if (kv) {
                accounts = await kv.get(KV_KEY) || [];
            } else {
                accounts = memoryStore[KV_KEY] || [];
            }

            // Strip passwords voor veiligheid (alleen voor listing)
            const safeAccounts = accounts.map(acc => ({
                ...acc,
                pass: acc.pass ? '••••••••' : ''
            }));

            return res.status(200).json({
                success: true,
                accounts: safeAccounts,
                source: kv ? 'kv' : 'memory'
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // POST - Nieuw account toevoegen of bestaand updaten
    if (req.method === 'POST') {
        try {
            const { id, name, host, port, user, pass, fromName, active = true } = req.body;

            if (!host || !user || !pass) {
                return res.status(400).json({
                    success: false,
                    error: 'host, user en pass zijn verplicht'
                });
            }

            let accounts = [];
            if (kv) {
                accounts = await kv.get(KV_KEY) || [];
            } else {
                accounts = memoryStore[KV_KEY] || [];
            }

            const accountData = {
                id: id || `smtp_${Date.now()}`,
                name: name || host,
                host,
                port: port || '587',
                user,
                pass, // Encrypted storage zou beter zijn in productie
                fromName: fromName || '',
                active,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Check of we updaten of toevoegen
            const existingIndex = accounts.findIndex(a => a.id === id);
            if (existingIndex >= 0) {
                // Update - behoud createdAt
                accountData.createdAt = accounts[existingIndex].createdAt;
                accounts[existingIndex] = accountData;
            } else {
                accounts.push(accountData);
            }

            // Sla op
            if (kv) {
                await kv.set(KV_KEY, accounts);
            } else {
                memoryStore[KV_KEY] = accounts;
            }

            return res.status(200).json({
                success: true,
                account: { ...accountData, pass: '••••••••' },
                message: existingIndex >= 0 ? 'Account bijgewerkt' : 'Account toegevoegd'
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // DELETE - Account verwijderen
    if (req.method === 'DELETE') {
        try {
            const { id } = req.body;

            if (!id) {
                return res.status(400).json({ success: false, error: 'id is verplicht' });
            }

            let accounts = [];
            if (kv) {
                accounts = await kv.get(KV_KEY) || [];
            } else {
                accounts = memoryStore[KV_KEY] || [];
            }

            const newAccounts = accounts.filter(a => a.id !== id);

            if (newAccounts.length === accounts.length) {
                return res.status(404).json({ success: false, error: 'Account niet gevonden' });
            }

            if (kv) {
                await kv.set(KV_KEY, newAccounts);
            } else {
                memoryStore[KV_KEY] = newAccounts;
            }

            return res.status(200).json({ success: true, message: 'Account verwijderd' });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
