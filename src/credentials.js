const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CRED_FILE = path.join(app.getPath('userData'), 'credentials.json');
const ALGO = 'aes-256-gcm';

function getMachineKey() {
  // Use machine-specific info for key
  const hostname = require('os').hostname();
  const user = process.env.USERNAME || process.env.USER || '';
  return crypto.createHash('sha256').update(hostname + user).digest();
}

function encryptCredentials(data) {
  const key = getMachineKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted
  };
}

function decryptCredentials(enc) {
  const key = getMachineKey();
  const iv = Buffer.from(enc.iv, 'hex');
  const tag = Buffer.from(enc.tag, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(enc.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

function saveCredentials(apiKey, apiSecret, accountKey) {
  const encrypted = encryptCredentials({ apiKey, apiSecret, accountKey });
  fs.writeFileSync(CRED_FILE, JSON.stringify(encrypted));
}

function loadCredentials() {
  if (!fs.existsSync(CRED_FILE)) return { apiKey: '', apiSecret: '', accountKey: '' };
  const enc = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
  try {
    return decryptCredentials(enc);
  } catch {
    return { apiKey: '', apiSecret: '', accountKey: '' };
  }
}

module.exports = { saveCredentials, loadCredentials };
