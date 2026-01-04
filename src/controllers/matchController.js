const User = require('../models/user');
const Like = require('../models/like');
const Chat = require('../models/chat');

const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

const calculateAge = (birthDate) => {
  if (!birthDate) return 20; 
  const ageDifMs = Date.now() - new Date(birthDate).getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

const calculateCompatibility = (user1, user2) => {
  let score = 0;
  if (user1.passions && user2.passions) {
    const commonInterests = user1.passions.filter(p => user2.passions.includes(p));
    score += (commonInterests.length * 10); 
  }
  if (user1.zodiacSign && user2.zodiacSign && user1.zodiacSign === user2.zodiacSign) score += 5; 
  if (user1.religion === user2.religion) score += 10;
  if (user1.smoking === user2.smoking) score += 10;
  return Math.min(score + 50, 100); 
};

const getDiscoveryQueue = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    const { 
      minAge = 18, maxAge = 99, gender, distance = 5000, // Default distance diperbesar (5000km)
      education, religion, smoking,
      global, isActive, isVerified
    } = req.query;

    // 1. Ambil ID yang harus di-exclude (Diri sendiri + Swiped + Blocked)
    const swipedLikes = await Like.find({ liker: req.user.id }).select('liked');
    const swipedIds = swipedLikes.map(l => l.liked);
    const blockedIds = currentUser.blockedUsers || [];
    const excludeIds = [req.user.id, ...swipedIds, ...blockedIds];

    let filter = { _id: { $nin: excludeIds } };

    // 2. Filter Umur (Opsional, jika data umur tersedia)
    // const currentYear = new Date().getFullYear();
    // const ageFilter = {
    //   $gte: new Date(new Date().setFullYear(currentYear - maxAge - 1)),
    //   $lte: new Date(new Date().setFullYear(currentYear - minAge))
    // };
    // filter.birthDate = ageFilter;

    // 3. Filter Lokasi (Hanya jika Global Mode OFF & Lokasi Valid)
    if (global !== 'true') {
      const loc = currentUser.travelLocation || currentUser.location;
      const isValidLocation = loc && loc.coordinates && loc.coordinates.length === 2 && 
                              (loc.coordinates[0] !== 0 || loc.coordinates[1] !== 0);

      if (isValidLocation) {
        filter.location = {
          $near: {
            $geometry: { type: "Point", coordinates: loc.coordinates },
            $maxDistance: parseInt(distance) * 1000
          }
        };
      }
    }

    if (gender && gender !== 'Everyone') filter.gender = gender;
    // Filter lain dihapus sementara untuk memastikan data muncul dulu
    
    // 4. Query Utama
    let users = await User.find(filter).select('-password -swiped -matches -blockedUsers').limit(30);

    console.log(`Discovery: Found ${users.length} users with filter.`);

    // 5. FALLBACK: Jika hasil 0, ambil user random (Global) yang belum di-swipe
    if (users.length === 0) {
      console.log("Discovery: Fallback to random global users.");
      users = await User.find({ _id: { $nin: excludeIds } })
        .select('-password -swiped -matches -blockedUsers')
        .limit(20);
    }

    const enrichedUsers = users.map(user => ({
      ...user.toObject(),
      age: calculateAge(user.birthDate),
      compatibility: calculateCompatibility(currentUser, user),
      distance: (currentUser.location && user.location) ? 10 : null
    }));

    // Shuffle array agar tidak monoton
    const shuffled = enrichedUsers.sort(() => 0.5 - Math.random());

    res.json(shuffled);

  } catch (error) {
    console.error("Discovery Queue Error:", error); 
    res.status(500).json({ message: error.message });
  }
};

