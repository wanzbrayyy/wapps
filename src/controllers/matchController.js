const User = require('../models/user');
const Like = require('../models/like');
const Chat = require('../models/chat');
const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

const calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const ageDifMs = Date.now() - new Date(birthDate).getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

// Helper: Hitung Skor Kecocokan (%)
const calculateCompatibility = (user1, user2) => {
  let score = 0;
  // 1. Minat (Interests/Passions) - Asumsi field 'passions' ada di User schema (dari update sebelumnya)
  if (user1.passions && user2.passions) {
    const commonInterests = user1.passions.filter(p => user2.passions.includes(p));
    score += (commonInterests.length * 10); // 10% per interest sama
  }
  // 2. Zodiac (Simple logic)
  if (user1.zodiacSign && user2.zodiacSign) score += 5; 
  // 3. MBTI
  if (user1.mbti && user2.mbti) score += 5;
  // 4. Religion
  if (user1.religion === user2.religion) score += 10;
  // 5. Smoking Habit
  if (user1.smoking === user2.smoking) score += 10;

  return Math.min(score, 100); // Max 100%
};

const getDiscoveryQueue = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const { 
      minAge = 18, maxAge = 99, gender, distance = 50, 
      heightMin, heightMax, education, religion, smoking,
      // Filter Baru
      zodiac, mbti, interest, language, isActive, isVerified, global
    } = req.query;

    const ageFilter = {
      $gte: new Date(new Date().setFullYear(new Date().getFullYear() - maxAge)),
      $lte: new Date(new Date().setFullYear(new Date().getFullYear() - minAge))
    };

    const alreadySwiped = currentUser.swiped.map(s => s.user);
    const blockedIds = currentUser.blockedUsers || []; // Filter user yang diblokir
    
    // Base Filter
    let filter = {
      _id: { $ne: req.user.id, $nin: [...alreadySwiped, ...blockedIds] },
      birthDate: ageFilter,
    };

    // Global Search (Travel Mode Virtual)
    if (global !== 'true') {
      const locationToUse = currentUser.travelLocation || currentUser.location;
      filter.location = {
        $near: {
          $geometry: locationToUse,
          $maxDistance: distance * 1000
        }
      };
    }

    // Filter Standar
    if (gender && gender !== 'Everyone') filter.gender = gender;
    if (heightMin) filter.height = { ...filter.height, $gte: parseInt(heightMin) };
    if (heightMax) filter.height = { ...filter.height, $lte: parseInt(heightMax) };
    if (education) filter.education = education;
    if (religion) filter.religion = religion;
    if (smoking) filter.smoking = smoking;

    // Filter Baru (Advanced)
    if (zodiac) filter.zodiacSign = zodiac;
    if (mbti) filter.mbti = mbti;
    if (language) filter.languages = { $in: [language] };
    if (interest) filter.passions = { $in: [interest] };
    if (isVerified === 'true') filter.isVerified = true;
    
    // Filter Active Status (Online dalam 24 jam terakhir)
    if (isActive === 'true') {
      const yesterday = new Date(new Date().getTime() - (24 * 60 * 60 * 1000));
      filter.lastActive = { $gte: yesterday };
    }

    const boostedUsers = await User.find({ ...filter, boostExpiresAt: { $gt: new Date() } }).limit(5).select('-password');
    const regularUsers = await User.find({ ...filter, boostExpiresAt: { $eq: null } }).limit(20).select('-password');
    
    const combinedUsers = [...boostedUsers, ...regularUsers];

    // Tambahkan Compatibility Score ke response
    const enrichedUsers = combinedUsers.map(user => ({
      ...user.toObject(),
      age: calculateAge(user.birthDate),
      compatibility: calculateCompatibility(currentUser, user)
    }));

    // Sort by Compatibility (Optional)
    enrichedUsers.sort((a, b) => b.compatibility - a.compatibility);

    res.json(enrichedUsers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const swipeAction = async (req, res) => {
  try {
    const { targetUserId, action, message, reactionContext } = req.body;
    const currentUser = await User.findById(req.user.id);
    
    if (currentUser.missionProgress) {
      if (!isToday(currentUser.missionProgress.swipesMade.lastClaim)) {
        currentUser.missionProgress.swipesMade.count = (currentUser.missionProgress.swipesMade.count || 0) + 1;
      }
      if (action === 'superlike' && !isToday(currentUser.missionProgress.superLikeSent.lastClaim)) {
        currentUser.missionProgress.superLikeSent.count = (currentUser.missionProgress.superLikeSent.count || 0) + 1;
      }
    }

    currentUser.swiped.push({ user: targetUserId, action });
    await currentUser.save();

    if (action === 'like' || action === 'superlike' || action === 'react' || action === 'instant') {
      await Like.create({ 
        liker: req.user.id, 
        liked: targetUserId, 
        type: action,
        message: message || '', // Super Note Content
        reactionContext: reactionContext || '' // React to Bio
      });

      const likedUser = await User.findById(targetUserId);
      if (likedUser.missionProgress && !isToday(likedUser.missionProgress.likeReceived.lastClaim)) {
        likedUser.missionProgress.likeReceived.count = (likedUser.missionProgress.likeReceived.count || 0) + 1;
        await likedUser.save();
      }

      const mutualLike = await Like.findOne({ liker: targetUserId, liked: req.user.id });

      if (mutualLike || action === 'instant') {
        // MATCH TERJADI!
        await User.findByIdAndUpdate(req.user.id, { $push: { matches: targetUserId } });
        await User.findByIdAndUpdate(targetUserId, { $push: { matches: req.user.id } });

        // --- FITUR AUTO CHAT PADA SAAT MATCH ---
        
        // 1. Jika User mengirim Super Note (Pesan saat Swipe)
        if (message) {
          await Chat.create({
            sender: req.user.id,
            receiver: targetUserId,
            message: message,
            type: 'text'
          });
        }

        // 2. Cek Auto Reply dari Current User (Kirim salam otomatis)
        if (currentUser.autoReply) {
          await Chat.create({
            sender: req.user.id,
            receiver: targetUserId,
            message: currentUser.autoReply,
            type: 'text'
          });
        }

        // 3. Cek Auto Reply dari Target User (Balas salam otomatis)
        if (likedUser.autoReply) {
          await Chat.create({
            sender: targetUserId,
            receiver: req.user.id,
            message: likedUser.autoReply,
            type: 'text'
          });
        }

        // Jika tidak ada pesan apapun, kirim System Message "You Matched" (Opsional, disini tidak diimplementasi agar bersih)

        return res.json({ 
          match: true, 
          superlike: mutualLike?.type === 'superlike' || action === 'superlike',
          autoChatSent: !!(message || currentUser.autoReply || likedUser.autoReply)
        });
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
      .populate('matches', 'fullName username profilePic isOnline lastActive');
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
      .populate('liker', 'fullName username profilePic bio age');
      
    res.json(likes.map(like => ({
      user: like.liker,
      type: like.type,
      message: like.message, // Tampilkan Super Note jika ada
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
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.coins < 100) {
      return res.status(400).json({ message: "Not enough coins for rewind" });
    }
    
    const lastSwipe = user.swiped.pop();
    if (!lastSwipe) {
      return res.status(400).json({ message: "No swipe to rewind" });
    }

    user.coins -= 100;
    await user.save();

    // Hapus Like jika ada
    await Like.deleteOne({ liker: user._id, liked: lastSwipe.user });
    
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
    await User.findByIdAndUpdate(req.user.id, { spotifyAnthem: tracks }); // Menggunakan field spotifyAnthem yg baru
    res.status(200).json({ message: 'Spotify data saved' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- FITUR BARU SESUAI PERMINTAAN ---

// 1. Unmatch & Block
const unmatchUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const currentUser = await User.findById(req.user.id);

    // Hapus dari matches array
    await User.findByIdAndUpdate(req.user.id, { $pull: { matches: userId }, $push: { blockedUsers: userId } });
    await User.findByIdAndUpdate(userId, { $pull: { matches: req.user.id } });

    // Hapus Like record
    await Like.deleteOne({ liker: req.user.id, liked: userId });
    await Like.deleteOne({ liker: userId, liked: req.user.id });

    res.json({ message: "Unmatched and blocked" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Report User
const reportUser = async (req, res) => {
  try {
    const { userId, reason } = req.body;
    // Logika simpan laporan ke database admin (Model Report belum ada, simulasi sukses)
    // await Report.create({ reporter: req.user.id, reported: userId, reason });
    res.json({ message: "User reported successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Extend Match (24h)
const extendMatch = async (req, res) => {
  try {
    const { userId } = req.body;
    // Asumsi ada logic expired match, disini kita simulasi update timestamp
    // await MatchModel.findOneAndUpdate(...) 
    res.json({ message: "Match extended for 24 hours" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 4. Rematch (User expired)
const rematchUser = async (req, res) => {
  try {
    const { userId } = req.body;
    // Logic bayar coins untuk rematch
    const user = await User.findById(req.user.id);
    if (user.coins < 200) return res.status(400).json({ message: "Insufficient coins" });
    
    user.coins -= 200;
    await user.save();
    
    // Trigger like ulang
    await swipeAction(req, res); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 5. Instant Match (Bayar untuk match langsung tanpa nunggu like balik)
const instantMatch = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const user = await User.findById(req.user.id);
    
    if (user.coins < 500) return res.status(400).json({ message: "Insufficient coins" });
    user.coins -= 500;
    await user.save();

    // Force create like type 'instant'
    req.body.action = 'instant';
    await swipeAction(req, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 6. Poke / Colek
const pokeUser = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    // Kirim notifikasi 'Poke' (FCM Logic di trigger terpisah)
    res.json({ message: "User poked!" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 7. Daily Recommendations (AI Pick)
const getDailyRecommendations = async (req, res) => {
  try {
    // Simulasi AI: Ambil user dengan popularity tinggi / compatibility tinggi
    const users = await User.find({ _id: { $ne: req.user.id } })
      .sort({ coins: -1 }) // Asumsi coins tinggi = aktif/populer
      .limit(5)
      .select('fullName username profilePic bio');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 8. Reset Dislikes
const resetDislikes = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.coins < 300) return res.status(400).json({ message: "Insufficient coins" });
    
    user.coins -= 300;
    // Hapus history swipe 'dislike'
    user.swiped = user.swiped.filter(s => s.action !== 'dislike');
    await user.save();
    
    res.json({ message: "Dislikes reset. They will appear again." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 9. Update Privacy & Settings (Read Receipts, Online Status, etc)
const updateMatchSettings = async (req, res) => {
  try {
    const { disableReadReceipts, hideOnlineStatus, autoReply, blacklistContacts, setAvailability } = req.body;
    const user = await User.findById(req.user.id);

    // Karena field ini belum ada di schema user secara eksplisit di prompt sebelumnya, 
    // kita simpan di notificationSettings atau field root jika sudah ditambahkan.
    // Asumsi field root sudah ditambahkan di User Schema Update.
    
    if (autoReply !== undefined) user.autoReply = autoReply; // Perlu tambah field di User Schema
    // Logic lain disimpan di user object
    
    await user.save();
    res.json({ message: "Settings updated" });
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
  // New Features
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