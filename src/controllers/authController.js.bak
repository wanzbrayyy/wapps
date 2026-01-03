const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/email');
const { OAuth2Client } = require('google-auth-library');

// Client ID sesuai dengan yang ada di Flutter
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '806236381654-kb856qoncitnmup2jav2vfe9gedqi8sp.apps.googleusercontent.com');

const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

const register = async (req, res) => {
  try {
    const { username, fullName, email, password } = req.body;
    
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'Username or Email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      username,
      fullName,
      email,
      password: hashedPassword
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      token
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
      
      if (user.missionProgress && !isToday(user.missionProgress.lastLoginClaim)) {
        user.coins += 50;
        user.missionProgress.lastLoginClaim = new Date();
        await user.save();
      }
      
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        token,
        coins: user.coins
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID || '806236381654-kb856qoncitnmup2jav2vfe9gedqi8sp.apps.googleusercontent.com',
    });

    const { email, name, picture } = ticket.getPayload();

    let user = await User.findOne({ email });

    if (!user) {
      const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(generatedPassword, salt);
      
      const generatedUsername = email.split('@')[0] + Math.floor(Math.random() * 1000);

      user = await User.create({
        username: generatedUsername,
        fullName: name,
        email,
        password: hashedPassword,
        profilePic: picture
      });
    }

    if (user.missionProgress && !isToday(user.missionProgress.lastLoginClaim)) {
      user.coins += 50;
      user.missionProgress.lastLoginClaim = new Date();
      await user.save();
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePic: user.profilePic,
      token,
      coins: user.coins
    });

  } catch (error) {
    res.status(500).json({ message: "Google Login Failed: " + error.message });
  }
};

const checkUsername = async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    res.json({ exists: !!user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const checkEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    res.json({ exists: !!user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const otp = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const salt = await bcrypt.genSalt(10);
    user.resetPasswordToken = await bcrypt.hash(otp, salt);
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    try {
      await sendEmail({
        email: user.email,
        otp: otp, 
        subject: 'W Apps Password Reset Code'
      });
      res.status(200).json({ message: 'OTP sent to email' });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      return res.status(500).json({ message: 'Email could not be sent' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    const user = await User.findOne({ email, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or expired OTP' });
    }

    const isMatch = await bcrypt.compare(otp, user.resetPasswordToken);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid OTP code' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const verifyPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(password, user.password);
    res.json({ valid: isMatch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  register,
  login,
  googleLogin,
  checkUsername,
  checkEmail,
  forgotPassword,
  resetPassword,
  verifyPassword
};