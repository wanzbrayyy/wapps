const express = require('express');
const { streamMedia } = require('../controllers/mediaController');

const router = express.Router();

router.get('/:encodedKey', streamMedia);

module.exports = router;
