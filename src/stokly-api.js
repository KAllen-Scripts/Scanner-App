// Browser-compatible version - no require() needed
// Uses Web Crypto API instead of Node.js crypto

let accessToken = null;
let tokenExpirationTime = null;
let tokens = 10;
const maxTokensToHold = 10;
const tokensOverMinute = 120;

let accountKey = null;
let clientId = null;
let secretKey = null;
let environment = 'api.dev.stok.ly';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateSignature(accountKey, clientId, secretKey) {
    try {
        const keyData = new TextEncoder().encode(secretKey);
        const messageData = new TextEncoder().encode(clientId);
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        const hashArray = Array.from(new Uint8Array(signature));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (error) {
        console.error('Error generating signature:', error);
        throw error;
    }
}

async function getAccessToken() {
    try {
        if (!accountKey || !clientId || !secretKey) {
            throw new Error('API credentials not configured. Please set accountKey, clientId, and secretKey.');
        }
        const signature = await generateSignature(accountKey, clientId, secretKey);
        const response = await fetch(`https://${environment}/v1/grant`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                accountkey: accountKey,
                clientId: clientId,
                signature: signature
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        accessToken = data.data.authenticationResult.accessToken;
        const expiryTime = new Date(data.data.authenticationResult.expiry).getTime();
        tokenExpirationTime = expiryTime;
    } catch (error) {
        console.error("Error fetching access token:", error);
        throw error;
    }
}

async function ensureToken() {
    if (accessToken === null || tokenExpirationTime === null || Date.now() >= tokenExpirationTime) {
        await getAccessToken();
    }
}

async function requester(method, url, data, retry = 20) {
    await ensureToken();
    while (tokens <= 0) {
        await sleep(100);
    }
    tokens -= 1;
    const requestOptions = {
        method: method.toUpperCase(),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        }
    };
    if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
        requestOptions.body = JSON.stringify(data);
    }
    try {
        const response = await fetch(url, requestOptions);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        if (retry <= 0) {
            console.error(`HTTP error! Status: ${error.message}`);
            throw error;
        } else {
            await sleep(200);
            await ensureToken();
            return requester(method, url, data, retry - 1);
        }
    }
}

async function loopThrough(url, size, params, filter, callback) {
    let page = 0;
    let count = 0;
    do {
        let res = await requester('get', `${url}?size=${size}&${params}&page=${page}&filter=${filter}`);
        let length = 0;
        try {
            length = res.data.length;
        } catch (error) {
            length = 0;
            console.error('Error processing response data:', error);
        }
        page += 1;
        for (const item of res.data) {
            await callback(item);
            count += 1;
        }
    } while (length >= size);
    return count;
}

async function replenishTokens() {
    do {
        tokens = maxTokensToHold;
        await sleep(60000 / (tokensOverMinute / maxTokensToHold));
    } while (true);
}

async function initializeStoklyAPI(config) {
    accountKey = config.accountKey;
    clientId = config.clientId;
    secretKey = config.secretKey;
    if (config.environment) {
        environment = config.environment;
    }
    replenishTokens();
    try {
        await getAccessToken();
        return true;
    } catch (error) {
        console.error('Failed to initialize API:', error);
        return false;
    }
}

window.stoklyAPI = {
    initializeStoklyAPI,
    requester,
    loopThrough,
    ensureToken,
    getAccessToken
};
