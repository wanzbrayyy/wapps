const User = require('../models/user');
const cloudinary = require('cloudinary').v2; 

const getAllUsers = async (req, res) => {
  try {
    const keyword = req.query.search
      ? {
          $or: [
            { username: { $regex: req.query.search, $options: 'i' } },
            { fullName: { $regex: req.query.search, $options: 'i' } },
          ],
        }
      : {};

    const users = await User.find(keyword)
      .find({ _id: { $ne: req.user.id } })
      .select('username fullName profilePic email');

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('followers', 'username profilePic fullName')
      .populate('following', 'username profilePic fullName');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .populate('followers', 'username profilePic')
      .populate('following', 'username profilePic');

    if (!user) return res.status(404).json({ message: 'User not found' });

    const isFollowing = user.followers.some(
      (follower) => follower._id.toString() === req.user.id
    );

    res.json({ ...user.toObject(), isFollowing });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { fullName, bio, birthDate, gender, interestedIn, location, zodiac, mbti } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.fullName = fullName || user.fullName;
    user.bio = bio || user.bio;
    user.birthDate = birthDate || user.birthDate;
    user.gender = gender || user.gender;
    user.interestedIn = interestedIn || user.interestedIn;
    user.zodiac = zodiac || user.zodiac;
    user.mbti = mbti || user.mbti;

    if (location && location.coordinates) {
      user.location = {
        type: 'Point',
        coordinates: location.coordinates
      };
    }

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const uploadProfilePic = async (req, res) => {
  try {
    // Dengan multer-storage-cloudinary, req.file sudah berisi info file dari Cloudinary
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const user = await User.findById(req.user.id);
    
    // Hapus foto lama di Cloudinary jika ada
    if (user.cloudinaryId) {
      // Hapus di background, tidak perlu await agar respon cepat
      cloudinary.uploader.destroy(user.cloudinaryId).catch(err => console.log(err));
    }

    // req.file.path = URL gambar di Cloudinary
    // req.file.filename = Public ID di Cloudinary
    user.profilePic = req.file.path;
    user.cloudinaryId = req.file.filename;
    await user.save();

    res.json({ profilePic: user.profilePic });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed: ' + error.message });
  }
};

const followUser = async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToFollow || !currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!userToFollow.followers.includes(req.user.id)) {
      await userToFollow.updateOne({ $push: { followers: req.user.id } });
      await currentUser.updateOne({ $push: { following: req.params.id } });
      res.status(200).json({ message: "User followed" });
    } else {
      res.status(400).json({ message: "You already follow this user" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const unfollowUser = async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: "You cannot unfollow yourself" });
    }

    const userToUnfollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToUnfollow || !currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (userToUnfollow.followers.includes(req.user.id)) {
      await userToUnfollow.updateOne({ $pull: { followers: req.user.id } });
      await currentUser.updateOne({ $pull: { following: req.params.id } });
      res.status(200).json({ message: "User unfollowed" });
    } else {
      res.status(400).json({ message: "You are not following this user" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllUsers,
  getProfile,
  updateProfile,
  uploadProfilePic,
  getUserById,
  followUser,
  unfollowUser
};