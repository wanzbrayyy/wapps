const User = require('../models/user');
const Like = require('../models/like');
const Chat = require('../models/chat');
const Report = require('../models/report');

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

  if (Array.isArray(user1.passions) && Array.isArray(user2.passions)) {
    const commonInterests = user1.passions.filter((passion) => user2.passions.includes(passion));
    score += commonInterests.length * 10;
  }

  if (user1.zodiacSign && user2.zodiacSign && user1.zodiacSign === user2.zodiacSign) score += 5;
  if (user1.religion && user1.religion === user2.religion) score += 10;
  if (user1.smoking && user1.smoking === user2.smoking) score += 10;

  return Math.min(score + 50, 100);
};

const getEffectiveSettings = (user, query) => {
  const settings = user.matchSettings || {};
  return {
    minAge: Number(query.minAge ?? settings.minAge ?? 18),
    maxAge: Number(query.maxAge ?? settings.maxAge ?? 99),
    preferredGender: query.gender ?? settings.preferredGender ?? 'Everyone',
    maxDistanceKm: Number(query.distance ?? settings.maxDistanceKm ?? 5000),
    globalMode: (query.global ?? String(settings.globalMode ?? false)) === 'true',
    education: query.education,
    religion: query.religion,
    smoking: query.smoking
  };
};

const upsertMatchExtension = (user, targetUserId, expiresAt) => {
  const existing = user.matchExtensions.find(
    (extension) => extension.user.toString() === targetUserId.toString()
  );

  if (existing) {
    existing.expiresAt = expiresAt;
    existing.extendedAt = new Date();
    return;
  }

  user.matchExtensions.push({
    user: targetUserId,
    expiresAt,
    extendedAt: new Date()
  });
};

const createMatchSideEffects = async ({ currentUser, likedUser, currentUserId, targetUserId, message, action }) => {
  await User.findByIdAndUpdate(currentUserId, { $addToSet: { matches: targetUserId } });
  await User.findByIdAndUpdate(targetUserId, { $addToSet: { matches: currentUserId } });

  if (message) {
    await Chat.create({
      sender: currentUserId,
      receiver: targetUserId,
      message,
      type: 'text'
    });
  }

  const currentAutoReply = currentUser?.matchSettings?.autoReply?.trim();
  const targetAutoReply = likedUser?.matchSettings?.autoReply?.trim();

  if (currentAutoReply) {
    await Chat.create({
      sender: currentUserId,
      receiver: targetUserId,
      message: currentAutoReply,
      type: 'text'
    });
  }

  if (targetAutoReply) {
    await Chat.create({
      sender: targetUserId,
      receiver: currentUserId,
      message: targetAutoReply,
      type: 'text'
    });
  }

  return { match: true, superlike: action === 'superlike' };
};

