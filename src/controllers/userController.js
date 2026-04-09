const axios = require('axios');
const User = require('../models/user');
const UserMedia = require('../models/userMedia');
const { uploadBufferToR2, deleteObjectFromR2 } = require('../services/r2Service');

const SPOTIFY_SEARCH_API_KEY = 'Milik-Bot-OurinMD';

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

const normalizeSpotifyAnthem = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? { title: trimmed, spotifyUrl: '', artist: '', coverUrl: '', previewUrl: '', downloadUrl: '' } : null;
  }

  if (typeof value !== 'object') return null;

  const normalized = {
    title: String(value.title || value.name || '').trim(),
    artist: String(value.artist || value.subtitle || '').trim(),
    album: String(value.album || '').trim(),
    spotifyUrl: String(value.spotifyUrl || value.url || '').trim(),
    coverUrl: String(value.coverUrl || value.thumbnail || value.image || '').trim(),
    previewUrl: String(value.previewUrl || value.audioPreviewUrl || '').trim(),
    downloadUrl: String(value.downloadUrl || value.audioUrl || '').trim(),
    durationLabel: String(value.durationLabel || value.duration || '').trim(),
    durationSeconds: Number(value.durationSeconds || value.durationMs / 1000 || 0),
    popularity: Number(value.popularity || 0),
    source: String(value.source || 'spotify').trim()
  };

  return Object.values(normalized).some((entry) => entry) ? normalized : null;
};

const serializeProfileUser = (entry) => {
  if (!entry) return null;
  const user = entry.toObject ? entry.toObject() : entry;
  return {
    _id: user._id,
    username: user.username || '',
    fullName: user.fullName || '',
    profilePic: user.profilePic || ''
  };
};

const serializeGalleryItem = (item, viewerId, { commentLimit = 8, likeLimit = 12 } = {}) => {
  const payload = item.toObject ? item.toObject() : item;
  const likes = (payload.likes || []).map(serializeProfileUser).filter(Boolean);
  const comments = (payload.comments || []).slice(-commentLimit).map((comment) => ({
    _id: comment._id,
    text: comment.text || '',
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    user: serializeProfileUser(comment.user)
  }));

  return {
    _id: payload._id,
    owner: payload.owner,
    url: payload.url,
    downloadUrl: payload.downloadUrl,
    type: payload.type,
    mimeType: payload.mimeType || '',
    name: payload.name || '',
    caption: payload.caption || '',
    thumbnail: payload.thumbnail || payload.url,
    size: payload.size || 0,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    likes: likes.slice(0, likeLimit),
    comments,
    likesCount: likes.length,
    commentsCount: (payload.comments || []).length,
    hasLiked: likes.some((user) => user?._id?.toString() === viewerId?.toString())
  };
};

const attachGalleryItems = async (user, viewerId, { limit = 18 } = {}) => {
  const galleryItems = await UserMedia.find({ owner: user._id })
    .populate('likes', 'username profilePic fullName')
    .populate('comments.user', 'username profilePic fullName')
    .sort({ createdAt: -1 });

  const payload = user.toObject();
  const serializedItems = galleryItems.slice(0, limit).map((item) => serializeGalleryItem(item, viewerId));
  payload.galleryItems = serializedItems;
  payload.gallery = serializedItems.map((item) => item.url);
  payload.galleryCount = galleryItems.length;
  payload.spotifyAnthem = normalizeSpotifyAnthem(payload.spotifyAnthem);
  return payload;
};

const enrichSpotifySearchResult = async (entry) => {
  const title = String(entry.title || entry.name || '').trim();
  const artist = String(entry.artist || entry.artists || '').trim();
  const searchTerm = [title, artist].filter(Boolean).join(' ').trim() || String(entry.query || '').trim();

  let previewUrl = '';
  let coverUrl = String(entry.thumbnail || entry.image || '').trim();
  let durationSeconds = 0;
  let resolvedArtist = artist;
  try {
    if (searchTerm) {
      const response = await axios.get('https://itunes.apple.com/search', {
        params: {
          term: searchTerm,
          media: 'music',
          limit: 1
        },
        timeout: 12000
      });
      const match = response.data?.results?.[0];
      if (match) {
        previewUrl = match.previewUrl || '';
        coverUrl = coverUrl || match.artworkUrl100 || '';
        durationSeconds = Math.round((match.trackTimeMillis || 0) / 1000);
        resolvedArtist = resolvedArtist || match.artistName || '';
      }
    }
  } catch (_) {}

  return {
    title,
    artist: resolvedArtist,
    spotifyUrl: String(entry.url || entry.spotifyUrl || '').trim(),
    coverUrl,
    previewUrl,
    downloadUrl: previewUrl,
    durationLabel: String(entry.duration || '').trim(),
    durationSeconds,
    popularity: Number(entry.popularity || 0),
    source: 'spotify'
  };
};