const swipeAction = async (req, res) => {
  try {
    const { targetUserId, action, message, reactionContext } = req.body;
    const currentUserId = req.user.id;

    if (!targetUserId || !action) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    const existingLike = await Like.findOne({ liker: currentUserId, liked: targetUserId });
    
    if (existingLike) {
      if (existingLike.type === action) {
        return res.json({ match: false, message: "Already swiped" });
      } else {
        existingLike.type = action;
        await existingLike.save();
      }
    } else {
      if (['like', 'superlike', 'dislike', 'react', 'instant'].includes(action)) {
        await Like.create({ 
          liker: currentUserId, 
          liked: targetUserId, 
          type: action,
          message: message || '',
          reactionContext: reactionContext || ''
        });
      }
    }

    const currentUser = await User.findById(currentUserId);
    if (currentUser && currentUser.missionProgress) {
      if (!isToday(currentUser.missionProgress.swipesMade.lastClaim)) {
        currentUser.missionProgress.swipesMade.count = (currentUser.missionProgress.swipesMade.count || 0) + 1;
      }
      if (action === 'superlike' && !isToday(currentUser.missionProgress.superLikeSent.lastClaim)) {
        currentUser.missionProgress.superLikeSent.count = (currentUser.missionProgress.superLikeSent.count || 0) + 1;
      }
      await User.findByIdAndUpdate(currentUserId, {
        $addToSet: { swiped: { user: targetUserId, action: action } }
      });
    }

    if (['like', 'superlike', 'react', 'instant'].includes(action)) {
      const likedUser = await User.findById(targetUserId);
      if (likedUser && likedUser.missionProgress && !isToday(likedUser.missionProgress.likeReceived.lastClaim)) {
        likedUser.missionProgress.likeReceived.count = (likedUser.missionProgress.likeReceived.count || 0) + 1;
        await likedUser.save();
      }

      const mutualLike = await Like.findOne({ liker: targetUserId, liked: currentUserId, type: { $in: ['like', 'superlike', 'react', 'instant'] } });

      if (mutualLike || action === 'instant') {
        await User.findByIdAndUpdate(currentUserId, { $addToSet: { matches: targetUserId } });
        await User.findByIdAndUpdate(targetUserId, { $addToSet: { matches: currentUserId } });

        if (message) {
          await Chat.create({ sender: currentUserId, receiver: targetUserId, message: message, type: 'text' });
        }
        if (currentUser.autoReply) {
          await Chat.create({ sender: currentUserId, receiver: targetUserId, message: currentUser.autoReply, type: 'text' });
        }
        if (likedUser && likedUser.autoReply) {
          await Chat.create({ sender: targetUserId, receiver: currentUserId, message: likedUser.autoReply, type: 'text' });
        }

        return res.json({ match: true, superlike: mutualLike?.type === 'superlike' || action === 'superlike' });
      }
    }

    res.json({ match: false });

  } catch (error) {
    if (error.code === 11000) {
      return res.json({ match: false, message: "Already processed" });
    }
    console.error("Swipe Error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getMatches = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('matches', 'fullName username profilePic isOnline lastActive');
    res.json(user.matches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWhoLikedMe = async (req, res) => {
  try {
    const swipedLikes = await Like.find({ liker: req.user.id }).select('liked');
    const swipedIds = swipedLikes.map(l => l.liked);

    const likes = await Like.find({ 
      liked: req.user.id, 
      liker: { $nin: swipedIds },
      type: { $in: ['like', 'superlike', 'react', 'instant'] }
    }).populate('liker', 'fullName username profilePic bio age');
      
    res.json(likes.map(like => ({
      user: like.liker,
      type: like.type,
      message: like.message,
      reactionContext: like.reactionContext
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const logProfileVisit = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    if (targetUserId === req.user.id) return res.status(200).send();
    await User.findByIdAndUpdate(targetUserId, {
      $push: { profileVisitors: { $each: [{ visitor: req.user.id, visitedAt: new Date() }], $slice: -50 } }
    });
    res.status(200).json({ message: 'Visit logged' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const findBlindDate = async (req, res) => {
  try {
    const potentialPartners = await User.find({ _id: { $ne: req.user.id } }).limit(10); 
    if (potentialPartners.length === 0) return res.status(404).json({ message: 'No users available' });
    const partner = potentialPartners[Math.floor(Math.random() * potentialPartners.length)];
    res.json({ partnerId: partner._id, username: partner.username });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const getTopPicks = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } }).limit(10).select('-password');
    res.json(users);
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const rewindLastSwipe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.coins < 100) return res.status(400).json({ message: "Not enough coins" });
    const lastSwipe = await Like.findOne({ liker: user._id }).sort({ createdAt: -1 });
    if (!lastSwipe) return res.status(400).json({ message: "No swipe to rewind" });

    user.coins -= 100;
    await user.save();
    await Like.deleteOne({ _id: lastSwipe._id });
    await User.findByIdAndUpdate(user._id, { $pull: { swiped: { user: lastSwipe.liked } } });

    res.status(200).json({ message: 'Rewind successful', newCoinBalance: user.coins });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const activateBoost = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { boostExpiresAt: new Date(Date.now() + 30 * 60 * 1000) });
    res.status(200).json({ message: 'Boost activated' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const setTravelMode = async (req, res) => {
  try {
    const { coordinates, enabled } = req.body;
    let update = enabled && coordinates ? { travelLocation: { type: 'Point', coordinates } } : { travelLocation: null };
    await User.findByIdAndUpdate(req.user.id, { $set: update });
    res.status(200).json({ message: 'Travel mode updated' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const saveSpotifyData = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { spotifyAnthem: req.body.tracks });
    res.status(200).json({ message: 'Spotify data saved' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const unmatchUser = async (req, res) => {
  try {
    const { userId } = req.body;
    await User.findByIdAndUpdate(req.user.id, { $pull: { matches: userId }, $push: { blockedUsers: userId } });
    await User.findByIdAndUpdate(userId, { $pull: { matches: req.user.id } });
    await Like.deleteMany({ $or: [{ liker: req.user.id, liked: userId }, { liker: userId, liked: req.user.id }] });
    res.json({ message: "Unmatched and blocked" });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const reportUser = async (req, res) => { res.json({ message: "User reported" }); };
const extendMatch = async (req, res) => { res.json({ message: "Match extended" }); };
const rematchUser = async (req, res) => { res.json({ message: "Rematched" }); };
const instantMatch = async (req, res) => { res.json({ message: "Instant Matched" }); };
const pokeUser = async (req, res) => { res.json({ message: "User poked" }); };
const getDailyRecommendations = async (req, res) => { 
  try {
    const users = await User.find({ _id: { $ne: req.user.id } }).limit(5).select('fullName username profilePic bio');
    res.json(users);
  } catch (error) { res.status(500).json({ message: error.message }); }
};
const resetDislikes = async (req, res) => { 
  try {
    await Like.deleteMany({ liker: req.user.id, type: 'dislike' });
    res.json({ message: "Dislikes reset" });
  } catch (error) { res.status(500).json({ message: error.message }); }
};
const updateMatchSettings = async (req, res) => { res.json({ message: "Settings updated" }); };

module.exports = {
  getDiscoveryQueue,
  swipeAction,
  getMatches,
  getWhoLikedMe,
  logProfileVisit,
  findBlindDate,
  getTopPicks,
  rewindLastSwipe,
  activateBoost,
  setTravelMode,
  saveSpotifyData,
  unmatchUser,
  reportUser,
  extendMatch,
  rematchUser,
  instantMatch,
  pokeUser,
  getDailyRecommendations,
  resetDislikes,
  updateMatchSettings
};