const processSwipe = async ({ currentUserId, targetUserId, action, message = '', reactionContext = '' }) => {
  const validActions = ['like', 'superlike', 'dislike', 'react', 'instant'];
  if (!validActions.includes(action)) {
    return { statusCode: 400, payload: { message: 'Invalid swipe action' } };
  }

  const [currentUser, likedUser] = await Promise.all([
    User.findById(currentUserId),
    User.findById(targetUserId)
  ]);

  if (!currentUser || !likedUser) {
    return { statusCode: 404, payload: { message: 'User not found' } };
  }

  if (currentUserId.toString() === targetUserId.toString()) {
    return { statusCode: 400, payload: { message: 'You cannot swipe yourself' } };
  }

  let existingLike = await Like.findOne({ liker: currentUserId, liked: targetUserId });

  if (existingLike) {
    if (existingLike.type === action) {
      return { statusCode: 200, payload: { match: false, message: 'Already swiped' } };
    }

    existingLike.type = action;
    existingLike.message = message || existingLike.message;
    existingLike.reactionContext = reactionContext || existingLike.reactionContext;
    await existingLike.save();
  } else {
    existingLike = await Like.create({
      liker: currentUserId,
      liked: targetUserId,
      type: action,
      message,
      reactionContext
    });
  }

  if (currentUser.missionProgress) {
    if (!isToday(currentUser.missionProgress.swipesMade.lastClaim)) {
      currentUser.missionProgress.swipesMade.count = (currentUser.missionProgress.swipesMade.count || 0) + 1;
    }

    if (action === 'superlike' && !isToday(currentUser.missionProgress.superLikeSent.lastClaim)) {
      currentUser.missionProgress.superLikeSent.count = (currentUser.missionProgress.superLikeSent.count || 0) + 1;
    }

    await currentUser.save();
  }

  await User.findByIdAndUpdate(currentUserId, {
    $addToSet: { swiped: { user: targetUserId, action } }
  });

  if (['like', 'superlike', 'react', 'instant'].includes(action)) {
    if (likedUser.missionProgress && !isToday(likedUser.missionProgress.likeReceived.lastClaim)) {
      likedUser.missionProgress.likeReceived.count = (likedUser.missionProgress.likeReceived.count || 0) + 1;
      await likedUser.save();
    }

    const mutualLike = await Like.findOne({
      liker: targetUserId,
      liked: currentUserId,
      type: { $in: ['like', 'superlike', 'react', 'instant'] }
    });

    if (mutualLike || action === 'instant') {
      const payload = await createMatchSideEffects({
        currentUser,
        likedUser,
        currentUserId,
        targetUserId,
        message,
        action: mutualLike?.type === 'superlike' ? 'superlike' : action
      });

      return {
        statusCode: 200,
        payload: {
          ...payload,
          superlike: mutualLike?.type === 'superlike' || action === 'superlike'
        }
      };
    }
  }

  return {
    statusCode: 200,
    payload: {
      match: false,
      action: existingLike.type
    }
  };
};

const getDiscoveryQueue = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) return res.status(404).json({ message: 'User not found' });

    const settings = getEffectiveSettings(currentUser, req.query);
    const swipedLikes = await Like.find({ liker: req.user.id }).select('liked');
    const swipedIds = swipedLikes.map((like) => like.liked);
    const blockedIds = currentUser.blockedUsers || [];
    const excludeIds = [req.user.id, ...swipedIds, ...blockedIds];

    const filter = {
      _id: { $nin: excludeIds },
      accountStatus: 'Active'
    };

    if (!settings.globalMode) {
      const loc = currentUser.travelLocation || currentUser.location;
      const isValidLocation = loc && Array.isArray(loc.coordinates) && loc.coordinates.length === 2 &&
        (loc.coordinates[0] !== 0 || loc.coordinates[1] !== 0);

      if (isValidLocation) {
        filter.location = {
          $near: {
            $geometry: { type: 'Point', coordinates: loc.coordinates },
            $maxDistance: settings.maxDistanceKm * 1000
          }
        };
      }
    }

    if (settings.preferredGender && settings.preferredGender !== 'Everyone') {
      filter.gender = settings.preferredGender === 'Men' ? 'Man' : settings.preferredGender === 'Women' ? 'Woman' : settings.preferredGender;
    }
    if (settings.education) filter.education = settings.education;
    if (settings.religion) filter.religion = settings.religion;
    if (settings.smoking) filter.smoking = settings.smoking;

    let users = await User.find(filter)
      .select('-password -swiped -matches -blockedUsers')
      .limit(30);

    users = users.filter((user) => {
      const age = calculateAge(user.birthDate);
      return age >= settings.minAge && age <= settings.maxAge;
    });

    if (users.length === 0) {
      users = await User.find({ _id: { $nin: excludeIds }, accountStatus: 'Active' })
        .select('-password -swiped -matches -blockedUsers')
        .limit(20);
    }

    const enrichedUsers = users.map((user) => ({
      ...user.toObject(),
      age: calculateAge(user.birthDate),
      compatibility: calculateCompatibility(currentUser, user),
      distance: currentUser.location && user.location ? 10 : null
    }));

    res.json(enrichedUsers.sort(() => 0.5 - Math.random()));
  } catch (error) {
    console.error('Discovery Queue Error:', error);
    res.status(500).json({ message: error.message });
  }
};

const swipeAction = async (req, res) => {
  try {
    const { targetUserId, action, message, reactionContext } = req.body;
    if (!targetUserId || !action) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const result = await processSwipe({
      currentUserId: req.user.id,
      targetUserId,
      action,
      message,
      reactionContext
    });

    res.status(result.statusCode).json(result.payload);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ match: false, message: 'Already processed' });
    }
    console.error('Swipe Error:', error);
    res.status(500).json({ message: error.message });
  }
};

