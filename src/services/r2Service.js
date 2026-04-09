const axios = require('axios');
const crypto = require('crypto');

const R2_ACCOUNT_ID = 'ec786e5c4cd0818807637b34da897d76';
const R2_ACCESS_KEY_ID = 'b5d206db32cd483575bb7b5c45a1004c';
const R2_SECRET_ACCESS_KEY = 'e6ac7126a347d1bc27553a47665d9abed6b2c4fbc10a1623cda43f3b27473af3';
const R2_BUCKET_NAME = 'wanzofc';
const R2_REGION = 'auto';
const R2_HOST = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_ENDPOINT = `https://${R2_HOST}`;

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

const buildSignedRequest = ({
  method,
  key,
  payload = Buffer.alloc(0),
  contentType = 'application/octet-stream',
  extraHeaders = {},
  queryString = ''
}) => {
  const { amzDate, dateStamp } = getAmzDateParts();
  const canonicalUri = `/${R2_BUCKET_NAME}/${key.split('/').map(encodePathSegment).join('/')}`;
  const payloadHash = hashSha256Hex(payload);
  const headers = {
    host: R2_HOST,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders
  };

  if (contentType) {
    headers['content-type'] = contentType;
  }

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((header) => `${header}:${String(headers[header]).trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalRequest = [
    method,
    canonicalUri,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${R2_REGION}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashSha256Hex(canonicalRequest)
  ].join('\n');

  const signature = hmac(getSigningKey(dateStamp), stringToSign, 'hex');
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(', ');

  return {
    url: `${R2_ENDPOINT}${canonicalUri}${queryString ? `?${queryString}` : ''}`,
    headers: {
      ...headers,
      Authorization: authorization
    }
  };
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
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host');
  return `${protocol}://${host}/api/media/${encodeMediaKey(key)}${download ? '?download=1' : ''}`;
};

const uploadBufferToR2 = async (buffer, { folder, originalName, contentType }, req = null) => {
  const key = buildStorageKey(folder, originalName);
  const { url, headers } = buildSignedRequest({
    method: 'PUT',
    key,
    payload: buffer,
    contentType
  });

  await axios.put(url, buffer, {
    headers,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  return {
    key,
    url: req ? buildMediaProxyUrl(req, key) : key,
    downloadUrl: req ? buildMediaProxyUrl(req, key, true) : key
  };
};

const streamObjectFromR2 = async (key) => {
  const { url, headers } = buildSignedRequest({
    method: 'GET',
    key,
    payload: '',
    contentType: ''
  });

  return axios.get(url, {
    headers,
    responseType: 'stream'
  });
};

const deleteObjectFromR2 = async (key) => {
  const { url, headers } = buildSignedRequest({
    method: 'DELETE',
    key,
    payload: '',
    contentType: ''
  });

  await axios.delete(url, { headers });
};

module.exports = {
  uploadBufferToR2,
  streamObjectFromR2,
  deleteObjectFromR2,
  encodeMediaKey,
  decodeMediaKey,
  buildMediaProxyUrl
};
