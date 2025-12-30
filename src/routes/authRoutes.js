const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  checkUsername, 
  checkEmail, 
  forgotPassword, 
  resetPassword,
  verifyPassword
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/check-username', checkUsername);
router.post('/check-email', checkEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-password', protect, verifyPassword);

module.exports = router;