const getMyGallery = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit || '18', 10)));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      UserMedia.find({ owner: req.user.id })
        .populate('likes', 'username profilePic fullName')
        .populate('comments.user', 'username profilePic fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      UserMedia.countDocuments({ owner: req.user.id })
    ]);

    res.json({
      items: items.map((item) => serializeGalleryItem(item, req.user.id)),
      page,
      limit,
      total,
      hasMore: skip + items.length < total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getGalleryItemDetail = async (req, res) => {
  try {
    const media = await UserMedia.findById(req.params.mediaId)
      .populate('likes', 'username profilePic fullName')
      .populate('comments.user', 'username profilePic fullName');
    if (!media) return res.status(404).json({ message: 'Gallery item not found' });

    res.json(serializeGalleryItem(media, req.user.id, { commentLimit: 100, likeLimit: 50 }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const searchSpotify = async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ message: 'Search query is required' });

    const response = await axios.get('https://api.neoxr.eu/api/spotify-search', {
      params: {
        q: query,
        apikey: SPOTIFY_SEARCH_API_KEY
      },
      timeout: 15000
    });

    const list = Array.isArray(response.data?.data) ? response.data.data.slice(0, 8) : [];
    const items = await Promise.all(list.map((entry) => enrichSpotifySearchResult(entry)));
    res.json({ items });
  } catch (error) {
    const message = error.response?.data?.message || error.message || 'Spotify search failed';
    res.status(500).json({ message });
  }
};

const resolveSpotifyAnthem = async (req, res) => {
  try {
    const normalized = normalizeSpotifyAnthem(req.body || {});
    if (!normalized) return res.status(400).json({ message: 'Spotify anthem data is required' });

    const [title, artist] = [normalized.title, normalized.artist].filter(Boolean);
    const searchTerm = [title, artist].filter(Boolean).join(' ').trim();
    if (searchTerm && (!normalized.previewUrl || !normalized.coverUrl)) {
      try {
        const response = await axios.get('https://itunes.apple.com/search', {
          params: {
            term: searchTerm,
            media: 'music',
            limit: 1
          },
          timeout: 12000
        });
        const match = response.data?.results?.[0];
        if (match) {
          normalized.previewUrl = normalized.previewUrl || match.previewUrl || '';
          normalized.downloadUrl = normalized.downloadUrl || match.previewUrl || '';
          normalized.coverUrl = normalized.coverUrl || match.artworkUrl100 || '';
          normalized.artist = normalized.artist || match.artistName || '';
          normalized.durationSeconds = normalized.durationSeconds || Math.round((match.trackTimeMillis || 0) / 1000);
          normalized.durationLabel = normalized.durationLabel || (normalized.durationSeconds
            ? `${Math.floor(normalized.durationSeconds / 60)}:${String(normalized.durationSeconds % 60).padStart(2, '0')}`
            : '');
        }
      } catch (_) {}
    }

    res.json(normalized);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
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

    res.json(await attachGalleryItems(user, req.user.id));
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

    const payload = await attachGalleryItems(user, req.user.id);
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

    if (fullName !== undefined) user.fullName = fullName;
    if (bio !== undefined) user.bio = bio;
    if (birthDate !== undefined) user.birthDate = birthDate || null;
    if (gender !== undefined) user.gender = gender || undefined;
    if (interestedIn !== undefined) user.interestedIn = interestedIn || undefined;
    if (height !== undefined) user.height = height || null;
    if (education !== undefined) user.education = education;
    if (religion !== undefined) user.religion = religion;
    if (smoking !== undefined) user.smoking = smoking || undefined;
    if (relationshipIntent !== undefined) user.relationshipIntent = relationshipIntent || undefined;
    if (zodiacSign !== undefined || zodiac !== undefined) user.zodiacSign = zodiacSign || zodiac || '';
    if (mbti !== undefined) user.mbti = mbti;
    if (passions !== undefined) user.passions = parseArrayField(passions);

    if (location && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      user.location = {
        type: 'Point',
        coordinates: location.coordinates.map((coord) => Number(coord))
      };
    }
    
    if (gallery !== undefined) user.gallery = parseArrayField(gallery);
    if (voiceBio !== undefined) user.voiceBio = voiceBio;
    if (videoBio !== undefined) user.videoBio = videoBio;
    if (instagramHandle !== undefined) user.instagramHandle = instagramHandle;
    if (spotifyAnthem !== undefined) user.spotifyAnthem = normalizeSpotifyAnthem(spotifyAnthem);
    
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
    
    res.json(await attachGalleryItems(updatedUser, req.user.id));
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
      galleryItems: createdMedia.map((item) => serializeGalleryItem(item, req.user.id))
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
      galleryItems: latestGallery.map((item) => serializeGalleryItem(item, req.user.id))
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

    const updated = await UserMedia.findById(media._id)
      .populate('likes', 'username profilePic fullName')
      .populate('comments.user', 'username profilePic fullName');
    res.json(serializeGalleryItem(updated, req.user.id, { commentLimit: 100, likeLimit: 50 }));
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

    const updated = await UserMedia.findById(media._id)
      .populate('likes', 'username profilePic fullName')
      .populate('comments.user', 'username profilePic fullName');
    res.status(201).json(serializeGalleryItem(updated, req.user.id, { commentLimit: 100, likeLimit: 50 }));
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
  getMyGallery,
  getGalleryItemDetail,
  searchSpotify,
  resolveSpotifyAnthem,
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
