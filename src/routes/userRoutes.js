const express = require('express');
const router = express.Router();
const { 
  getProfile, 
  updateProfile, 
  uploadProfilePic,
  getUserById 
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.post('/upload-profile-pic', protect, upload.single('profilePic'), uploadProfilePic);
router.get('/:id', protect, getUserById);

module.exports = router;