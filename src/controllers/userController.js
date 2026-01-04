const User = require('../models/user');
const cloudinary = require('cloudinary').v2;

const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

const getAllUsers = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const blockedIds = currentUser.blockedUsers || [];

    const keyword = req.query.search
      ? {
          $or: [
            { username: { $regex: req.query.search, $options: 'i' } },
            { fullName: { $regex: req.query.search, $options: 'i' } },
          ],
        }
      : {};

    const users = await User.find(keyword)
      .find({ 
        _id: { 
          $ne: req.user.id,
          $nin: blockedIds 
        },
        accountStatus: 'Active' 
      })
      .select('username fullName profilePic email isOnline');

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
      .populate('following', 'username profilePic fullName')
      .populate('profileVisitors.visitor', 'username profilePic fullName')
      .populate('blockedUsers', 'username profilePic')
      .populate('currentRoom', 'title');

    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.isOnline = true;
    user.lastActive = new Date();
    await user.save();

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
      .populate('following', 'username profilePic')
      .populate('currentRoom', 'title');

    if (!user) return res.status(404).json({ message: 'User not found' });

    if (req.user.id !== req.params.id) {
      const hasVisitedToday = user.profileVisitors.some(
        (v) => v.visitor.toString() === req.user.id && isToday(v.visitedAt)
      );

      if (!hasVisitedToday) {
        await User.findByIdAndUpdate(req.params.id, {
          $push: { 
            profileVisitors: { 
              visitor: req.user.id,
              visitedAt: new Date()
            } 
          }
        });
      }
    }

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
    const { 
      fullName, bio, birthDate, gender, interestedIn, height, 
      education, religion, smoking, relationshipIntent,
      fcmToken, darkMode, notificationSettings,
      gallery, voiceBio, videoBio, instagramHandle, spotifyAnthem,
      accountStatus, isOnline, isLive, currentRoom
    } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (fullName) user.fullName = fullName;
    if (bio) user.bio = bio;
    if (birthDate) user.birthDate = birthDate;
    if (gender) user.gender = gender;
    if (interestedIn) user.interestedIn = interestedIn;
    if (height) user.height = height;
    if (education) user.education = education;
    if (religion) user.religion = religion;
    if (smoking) user.smoking = smoking;
    if (relationshipIntent) user.relationshipIntent = relationshipIntent;
    
    if (gallery) user.gallery = gallery;
    if (voiceBio) user.voiceBio = voiceBio;
    if (videoBio) user.videoBio = videoBio;
    if (instagramHandle) user.instagramHandle = instagramHandle;
    if (spotifyAnthem) user.spotifyAnthem = spotifyAnthem;
    
    if (accountStatus) user.accountStatus = accountStatus;
    if (isOnline !== undefined) user.isOnline = isOnline;
    if (isLive !== undefined) user.isLive = isLive;
    if (currentRoom !== undefined) user.currentRoom = currentRoom;

    if (fcmToken) user.fcmToken = fcmToken;
    if (darkMode !== undefined) user.darkMode = darkMode;
    if (notificationSettings) {
      user.notificationSettings = { ...user.notificationSettings, ...notificationSettings };
    }

    const updatedUser = await user.save();

    if (!isToday(updatedUser.missionProgress.profileUpdated.lastClaim)) {
        updatedUser.missionProgress.profileUpdated.lastClaim = new Date();
        updatedUser.coins += 50;
        await updatedUser.save();
    }
    
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const uploadProfilePic = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const user = await User.findById(req.user.id);
    if (user.cloudinaryId) {
      cloudinary.uploader.destroy(user.cloudinaryId).catch(err => console.log(err));
    }
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

const blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.id === id) return res.status(400).json({ message: "Cannot block yourself" });

    const currentUser = await User.findById(req.user.id);
    if (!currentUser.blockedUsers.includes(id)) {
      currentUser.blockedUsers.push(id);
      
      currentUser.following = currentUser.following.filter(uid => uid.toString() !== id);
      currentUser.followers = currentUser.followers.filter(uid => uid.toString() !== id);
      
      await currentUser.save();
      
      await User.findByIdAndUpdate(id, {
        $pull: { followers: req.user.id, following: req.user.id }
      });
    }
    res.json({ message: "User blocked" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const unblockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await User.findById(req.user.id);
    
    currentUser.blockedUsers = currentUser.blockedUsers.filter(uid => uid.toString() !== id);
    await currentUser.save();
    
    res.json({ message: "User unblocked" });
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
  unfollowUser,
  blockUser,
  unblockUser
};