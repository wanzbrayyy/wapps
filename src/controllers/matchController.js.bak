const User = require('../models/user');
const Like = require('../models/like');

const calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const ageDifMs = Date.now() - new Date(birthDate).getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

const getDiscoveryQueue = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const { minAge = 18, maxAge = 99, gender, distance = 50, heightMin, heightMax, education, religion, smoking } = req.query;

    const ageFilter = {
      $gte: new Date(new Date().setFullYear(new Date().getFullYear() - maxAge)),
      $lte: new Date(new Date().setFullYear(new Date().getFullYear() - minAge))
    };

    const alreadySwiped = currentUser.swiped.map(s => s.user);
    const locationToUse = currentUser.travelLocation || currentUser.location;

    let filter = {
      _id: { $ne: req.user.id, $nin: alreadySwiped },
      birthDate: ageFilter,
      location: {
        $near: {
          $geometry: locationToUse,
          $maxDistance: distance * 1000
        }
      }
    };

    if (gender && gender !== 'Everyone') filter.gender = gender;
    if (heightMin) filter.height = { ...filter.height, $gte: parseInt(heightMin) };
    if (heightMax) filter.height = { ...filter.height, $lte: parseInt(heightMax) };
    if (education) filter.education = education;
    if (religion) filter.religion = religion;
    if (smoking) filter.smoking = smoking;
    
    const boostedUsers = await User.find({ ...filter, boostExpiresAt: { $gt: new Date() } }).limit(5).select('-password');
    const regularUsers = await User.find({ ...filter, boostExpiresAt: { $eq: null } }).limit(20).select('-password');
    
    const combinedUsers = [...boostedUsers, ...regularUsers];

    res.json(combinedUsers.map(user => ({
      ...user.toObject(),
      age: calculateAge(user.birthDate)
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const swipeAction = async (req, res) => {
  try {
    const { targetUserId, action } = req.body;
    
    await User.findByIdAndUpdate(req.user.id, { $push: { swiped: { user: targetUserId, action } } });

    if (action === 'like' || action === 'superlike') {
      await Like.create({ liker: req.user.id, liked: targetUserId, type: action });
      const mutualLike = await Like.findOne({ liker: targetUserId, liked: req.user.id });

      if (mutualLike) {
        await User.findByIdAndUpdate(req.user.id, { $push: { matches: targetUserId } });
        await User.findByIdAndUpdate(targetUserId, { $push: { matches: req.user.id } });
        return res.json({ match: true, superlike: mutualLike.type === 'superlike' || action === 'superlike' });
      }
    }
    res.json({ match: false });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMatches = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('matches', 'fullName username profilePic');
    res.json(user.matches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWhoLikedMe = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const alreadySwiped = currentUser.swiped.map(s => s.user);

    const likes = await Like.find({ liked: req.user.id, liker: { $nin: alreadySwiped } })
      .populate('liker', 'fullName username profilePic');
      
    res.json(likes.map(like => like.liker));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const logProfileVisit = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    if (targetUserId === req.user.id) return res.status(200).send();
    
    await User.findByIdAndUpdate(
      targetUserId,
      {
        $push: {
          profileVisitors: {
            $each: [{ user: req.user.id, date: new Date() }],
            $slice: -50
          }
        }
      }
    );
    res.status(200).json({ message: 'Visit logged' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const findBlindDate = async (req, res) => {
  try {
    const potentialPartners = await User.find({ _id: { $ne: req.user.id } }).limit(10); 
    if (potentialPartners.length === 0) return res.status(404).json({ message: 'No users available' });
    const partner = potentialPartners[Math.floor(Math.random() * potentialPartners.length)];
    res.json({ partnerId: partner._id, username: partner.username });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTopPicks = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } }).limit(10).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const rewindLastSwipe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const lastSwipe = user.swiped.pop();
    if (lastSwipe) {
      if (lastSwipe.action === 'like' || lastSwipe.action === 'superlike') {
        await Like.deleteOne({ liker: user._id, liked: lastSwipe.user });
      }
      await user.save();
    }
    res.status(200).json({ message: 'Rewind successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const activateBoost = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      boostExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    res.status(200).json({ message: 'Boost activated for 30 minutes' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const setTravelMode = async (req, res) => {
  try {
    const { coordinates, enabled } = req.body;
    let update = {};
    if (enabled && coordinates) {
      update.travelLocation = { type: 'Point', coordinates };
    } else {
      update.travelLocation = null;
    }
    await User.findByIdAndUpdate(req.user.id, { $set: update });
    res.status(200).json({ message: 'Travel mode updated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const saveSpotifyData = async (req, res) => {
  try {
    const { tracks } = req.body;
    await User.findByIdAndUpdate(req.user.id, { spotifyTopTracks: tracks });
    res.status(200).json({ message: 'Spotify data saved' });
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
  saveSpotifyData
};