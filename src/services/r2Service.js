const axios = require('axios');
const crypto = require('crypto');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'ec786e5c4cd0818807637b34da897d76';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'wanzofc';
const R2_REGION = process.env.R2_REGION || 'auto';
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const R2_HOST = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_ENDPOINT = `https://${R2_HOST}`;

const assertR2Config = () => {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error('R2 configuration is incomplete');
  }
};

const hashSha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value, encoding) => crypto.createHmac('sha256', key).update(value).digest(encoding);

const getAmzDateParts = () => {
  const now = new Date();
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
};

const getSigningKey = (dateStamp) => {
  const kDate = hmac(`AWS4${R2_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, R2_REGION);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
};

const encodePathSegment = (value = '') => encodeURIComponent(value).replace(/%2F/g, '/');
const encodeQueryComponent = (value = '') => encodeURIComponent(value)
  .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const buildPresignedUrl = ({
  method,
  key,
  expiresIn = 300
}) => {
  assertR2Config();
  const { amzDate, dateStamp } = getAmzDateParts();
  const canonicalUri = `/${R2_BUCKET_NAME}/${key.split('/').map(encodePathSegment).join('/')}`;
  const credentialScope = `${dateStamp}/${R2_REGION}/s3/aws4_request`;
  const signedHeaders = 'host';
  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${R2_ACCESS_KEY_ID}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': signedHeaders
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((keyName) => `${encodeQueryComponent(keyName)}=${encodeQueryComponent(queryParams[keyName])}`)
    .join('&');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    `host:${R2_HOST}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashSha256Hex(canonicalRequest)
  ].join('\n');

  const signature = hmac(getSigningKey(dateStamp), stringToSign, 'hex');
  return `${R2_ENDPOINT}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
};

const buildStorageKey = (folder, originalName = 'file.bin') => {
  const sanitized = originalName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${sanitized || 'file.bin'}`;
};

const encodeMediaKey = (key) => Buffer.from(key).toString('base64url');
const decodeMediaKey = (encoded) => Buffer.from(encoded, 'base64url').toString('utf8');

const buildMediaProxyUrl = (req, key, download = false) => {
  if (R2_PUBLIC_BASE_URL) {
    return `${R2_PUBLIC_BASE_URL}/${key.split('/').map(encodePathSegment).join('/')}`;
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host');
  return `${protocol}://${host}/api/media/${encodeMediaKey(key)}${download ? '?download=1' : ''}`;
};

const uploadBufferToR2 = async (buffer, { folder, originalName, contentType }, req = null) => {
  const key = buildStorageKey(folder, originalName);
  const url = buildPresignedUrl({
    method: 'PUT',
    key
  });

  await axios.put(url, buffer, {
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD'
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 30000
  });

  return {
    key,
    url: req ? buildMediaProxyUrl(req, key) : key,
    downloadUrl: req ? buildMediaProxyUrl(req, key, true) : key
  };
};

const streamObjectFromR2 = async (key) => {
  const url = buildPresignedUrl({
    method: 'GET',
    key
  });

  return axios.get(url, {
    responseType: 'stream',
    timeout: 30000
  });
};

const deleteObjectFromR2 = async (key) => {
  const url = buildPresignedUrl({
    method: 'DELETE',
    key
  });

  await axios.delete(url, { timeout: 30000 });
};

module.exports = {
  uploadBufferToR2,
  streamObjectFromR2,
  deleteObjectFromR2,
  encodeMediaKey,
  decodeMediaKey,
  buildMediaProxyUrl
};
