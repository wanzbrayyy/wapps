const User = require('../models/user');
const Like = require('../models/like');

const calculateAge = (birthDate) => {
  const ageDifMs = Date.now() - new Date(birthDate).getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

const getDiscoveryQueue = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);

    const { minAge = 18, maxAge = 99, gender, distance = 50 } = req.query; // distance in km

    const ageFilter = {
      $gte: new Date(new Date().setFullYear(new Date().getFullYear() - maxAge)),
      $lte: new Date(new Date().setFullYear(new Date().getFullYear() - minAge))
    };

    const alreadySwiped = currentUser.swiped.map(s => s.user);

    let filter = {
      _id: { $ne: req.user.id, $nin: alreadySwiped },
      birthDate: ageFilter,
      location: {
        $near: {
          $geometry: currentUser.location,
          $maxDistance: distance * 1000 // convert km to meters
        }
      }
    };

    if (gender && gender !== 'Everyone') {
      filter.gender = gender;
    }
    
    const users = await User.find(filter)
      .select('fullName username profilePic bio birthDate zodiac mbti')
      .limit(20);

    const usersWithCompatibility = users.map(user => {
      let score = 50;
      if (currentUser.zodiac && user.zodiac && currentUser.zodiac === user.zodiac) score += 25;
      if (currentUser.mbti && user.mbti && currentUser.mbti === user.mbti) score += 25;
      
      return {
        ...user.toObject(),
        age: calculateAge(user.birthDate),
        compatibility: score
      };
    });

    res.json(usersWithCompatibility);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const swipeAction = async (req, res) => {
  try {
    const { targetUserId, action } = req.body;
    const currentUser = await User.findById(req.user.id);

    currentUser.swiped.push({ user: targetUserId, action });
    await currentUser.save();

    if (action === 'like') {
      await Like.create({ liker: req.user.id, liked: targetUserId });

      const mutualLike = await Like.findOne({ liker: targetUserId, liked: req.user.id });

      if (mutualLike) {
        await User.findByIdAndUpdate(req.user.id, { $push: { matches: targetUserId } });
        await User.findByIdAndUpdate(targetUserId, { $push: { matches: req.user.id } });
        return res.json({ match: true });
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
            $slice: -50 // Keep only the last 50 visitors
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
    // This is a simplified version. A real-world scenario would use a queue system (e.g., Redis)
    const currentUser = await User.findById(req.user.id);
    const potentialPartners = await User.find({
      _id: { $ne: req.user.id },
      // Add criteria: online status, not matched, not swiped etc.
    }).limit(10); 
    
    if (potentialPartners.length === 0) {
      return res.status(404).json({ message: 'No users available for blind date now' });
    }

    const partner = potentialPartners[Math.floor(Math.random() * potentialPartners.length)];
    
    res.json({
      message: 'Partner found!',
      partnerId: partner._id,
      username: partner.username
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
};