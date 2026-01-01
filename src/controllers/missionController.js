
const User = require('../models/user');

const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return someDate.getDate() === today.getDate() &&
    someDate.getMonth() === today.getMonth() &&
    someDate.getFullYear() === today.getFullYear();
};

const getMissionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({
      dailyLoginCompleted: isToday(user.dailyMissions.lastLogin),
      dailyShareCompleted: isToday(user.dailyMissions.lastShare),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const claimDailyLogin = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (isToday(user.dailyMissions.lastLogin)) {
      return res.status(400).json({ message: 'Daily login already claimed today' });
    }
    user.coins += 50;
    user.dailyMissions.lastLogin = new Date();
    await user.save();
    res.json({ message: 'Claimed 50 coins!', newBalance: user.coins });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const claimDailyShare = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (isToday(user.dailyMissions.lastShare)) {
      return res.status(400).json({ message: 'Daily share already claimed today' });
    }
    user.coins += 100;
    user.dailyMissions.lastShare = new Date();
    await user.save();
    res.json({ message: 'Claimed 100 coins!', newBalance: user.coins });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMissionStatus,
  claimDailyLogin,
  claimDailyShare
};