const getMatches = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('matches', 'fullName username profilePic isOnline lastActive');

    const extensionMap = new Map(
      (user.matchExtensions || []).map((extension) => [extension.user.toString(), extension.expiresAt])
    );

    const matches = user.matches.map((matchUser) => ({
      ...matchUser.toObject(),
      extendedUntil: extensionMap.get(matchUser._id.toString()) || null
    }));

    res.json(matches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWhoLikedMe = async (req, res) => {
  try {
    const swipedLikes = await Like.find({ liker: req.user.id }).select('liked');
    const swipedIds = swipedLikes.map((like) => like.liked);

    const likes = await Like.find({
      liked: req.user.id,
      liker: { $nin: swipedIds },
      type: { $in: ['like', 'superlike', 'react', 'instant'] }
    }).populate('liker', 'fullName username profilePic bio');

    res.json(likes.map((like) => ({
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
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const findBlindDate = async (req, res) => {
  try {
    const potentialPartners = await User.find({ _id: { $ne: req.user.id }, accountStatus: 'Active' }).limit(10);
    if (potentialPartners.length === 0) {
      return res.status(404).json({ message: 'No users available' });
    }

    const partner = potentialPartners[Math.floor(Math.random() * potentialPartners.length)];
    res.json({ partnerId: partner._id, username: partner.username });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTopPicks = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const users = await User.find({ _id: { $ne: req.user.id }, accountStatus: 'Active' })
      .limit(10)
      .select('-password');

    const topPicks = users
      .map((user) => ({
        ...user.toObject(),
        compatibility: calculateCompatibility(currentUser, user),
        age: calculateAge(user.birthDate)
      }))
      .sort((a, b) => b.compatibility - a.compatibility);

    res.json(topPicks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const rewindLastSwipe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.coins < 100) return res.status(400).json({ message: 'Not enough coins' });

    const lastSwipe = await Like.findOne({ liker: user._id }).sort({ createdAt: -1 });
    if (!lastSwipe) return res.status(400).json({ message: 'No swipe to rewind' });

    user.coins -= 100;
    await user.save();
    await Like.deleteOne({ _id: lastSwipe._id });
    await User.findByIdAndUpdate(user._id, { $pull: { swiped: { user: lastSwipe.liked } } });

    res.status(200).json({ message: 'Rewind successful', newCoinBalance: user.coins });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const activateBoost = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      boostExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    res.status(200).json({ message: 'Boost activated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const setTravelMode = async (req, res) => {
  try {
    const { coordinates, enabled } = req.body;
    const update = enabled && coordinates
      ? { travelLocation: { type: 'Point', coordinates } }
      : { travelLocation: null };

    await User.findByIdAndUpdate(req.user.id, { $set: update });
    res.status(200).json({ message: 'Travel mode updated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const saveSpotifyData = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { spotifyAnthem: req.body.tracks });
    res.status(200).json({ message: 'Spotify data saved' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const unmatchUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    await User.findByIdAndUpdate(req.user.id, {
      $pull: {
        matches: userId,
        matchExtensions: { user: userId }
      },
      $push: { blockedUsers: userId }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: {
        matches: req.user.id,
        matchExtensions: { user: req.user.id }
      }
    });

    await Like.deleteMany({
      $or: [
        { liker: req.user.id, liked: userId },
        { liker: userId, liked: req.user.id }
      ]
    });

    res.json({ message: 'Unmatched and blocked' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const reportUser = async (req, res) => {
  try {
    const { userId, reason, details } = req.body;
    if (!userId || !reason) {
      return res.status(400).json({ message: 'userId and reason are required' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    const report = await Report.create({
      reporter: req.user.id,
      reportedUser: userId,
      reason,
      details: details || ''
    });

    res.status(201).json({
      message: 'User reported successfully',
      report
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReportHistory = async (req, res) => {
  try {
    const reports = await Report.find({ reporter: req.user.id })
      .populate('reportedUser', 'username fullName profilePic')
      .sort({ createdAt: -1 });

    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const extendMatch = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(userId)
    ]);

    if (!currentUser || !targetUser) return res.status(404).json({ message: 'User not found' });
    if (!currentUser.matches.some((matchId) => matchId.toString() === userId)) {
      return res.status(400).json({ message: 'You are not matched with this user' });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    upsertMatchExtension(currentUser, userId, expiresAt);
    upsertMatchExtension(targetUser, req.user.id, expiresAt);

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.json({
      message: 'Match extended successfully',
      extendedUntil: expiresAt
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const rematchUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(userId)
    ]);

    if (!currentUser || !targetUser) return res.status(404).json({ message: 'User not found' });

    currentUser.blockedUsers = currentUser.blockedUsers.filter((blockedId) => blockedId.toString() !== userId);
    targetUser.blockedUsers = targetUser.blockedUsers.filter((blockedId) => blockedId.toString() !== req.user.id);
    await Promise.all([currentUser.save(), targetUser.save()]);

    const result = await processSwipe({
      currentUserId: req.user.id,
      targetUserId: userId,
      action: 'instant',
      message: 'Rematch activated'
    });

    res.status(result.statusCode).json({
      ...result.payload,
      rematched: result.statusCode < 400
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const instantMatch = async (req, res) => {
  try {
    const { targetUserId, message } = req.body;
    if (!targetUserId) return res.status(400).json({ message: 'targetUserId is required' });

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) return res.status(404).json({ message: 'User not found' });
    if (currentUser.coins < 500) return res.status(400).json({ message: 'Insufficient coins' });

    currentUser.coins -= 500;
    await currentUser.save();

    const result = await processSwipe({
      currentUserId: req.user.id,
      targetUserId,
      action: 'instant',
      message: message || 'Instant match activated'
    });

    res.status(result.statusCode).json({
      ...result.payload,
      newCoinBalance: currentUser.coins
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const pokeUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(userId)
    ]);

    if (!currentUser || !targetUser) return res.status(404).json({ message: 'User not found' });

    await Chat.create({
      sender: req.user.id,
      receiver: userId,
      message: `${currentUser.username} poked you`,
      type: 'system'
    });

    res.json({ message: 'User poked successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDailyRecommendations = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const users = await User.find({ _id: { $ne: req.user.id }, accountStatus: 'Active' })
      .limit(5)
      .select('fullName username profilePic bio birthDate passions zodiacSign religion smoking');

    const recommendations = users
      .map((user) => ({
        ...user.toObject(),
        age: calculateAge(user.birthDate),
        compatibility: calculateCompatibility(currentUser, user)
      }))
      .sort((a, b) => b.compatibility - a.compatibility);

    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resetDislikes = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.coins < 300) return res.status(400).json({ message: 'Insufficient coins' });

    user.coins -= 300;
    await user.save();

    const dislikes = await Like.find({ liker: req.user.id, type: 'dislike' });
    const dislikedIds = dislikes.map((dislike) => dislike.liked);

    await Like.deleteMany({ liker: req.user.id, type: 'dislike' });
    await User.findByIdAndUpdate(req.user.id, { $pull: { swiped: { user: { $in: dislikedIds } } } });

    res.json({ message: 'Dislikes reset', newCoinBalance: user.coins });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateMatchSettings = async (req, res) => {
  try {
    const {
      minAge,
      maxAge,
      maxDistanceKm,
      preferredGender,
      globalMode,
      autoReply
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (minAge !== undefined) user.matchSettings.minAge = Number(minAge);
    if (maxAge !== undefined) user.matchSettings.maxAge = Number(maxAge);
    if (maxDistanceKm !== undefined) user.matchSettings.maxDistanceKm = Number(maxDistanceKm);
    if (preferredGender !== undefined) user.matchSettings.preferredGender = preferredGender;
    if (globalMode !== undefined) user.matchSettings.globalMode = globalMode === true || globalMode === 'true';
    if (autoReply !== undefined) user.matchSettings.autoReply = autoReply;

    await user.save();

    res.json({
      message: 'Match settings updated',
      settings: user.matchSettings
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
  getReportHistory,
  extendMatch,
  rematchUser,
  instantMatch,
  pokeUser,
  getDailyRecommendations,
  resetDislikes,
  updateMatchSettings
};
