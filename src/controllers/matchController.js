const mongoose = require('mongoose');
const User = require('../models/user');
const Like = require('../models/like');
const Chat = require('../models/chat');
const Report = require('../models/report');
const MatchRecord = require('../models/matchRecord');
const DatePlan = require('../models/datePlan');
const SafetyCheckIn = require('../models/safetyCheckIn');
const Poke = require('../models/poke');
const { createNotification } = require('../services/notificationService');

const MATCH_DURATION_DAYS = 7;

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

const haversineKm = (coordA = [], coordB = []) => {
  if (!Array.isArray(coordA) || !Array.isArray(coordB) || coordA.length < 2 || coordB.length < 2) return null;
  const [lon1, lat1] = coordA.map(Number);
  const [lon2, lat2] = coordB.map(Number);
  if ([lon1, lat1, lon2, lat2].some((value) => Number.isNaN(value))) return null;

  const toRad = (value) => value * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 10) / 10;
};

const normalizePair = (user1, user2) => {
  const [first, second] = [user1.toString(), user2.toString()].sort();
  return { userA: first, userB: second };
};

const getPairQuery = (user1, user2) => normalizePair(user1, user2);

const calculateCompatibility = (user1, user2) => {
  let score = 35;

  if (Array.isArray(user1.passions) && Array.isArray(user2.passions)) {
    const commonPassions = user1.passions.filter((passion) => user2.passions.includes(passion));
    score += Math.min(commonPassions.length * 12, 36);
  }

  if (user1.zodiacSign && user2.zodiacSign && user1.zodiacSign === user2.zodiacSign) score += 6;
  if (user1.religion && user1.religion === user2.religion) score += 12;
  if (user1.smoking && user1.smoking === user2.smoking) score += 10;
  if (user1.education && user1.education === user2.education) score += 8;
  if (user1.relationshipIntent && user1.relationshipIntent === user2.relationshipIntent) score += 12;

  return Math.min(score, 99);
};

const buildSummaryParts = (currentUser, targetUser) => {
  const sharedPassions = (currentUser.passions || []).filter((passion) => (targetUser.passions || []).includes(passion));
  const reasons = [];
  if (sharedPassions.length > 0) reasons.push(`kalian sama-sama suka ${sharedPassions.slice(0, 2).join(' dan ')}`);
  if (currentUser.religion && currentUser.religion === targetUser.religion) reasons.push('punya nilai spiritual yang mirip');
  if (currentUser.relationshipIntent && currentUser.relationshipIntent === targetUser.relationshipIntent) reasons.push('sedang mencari jenis hubungan yang sama');
  if (currentUser.smoking && currentUser.smoking === targetUser.smoking) reasons.push('punya preferensi lifestyle yang cocok');
  if (reasons.length === 0) reasons.push('profil kalian terlihat saling melengkapi');
  return { sharedPassions, reasons };
};

const buildAiIcebreaker = (currentUser, targetUser) => {
  const { sharedPassions } = buildSummaryParts(currentUser, targetUser);
  if (sharedPassions.length > 0) {
    return `Aku lihat kita sama-sama suka ${sharedPassions[0]}. Kalau weekend ideal versi kamu, biasanya ngapain?`;
  }
  if (targetUser.bio) {
    return 'Bio kamu bikin penasaran. Hal paling seru yang lagi kamu kejar minggu ini apa?';
  }
  return 'Kalau kita ketemu buat first date yang santai, kamu lebih pilih coffee, sunset walk, atau live music?';
};

const buildAiMatchSummary = (currentUser, targetUser) => {
  const { reasons } = buildSummaryParts(currentUser, targetUser);
  return `Cocok karena ${reasons.slice(0, 2).join(' dan ')}.`;
};

const getCurrentCoordinates = (user) => {
  const source = user.travelLocation && Array.isArray(user.travelLocation.coordinates) && user.travelLocation.coordinates.length === 2
    ? user.travelLocation
    : user.location;
  return source?.coordinates || [0, 0];
};

