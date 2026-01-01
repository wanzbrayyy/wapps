
const User = require('../models/user');

const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

const getMissionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('missionProgress');
    const missions = user.missionProgress;

    // Reset counts if the day has passed
    const today = new Date();
    Object.keys(missions.toObject()).forEach(key => {
      const mission = missions[key];
      if (mission && mission.lastClaim && !isToday(mission.lastClaim)) {
        if (mission.count !== undefined) mission.count = 0;
      }
    });
    await user.save();

    res.json({
      dailyLogin: { completed: isToday(missions.lastLoginClaim) },
      send10Messages: { completed: isToday(missions.messagesSent.lastClaim), progress: missions.messagesSent.count, goal: 10 },
      swipe20Times: { completed: isToday(missions.swipesMade.lastClaim), progress: missions.swipesMade.count, goal: 20 },
      sendSuperLike: { completed: isToday(missions.superLikeSent.lastClaim), progress: missions.superLikeSent.count, goal: 1 },
      join3Rooms: { completed: isToday(missions.roomsJoined.lastClaim), progress: missions.roomsJoined.count, goal: 3 },
      sendRoomMessage: { completed: isToday(missions.roomMessageSent.lastClaim), progress: missions.roomMessageSent.count, goal: 1 },
      sendGift: { completed: isToday(missions.giftSent.lastClaim), progress: missions.giftSent.count, goal: 1 },
      updateProfile: { completed: isToday(missions.profileUpdated.lastClaim) },
      getFirstLike: { completed: isToday(missions.likeReceived.lastClaim), progress: missions.likeReceived.count, goal: 1 },
      shareApp: { completed: isToday(missions.appShared.lastClaim) },
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const claimMission = async (req, res) => {
  try {
    const { missionType } = req.body;
    const user = await User.findById(req.user.id);
    const missions = user.missionProgress;
    let reward = 0;
    let message = '';
    let alreadyClaimed = false;

    switch (missionType) {
      case 'dailyLogin':
        if (isToday(missions.lastLoginClaim)) alreadyClaimed = true;
        else { reward = 50; missions.lastLoginClaim = new Date(); message = "Daily Login claimed!"; }
        break;
      case 'send10Messages':
        if (isToday(missions.messagesSent.lastClaim)) alreadyClaimed = true;
        else if (missions.messagesSent.count >= 10) { reward = 100; missions.messagesSent.lastClaim = new Date(); message = "Send 10 Messages claimed!"; }
        break;
      case 'swipe20Times':
        if (isToday(missions.swipesMade.lastClaim)) alreadyClaimed = true;
        else if (missions.swipesMade.count >= 20) { reward = 75; missions.swipesMade.lastClaim = new Date(); message = "Swipe 20 Times claimed!"; }
        break;
      case 'shareApp':
        if (isToday(missions.appShared.lastClaim)) alreadyClaimed = true;
        else { reward = 250; missions.appShared.lastClaim = new Date(); message = "Share App claimed!"; }
        break;
      default:
        return res.status(400).json({ message: 'Invalid mission type' });
    }

    if (alreadyClaimed) return res.status(400).json({ message: 'Mission already claimed today' });
    if (reward === 0) return res.status(400).json({ message: 'Mission not yet completed' });

    user.coins += reward;
    await user.save();
    res.json({ message, newBalance: user.coins });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getMissionStatus, claimMission };