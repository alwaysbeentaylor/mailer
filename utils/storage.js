
import fs from 'fs';
import path from 'path';

// Check if we are in Vercel environment
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const DATA_DIR = path.join(process.cwd(), 'data');
const LOCAL_STORE_FILE = path.join(DATA_DIR, 'kv-store.json');

// Ensure data dir exists locally
if (!isVercel && !fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
        console.error('Storage: Failed to create data directory', e);
    }
}

let kvClient = null;

// Helper to get KV client
async function getClient() {
    // Only try to load KV if configured
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        if (!kvClient) {
            try {
                const { kv } = await import('@vercel/kv');
                // Optional: Ping to verify connection?
                // await kv.ping(); 
                kvClient = kv;
            } catch (e) {
                console.warn('Storage: KV configured but failed to load:', e.message);
                return null;
            }
        }
        return kvClient;
    }
    return null;
}

// Read from local JSON file
function getLocalData() {
    try {
        if (fs.existsSync(LOCAL_STORE_FILE)) {
            const fileContent = fs.readFileSync(LOCAL_STORE_FILE, 'utf8');
            return JSON.parse(fileContent);
        }
    } catch (e) {
        console.error('Storage: Error reading local store:', e);
    }
    return {};
}

// Save to local JSON file
function saveLocalData(data) {
    try {
        fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Storage: Error writing local store:', e);
    }
}

/**
 * Unified Storage Utility (KV or Local JSON)
 */
export const storage = {
    async get(key) {
        const client = await getClient();
        if (client) {
            return await client.get(key);
        } else {
            const data = getLocalData();
            return data[key] || null;
        }
    },

    async set(key, value) {
        const client = await getClient();
        if (client) {
            await client.set(key, value);
        } else {
            const data = getLocalData();
            data[key] = value;
            saveLocalData(data);
        }
    },

    async del(key) {
        const client = await getClient();
        if (client) {
            await client.del(key);
        } else {
            const data = getLocalData();
            if (key in data) {
                delete data[key];
                saveLocalData(data);
            }
        }
    }
};
