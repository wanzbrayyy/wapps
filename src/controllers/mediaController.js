const { decodeMediaKey, streamObjectFromR2 } = require('../services/r2Service');

const streamMedia = async (req, res) => {
  try {
    const key = decodeMediaKey(req.params.encodedKey);
    const response = await streamObjectFromR2(key);

    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const contentLength = response.headers['content-length'];
    const fileName = key.split('/').pop() || 'download';

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    }

    response.data.pipe(res);
  } catch (error) {
    res.status(404).json({ message: 'Media not found' });
  }
};

module.exports = {
  streamMedia
};