const getEffectiveSettings = (user, query) => {
  const settings = user.matchSettings || {};
  return {
    minAge: Number(query.minAge ?? settings.minAge ?? 18),
    maxAge: Number(query.maxAge ?? settings.maxAge ?? 99),
    preferredGender: query.gender ?? settings.preferredGender ?? 'Everyone',
    maxDistanceKm: Number(query.distance ?? settings.maxDistanceKm ?? 5000),
    globalMode: (query.global ?? String(settings.globalMode ?? false)) === 'true',
    education: query.education ?? settings.education ?? '',
    religion: query.religion ?? settings.religion ?? '',
    smoking: query.smoking ?? settings.smoking ?? '',
    relationshipIntent: query.relationshipIntent ?? settings.relationshipIntent ?? ''
  };
};

const ensureUserMatchArrays = async (user1, user2) => {
  await Promise.all([
    User.findByIdAndUpdate(user1, { $addToSet: { matches: user2 } }),
    User.findByIdAndUpdate(user2, { $addToSet: { matches: user1 } })
  ]);
};

const removeUserMatchArrays = async (user1, user2) => {
  await Promise.all([
    User.findByIdAndUpdate(user1, {
      $pull: {
        matches: user2,
        matchExtensions: { user: user2 }
      }
    }),
    User.findByIdAndUpdate(user2, {
      $pull: {
        matches: user1,
        matchExtensions: { user: user1 }
      }
    })
  ]);
};

const upsertMatchExtension = (user, targetUserId, expiresAt) => {
  const existing = user.matchExtensions.find((extension) => extension.user.toString() === targetUserId.toString());
  if (existing) {
    existing.expiresAt = expiresAt;
    existing.extendedAt = new Date();
  } else {
    user.matchExtensions.push({ user: targetUserId, expiresAt, extendedAt: new Date() });
  }
};

const expireOverdueMatches = async (userId) => {
  const overdueMatches = await MatchRecord.find({
    status: 'active',
    expiresAt: { $lt: new Date() },
    $or: [{ userA: userId }, { userB: userId }]
  });

  for (const record of overdueMatches) {
    record.status = 'expired';
    await record.save();
    await removeUserMatchArrays(record.userA, record.userB);
  }
};

const getOtherUserIdFromRecord = (record, currentUserId) =>
  record.userA.toString() === currentUserId.toString() ? record.userB : record.userA;

const enrichCandidate = (currentUser, user) => {
  const distance = haversineKm(getCurrentCoordinates(currentUser), getCurrentCoordinates(user));
  return {
    ...user.toObject(),
    age: calculateAge(user.birthDate),
    compatibility: calculateCompatibility(currentUser, user),
    distance,
    aiIcebreaker: buildAiIcebreaker(currentUser, user),
    aiSummary: buildAiMatchSummary(currentUser, user),
    isSaved: (currentUser.savedProfiles || []).some((savedId) => savedId.toString() === user._id.toString())
  };
};

const buildMatchPayload = (currentUser, user, record) => ({
  ...user.toObject(),
  age: calculateAge(user.birthDate),
  compatibility: calculateCompatibility(currentUser, user),
  extendedUntil: record.expiresAt,
  expiresAt: record.expiresAt,
  matchedAt: record.matchedAt,
  matchRecordId: record._id,
  matchStatus: record.status,
  rematchedAt: record.rematchedAt,
  lastInteractionAt: record.lastInteractionAt,
  isSaved: (currentUser.savedProfiles || []).some((savedId) => savedId.toString() === user._id.toString()),
  canRematch: ['expired', 'unmatched'].includes(record.status),
  aiSummary: buildAiMatchSummary(currentUser, user),
  aiIcebreaker: buildAiIcebreaker(currentUser, user)
});

