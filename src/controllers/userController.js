const User = require('../models/user');
const UserMedia = require('../models/userMedia');
const { uploadBufferToR2, deleteObjectFromR2 } = require('../services/r2Service');

const parseArrayField = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

const attachGalleryItems = async (user) => {
  const galleryItems = await UserMedia.find({ owner: user._id })
    .populate('likes', 'username profilePic fullName')
    .populate('comments.user', 'username profilePic fullName')
    .sort({ createdAt: -1 });

  const payload = user.toObject();
  payload.galleryItems = galleryItems;
  payload.gallery = galleryItems.map((item) => item.url);
  return payload;
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

    res.json(await attachGalleryItems(user));
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

    const payload = await attachGalleryItems(user);
    payload.isFollowing = isFollowing;
    res.json(payload);
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
      accountStatus, isOnline, isLive, currentRoom,
      zodiac, zodiacSign, mbti, passions, location
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
    if (zodiacSign || zodiac) user.zodiacSign = zodiacSign || zodiac;
    if (mbti !== undefined) user.mbti = mbti;
    if (passions !== undefined) user.passions = parseArrayField(passions);

    if (location && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      user.location = {
        type: 'Point',
        coordinates: location.coordinates.map((coord) => Number(coord))
      };
    }
    
    if (gallery !== undefined) user.gallery = parseArrayField(gallery);
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

const uploadGalleryImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No gallery files uploaded' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const createdMedia = [];
    for (const file of req.files) {
      const type = file.mimetype.startsWith('video/') ? 'video' : 'image';
      const upload = await uploadBufferToR2(
        file.buffer,
        {
          folder: `profile/${type}s`,
          originalName: file.originalname,
          contentType: file.mimetype
        },
        req
      );

      createdMedia.push(await UserMedia.create({
        owner: user._id,
        url: upload.url,
        downloadUrl: upload.downloadUrl,
        storageKey: upload.key,
        type,
        mimeType: file.mimetype,
        name: file.originalname,
        thumbnail: type === 'video' ? upload.url : '',
        size: file.size
      }));
    }

    const latestGallery = await UserMedia.find({ owner: user._id }).sort({ createdAt: -1 }).limit(12);
    user.gallery = latestGallery.map((item) => item.url);
    await user.save();

    res.json({
      message: 'Gallery updated',
      gallery: user.gallery,
      galleryItems: createdMedia
    });
  } catch (error) {
    res.status(500).json({ message: 'Gallery upload failed: ' + error.message });
  }
};

const deleteGalleryImage = async (req, res) => {
  try {
    const { imageUrl, mediaId } = req.body;
    if (!imageUrl && !mediaId) return res.status(400).json({ message: 'imageUrl or mediaId is required' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const media = await UserMedia.findOne({
      owner: req.user.id,
      ...(mediaId ? { _id: mediaId } : { url: imageUrl })
    });

    if (!media) return res.status(404).json({ message: 'Gallery item not found' });

    await deleteObjectFromR2(media.storageKey).catch(() => null);
    await media.deleteOne();

    const latestGallery = await UserMedia.find({ owner: req.user.id }).sort({ createdAt: -1 }).limit(12);
    user.gallery = latestGallery.map((item) => item.url);
    await user.save();

    res.json({
      message: 'Gallery item removed',
      gallery: user.gallery,
      galleryItems: latestGallery
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggleGalleryLike = async (req, res) => {
  try {
    const media = await UserMedia.findById(req.params.mediaId)
      .populate('likes', 'username profilePic fullName')
      .populate('comments.user', 'username profilePic fullName');
    if (!media) return res.status(404).json({ message: 'Gallery item not found' });

    const liked = media.likes.some((userId) => userId._id?.toString?.() === req.user.id || userId.toString() === req.user.id);
    if (liked) {
      media.likes = media.likes.filter((userId) => (userId._id?.toString?.() || userId.toString()) !== req.user.id);
    } else {
      media.likes.push(req.user.id);
    }
    await media.save();

    res.json(await UserMedia.findById(media._id)
      .populate('likes', 'username profilePic fullName')
      .populate('comments.user', 'username profilePic fullName'));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addGalleryComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Comment text is required' });

    const media = await UserMedia.findById(req.params.mediaId);
    if (!media) return res.status(404).json({ message: 'Gallery item not found' });

    media.comments.push({ user: req.user.id, text: text.trim() });
    await media.save();

    res.status(201).json(await UserMedia.findById(media._id)
      .populate('likes', 'username profilePic fullName')
      .populate('comments.user', 'username profilePic fullName'));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const uploadProfilePic = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const user = await User.findById(req.user.id);
    const upload = await uploadBufferToR2(
      req.file.buffer,
      {
        folder: 'profile/avatar',
        originalName: req.file.originalname,
        contentType: req.file.mimetype
      },
      req
    );
    user.profilePic = upload.url;
    user.cloudinaryId = upload.key;
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
  uploadGalleryImages,
  deleteGalleryImage,
  toggleGalleryLike,
  addGalleryComment,
  getUserById,
  followUser,
  unfollowUser,
  blockUser,
  unblockUser
};
