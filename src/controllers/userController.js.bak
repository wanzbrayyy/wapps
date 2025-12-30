const User = require('../models/user');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.fullName = req.body.fullName || user.fullName;
    user.bio = req.body.bio || user.bio;
    
    if (req.body.username && req.body.username !== user.username) {
        const exists = await User.findOne({ username: req.body.username });
        if(exists) return res.status(400).json({ message: "Username already taken"});
        user.username = req.body.username;
    }

    const updatedUser = await user.save();
    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      fullName: updatedUser.fullName,
      bio: updatedUser.bio,
      profilePic: updatedUser.profilePic
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const uploadProfilePic = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const user = await User.findById(req.user.id);
    
    if (user.cloudinaryId) {
      await cloudinary.uploader.destroy(user.cloudinaryId);
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: process.env.CLOUDINARY_UPLOAD_FOLDER,
    });

    user.profilePic = result.secure_url;
    user.cloudinaryId = result.public_id;
    await user.save();
    
    // Hapus file lokal setelah upload (jika menggunakan diskStorage)
    if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
    }

    res.json({ profilePic: user.profilePic });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -resetPasswordToken -resetPasswordExpire');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadProfilePic,
  getUserById
};