const createMatchSideEffects = async ({
  currentUser,
  likedUser,
  currentUserId,
  targetUserId,
  message,
  action,
  rematched = false
}) => {
  const pairQuery = getPairQuery(currentUserId, targetUserId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MATCH_DURATION_DAYS * 24 * 60 * 60 * 1000);

  let matchRecord = await MatchRecord.findOne(pairQuery);
  if (!matchRecord) {
    matchRecord = await MatchRecord.create({
      ...pairQuery,
      matchedByAction: rematched ? 'rematch' : (action === 'instant' ? 'instant' : action),
      status: 'active',
      matchedAt: now,
      expiresAt,
      rematchedAt: rematched ? now : null,
      lastInteractionAt: now
    });
  } else {
    matchRecord.status = 'active';
    matchRecord.matchedByAction = rematched ? 'rematch' : (action === 'instant' ? 'instant' : action);
    matchRecord.lastInteractionAt = now;
    matchRecord.expiresAt = expiresAt;
    if (rematched) matchRecord.rematchedAt = now;
    if (!matchRecord.matchedAt) matchRecord.matchedAt = now;
    await matchRecord.save();
  }

  await ensureUserMatchArrays(currentUserId, targetUserId);

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

  await createNotification({
    userId: targetUserId,
    actorId: currentUserId,
    title: rematched ? 'Rematch active' : 'New match',
    body: rematched
      ? `${currentUser.username} opened the match again with you`
      : `${currentUser.username} matched with you`,
    type: 'system',
    data: { targetUserId: currentUserId.toString(), matchRecordId: matchRecord._id.toString() }
  });

  return {
    match: true,
    superlike: action === 'superlike',
    matchRecordId: matchRecord._id,
    expiresAt
  };
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
    existingLike.type = action;
    existingLike.message = message || existingLike.message;
    existingLike.reactionContext = reactionContext || existingLike.reactionContext;
    existingLike.isRead = false;
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

  const existingSwiped = currentUser.swiped.find((entry) => entry.user.toString() === targetUserId.toString());
  if (existingSwiped) existingSwiped.action = action;
  else currentUser.swiped.push({ user: targetUserId, action });
  await currentUser.save();

  if (['like', 'superlike', 'react', 'instant'].includes(action)) {
    if (likedUser.missionProgress && !isToday(likedUser.missionProgress.likeReceived.lastClaim)) {
      likedUser.missionProgress.likeReceived.count = (likedUser.missionProgress.likeReceived.count || 0) + 1;
      await likedUser.save();
    }

    await createNotification({
      userId: targetUserId,
      actorId: currentUserId,
      title: action === 'superlike' ? 'New superlike' : 'New like',
      body: action === 'superlike'
        ? `${currentUser.username} sent you a superlike`
        : `${currentUser.username} liked your profile`,
      type: 'system',
      data: { targetUserId: currentUserId.toString(), likeType: action }
    });

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

    await expireOverdueMatches(req.user.id);

    const settings = getEffectiveSettings(currentUser, req.query);
    const swipedLikes = await Like.find({ liker: req.user.id }).select('liked');
    const swipedIds = swipedLikes.map((like) => like.liked);
    const blockedIds = currentUser.blockedUsers || [];
    const activeMatches = await MatchRecord.find({
      status: 'active',
      $or: [{ userA: req.user.id }, { userB: req.user.id }]
    });
    const activeMatchedUserIds = activeMatches.map((record) => getOtherUserIdFromRecord(record, req.user.id));
    const excludeIds = [req.user.id, ...swipedIds, ...blockedIds, ...activeMatchedUserIds];

    const filter = {
      _id: { $nin: excludeIds },
      accountStatus: 'Active'
    };

    if (!settings.globalMode) {
      const coordinates = getCurrentCoordinates(currentUser);
      if (coordinates[0] !== 0 || coordinates[1] !== 0) {
        filter.location = {
          $near: {
            $geometry: { type: 'Point', coordinates },
            $maxDistance: settings.maxDistanceKm * 1000
          }
        };
      }
    }

    if (settings.preferredGender && settings.preferredGender !== 'Everyone') {
      filter.gender = settings.preferredGender === 'Men'
        ? 'Man'
        : settings.preferredGender === 'Women'
          ? 'Woman'
          : settings.preferredGender;
    }
    if (settings.education) filter.education = settings.education;
    if (settings.religion) filter.religion = settings.religion;
    if (settings.smoking) filter.smoking = settings.smoking;
    if (settings.relationshipIntent) filter.relationshipIntent = settings.relationshipIntent;

    let users = await User.find(filter)
      .select('-password -swiped -matches -blockedUsers')
      .limit(40);

    users = users.filter((user) => {
      const age = calculateAge(user.birthDate);
      return age >= settings.minAge && age <= settings.maxAge;
    });

    const enrichedUsers = users
      .map((user) => enrichCandidate(currentUser, user))
      .sort((a, b) => (b.compatibility * 10 - (b.distance || 999)) - (a.compatibility * 10 - (a.distance || 999)))
      .slice(0, 30);

    res.json(enrichedUsers);
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
    await expireOverdueMatches(req.user.id);

    const currentUser = await User.findById(req.user.id).select('savedProfiles passions zodiacSign religion smoking education relationshipIntent birthDate location travelLocation');
    const matchRecords = await MatchRecord.find({
      status: 'active',
      $or: [{ userA: req.user.id }, { userB: req.user.id }]
    }).sort({ matchedAt: -1 });

    const otherUserIds = matchRecords.map((record) => getOtherUserIdFromRecord(record, req.user.id));
    const users = await User.find({ _id: { $in: otherUserIds } }).select('fullName username profilePic bio birthDate passions zodiacSign religion smoking education relationshipIntent location travelLocation');
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    const payload = matchRecords
      .map((record) => {
        const user = userMap.get(getOtherUserIdFromRecord(record, req.user.id).toString());
        if (!user) return null;
        return buildMatchPayload(currentUser, user, record);
      })
      .filter(Boolean);

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMatchHistory = async (req, res) => {
  try {
    await expireOverdueMatches(req.user.id);

    const currentUser = await User.findById(req.user.id).select('savedProfiles passions zodiacSign religion smoking education relationshipIntent birthDate location travelLocation');
    const matchRecords = await MatchRecord.find({
      status: { $in: ['expired', 'unmatched'] },
      $or: [{ userA: req.user.id }, { userB: req.user.id }]
    }).sort({ updatedAt: -1, expiresAt: -1 });

    const otherUserIds = matchRecords.map((record) => getOtherUserIdFromRecord(record, req.user.id));
    const users = await User.find({ _id: { $in: otherUserIds } }).select('fullName username profilePic bio birthDate passions zodiacSign religion smoking education relationshipIntent location travelLocation');
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    res.json(
      matchRecords
        .map((record) => {
          const user = userMap.get(getOtherUserIdFromRecord(record, req.user.id).toString());
          if (!user) return null;
          return buildMatchPayload(currentUser, user, record);
        })
        .filter(Boolean)
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWhoLikedMe = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id).select('savedProfiles');
    const likes = await Like.find({
      liked: req.user.id,
      type: { $in: ['like', 'superlike', 'react', 'instant'] }
    })
      .populate('liker', 'fullName username profilePic bio birthDate passions zodiacSign religion smoking education relationshipIntent location travelLocation')
      .sort({ createdAt: -1 });

    res.json(likes.map((like) => ({
      user: {
        ...like.liker.toObject(),
        age: calculateAge(like.liker.birthDate),
        isSaved: (currentUser.savedProfiles || []).some((savedId) => savedId.toString() === like.liker._id.toString())
      },
      type: like.type,
      message: like.message,
      reactionContext: like.reactionContext,
      likedAt: like.createdAt
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
    const currentUser = await User.findById(req.user.id);
    const candidates = await User.find({
      _id: { $ne: req.user.id, $nin: currentUser.blockedUsers || [] },
      accountStatus: 'Active'
    })
      .limit(25)
      .select('fullName username profilePic bio birthDate passions zodiacSign religion smoking education relationshipIntent location travelLocation');

    const ranked = candidates
      .map((candidate) => ({
        user: candidate,
        compatibility: calculateCompatibility(currentUser, candidate),
        distance: haversineKm(getCurrentCoordinates(currentUser), getCurrentCoordinates(candidate))
      }))
      .filter((candidate) => (candidate.distance ?? 9999) <= 50)
      .sort((a, b) => (b.compatibility * 10 - (b.distance ?? 999)) - (a.compatibility * 10 - (a.distance || 999)));

    if (ranked.length === 0) {
      return res.status(404).json({ message: 'No blind date candidate available yet' });
    }

    const selected = ranked[0];
    res.json({
      partner: enrichCandidate(currentUser, selected.user),
      suggestedWindow: 'Sabtu 19:00 - 21:00',
      suggestedVenue: [
        'Coffee shop yang ramai tapi santai',
        'Casual dinner tempat terang dan aman',
        'Public park walk menjelang sunset'
      ],
      safetyTip: 'Pilih tempat umum, share lokasi ke teman, dan aktifkan safety check-in sebelum berangkat.'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTopPicks = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const users = await User.find({ _id: { $ne: req.user.id }, accountStatus: 'Active' })
      .limit(20)
      .select('-password');

    const topPicks = users
      .map((user) => enrichCandidate(currentUser, user))
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, 10);

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
    user.swiped = user.swiped.filter((entry) => entry.user.toString() !== lastSwipe.liked.toString());
    await user.save();

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

    const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true });
    res.status(200).json({
      message: 'Travel mode updated',
      enabled: Boolean(user.travelLocation),
      travelLocation: user.travelLocation
    });
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

    const pairQuery = getPairQuery(req.user.id, userId);
    const record = await MatchRecord.findOne(pairQuery);
    if (record) {
      record.status = 'unmatched';
      await record.save();
    }

    await removeUserMatchArrays(req.user.id, userId);
    await Like.deleteMany({
      $or: [
        { liker: req.user.id, liked: userId },
        { liker: userId, liked: req.user.id }
      ]
    });

    res.json({ message: 'Unmatched successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const reportUser = async (req, res) => {
  try {
    const { userId, reason, details } = req.body;
    if (!userId || !reason) return res.status(400).json({ message: 'userId and reason are required' });
    if (userId === req.user.id) return res.status(400).json({ message: 'You cannot report yourself' });

    const report = await Report.create({
      reporter: req.user.id,
      reportedUser: userId,
      reason,
      details: details || ''
    });

    res.status(201).json({ message: 'User reported successfully', report });
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

    const pairQuery = getPairQuery(req.user.id, userId);
    const [record, currentUser, targetUser] = await Promise.all([
      MatchRecord.findOne(pairQuery),
      User.findById(req.user.id),
      User.findById(userId)
    ]);

    if (!record || record.status !== 'active') return res.status(400).json({ message: 'No active match to extend' });
    if (!currentUser || !targetUser) return res.status(404).json({ message: 'User not found' });

    const baseDate = record.expiresAt > new Date() ? record.expiresAt : new Date();
    const expiresAt = new Date(baseDate.getTime() + MATCH_DURATION_DAYS * 24 * 60 * 60 * 1000);
    record.expiresAt = expiresAt;
    record.extendedAt = new Date();
    record.lastInteractionAt = new Date();
    await record.save();

    upsertMatchExtension(currentUser, userId, expiresAt);
    upsertMatchExtension(targetUser, req.user.id, expiresAt);
    await Promise.all([currentUser.save(), targetUser.save()]);

    await createNotification({
      userId,
      actorId: req.user.id,
      title: 'Match extended',
      body: `${currentUser.username} extended your match time`,
      type: 'system',
      data: { targetUserId: req.user.id, expiresAt: expiresAt.toISOString() }
    });

    res.json({ message: 'Match extended successfully', extendedUntil: expiresAt });
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

    const payload = await createMatchSideEffects({
      currentUser,
      likedUser: targetUser,
      currentUserId: req.user.id,
      targetUserId: userId,
      action: 'rematch',
      message: 'Rematch activated',
      rematched: true
    });

    res.json({ ...payload, rematched: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const instantMatch = async (req, res) => {
  try {
    const { targetUserId, message } = req.body;
    if (!targetUserId) return res.status(400).json({ message: 'targetUserId is required' });

    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(targetUserId)
    ]);
    if (!currentUser || !targetUser) return res.status(404).json({ message: 'User not found' });
    if (currentUser.coins < 500) return res.status(400).json({ message: 'Insufficient coins' });

    currentUser.coins -= 500;
    await currentUser.save();

    await Like.findOneAndUpdate(
      { liker: req.user.id, liked: targetUserId },
      { $set: { type: 'instant', message: message || 'Instant match activated', isRead: false } },
      { upsert: true, new: true }
    );

    const payload = await createMatchSideEffects({
      currentUser,
      likedUser: targetUser,
      currentUserId: req.user.id,
      targetUserId,
      action: 'instant',
      message: message || 'Instant match activated'
    });

    res.json({ ...payload, bypassedQueue: true, newCoinBalance: currentUser.coins });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const pokeUser = async (req, res) => {
  try {
    const { userId, message = 'Hey, kamu lagi lewat di pikiranku.' } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const [currentUser, targetUser, recentPoke] = await Promise.all([
      User.findById(req.user.id),
      User.findById(userId),
      Poke.findOne({ sender: req.user.id, receiver: userId }).sort({ createdAt: -1 })
    ]);
    if (!currentUser || !targetUser) return res.status(404).json({ message: 'User not found' });

    if (recentPoke && Date.now() - new Date(recentPoke.createdAt).getTime() < 12 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'You can poke this user again after 12 hours' });
    }

    const poke = await Poke.create({ sender: req.user.id, receiver: userId, message });
    await Chat.create({
      sender: req.user.id,
      receiver: userId,
      message: `Poke from ${currentUser.username}: ${message}`,
      type: 'system'
    });

    await createNotification({
      userId,
      actorId: req.user.id,
      title: 'New poke',
      body: `${currentUser.username} poked you`,
      type: 'system',
      data: { targetUserId: req.user.id, pokeId: poke._id.toString() }
    });

    res.json({ message: 'User poked successfully', poke });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDailyRecommendations = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const users = await User.find({ _id: { $ne: req.user.id }, accountStatus: 'Active' })
      .limit(15)
      .select('fullName username profilePic bio birthDate passions zodiacSign religion smoking education relationshipIntent location travelLocation');

    const recommendations = users
      .map((user) => enrichCandidate(currentUser, user))
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, 6);

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
    const dislikedIds = dislikes.map((dislike) => dislike.liked.toString());
    await Like.deleteMany({ liker: req.user.id, type: 'dislike' });
    user.swiped = user.swiped.filter((entry) => !dislikedIds.includes(entry.user.toString()));
    await user.save();

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
      autoReply,
      education,
      religion,
      smoking,
      relationshipIntent
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (minAge !== undefined) user.matchSettings.minAge = Number(minAge);
    if (maxAge !== undefined) user.matchSettings.maxAge = Number(maxAge);
    if (maxDistanceKm !== undefined) user.matchSettings.maxDistanceKm = Number(maxDistanceKm);
    if (preferredGender !== undefined) user.matchSettings.preferredGender = preferredGender;
    if (globalMode !== undefined) user.matchSettings.globalMode = globalMode === true || globalMode === 'true';
    if (autoReply !== undefined) user.matchSettings.autoReply = autoReply;
    if (education !== undefined) user.matchSettings.education = education;
    if (religion !== undefined) user.matchSettings.religion = religion;
    if (smoking !== undefined) user.matchSettings.smoking = smoking;
    if (relationshipIntent !== undefined) user.matchSettings.relationshipIntent = relationshipIntent;

    await user.save();
    res.json({ message: 'Match settings updated', settings: user.matchSettings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggleSavedProfile = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const user = await User.findById(req.user.id);
    const alreadySaved = user.savedProfiles.some((savedId) => savedId.toString() === userId);
    if (alreadySaved) {
      user.savedProfiles = user.savedProfiles.filter((savedId) => savedId.toString() !== userId);
    } else {
      user.savedProfiles.push(userId);
    }
    await user.save();

    res.json({ saved: !alreadySaved, savedProfilesCount: user.savedProfiles.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getSavedProfiles = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id).populate('savedProfiles', 'fullName username profilePic bio birthDate passions zodiacSign religion smoking education relationshipIntent location travelLocation');
    const payload = currentUser.savedProfiles.map((user) => enrichCandidate(currentUser, user));
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getNearbyUsers = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const coordinates = getCurrentCoordinates(currentUser);
    const users = await User.find({
      _id: { $ne: req.user.id },
      accountStatus: 'Active'
    })
      .limit(20)
      .select('fullName username profilePic bio birthDate passions zodiacSign religion smoking education relationshipIntent location travelLocation');

    const payload = users
      .map((user) => {
        const location = getCurrentCoordinates(user);
        const distance = haversineKm(coordinates, location);
        return {
          ...enrichCandidate(currentUser, user),
          coordinates: location,
          distance,
          radarX: Number((((location[0] || 0) - (coordinates[0] || 0)) * 10000).toFixed(2)),
          radarY: Number((((location[1] || 0) - (coordinates[1] || 0)) * 10000).toFixed(2))
        };
      })
      .filter((user) => user.distance !== null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12);

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAiIcebreaker = async (req, res) => {
  try {
    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(req.params.userId)
    ]);
    if (!currentUser || !targetUser) return res.status(404).json({ message: 'User not found' });
    res.json({ icebreaker: buildAiIcebreaker(currentUser, targetUser) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAiMatchSummary = async (req, res) => {
  try {
    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(req.params.userId)
    ]);
    if (!currentUser || !targetUser) return res.status(404).json({ message: 'User not found' });
    res.json({ summary: buildAiMatchSummary(currentUser, targetUser) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const saveDateAvailability = async (req, res) => {
  try {
    const { slots = [] } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.dateAvailability = Array.isArray(slots) ? slots : [];
    await user.save();
    res.json({ message: 'Availability updated', slots: user.dateAvailability });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDateAvailability = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('dateAvailability');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.dateAvailability || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createDatePlan = async (req, res) => {
  try {
    const { inviteeId, scheduledAt, locationLabel, vibe, note } = req.body;
    if (!inviteeId || !scheduledAt || !locationLabel) {
      return res.status(400).json({ message: 'inviteeId, scheduledAt, and locationLabel are required' });
    }

    const datePlan = await DatePlan.create({
      creator: req.user.id,
      invitee: inviteeId,
      scheduledAt,
      locationLabel,
      vibe: vibe || '',
      note: note || ''
    });

    await createNotification({
      userId: inviteeId,
      actorId: req.user.id,
      title: 'New date plan',
      body: `${req.user.username} sent you a date invitation`,
      type: 'system',
      data: { datePlanId: datePlan._id.toString(), targetUserId: req.user.id }
    });

    res.status(201).json(await DatePlan.findById(datePlan._id)
      .populate('creator', 'username fullName profilePic')
      .populate('invitee', 'username fullName profilePic'));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDatePlans = async (req, res) => {
  try {
    const plans = await DatePlan.find({
      $or: [{ creator: req.user.id }, { invitee: req.user.id }]
    })
      .populate('creator', 'username fullName profilePic')
      .populate('invitee', 'username fullName profilePic')
      .sort({ scheduledAt: 1 });

    res.json(plans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateDatePlanStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const plan = await DatePlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Date plan not found' });
    if (![plan.creator.toString(), plan.invitee.toString()].includes(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    plan.status = status;
    await plan.save();
    res.json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createSafetyCheckIn = async (req, res) => {
  try {
    const { partnerId, datePlanId, scheduledFor, locationLabel, emergencyNote } = req.body;
    if (!partnerId || !scheduledFor) return res.status(400).json({ message: 'partnerId and scheduledFor are required' });

    const checkIn = await SafetyCheckIn.create({
      user: req.user.id,
      partner: partnerId,
      datePlan: datePlanId || null,
      scheduledFor,
      locationLabel: locationLabel || '',
      emergencyNote: emergencyNote || ''
    });

    res.status(201).json(await SafetyCheckIn.findById(checkIn._id)
      .populate('partner', 'username fullName profilePic')
      .populate('datePlan'));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getSafetyCheckIns = async (req, res) => {
  try {
    const checkins = await SafetyCheckIn.find({ user: req.user.id })
      .populate('partner', 'username fullName profilePic')
      .populate('datePlan')
      .sort({ scheduledFor: -1 });

    res.json(checkins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const markSafetyCheckInSafe = async (req, res) => {
  try {
    const checkIn = await SafetyCheckIn.findOne({ _id: req.params.id, user: req.user.id });
    if (!checkIn) return res.status(404).json({ message: 'Safety check-in not found' });

    checkIn.status = 'safe';
    checkIn.checkedInAt = new Date();
    await checkIn.save();
    res.json(checkIn);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDiscoveryQueue,
  swipeAction,
  getMatches,
  getMatchHistory,
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
  updateMatchSettings,
  toggleSavedProfile,
  getSavedProfiles,
  getNearbyUsers,
  getAiIcebreaker,
  getAiMatchSummary,
  saveDateAvailability,
  getDateAvailability,
  createDatePlan,
  getDatePlans,
  updateDatePlanStatus,
  createSafetyCheckIn,
  getSafetyCheckIns,
  markSafetyCheckInSafe
};
