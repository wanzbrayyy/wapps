const CallSession = require('../models/callSession');
const { createNotification } = require('../services/notificationService');

const populateCall = (query) => query
  .populate('caller', 'username fullName profilePic')
  .populate('callee', 'username fullName profilePic')
  .populate('endedBy', 'username fullName');

const startCall = async (req, res) => {
  try {
    const { calleeId, callType = 'voice' } = req.body;
    if (!calleeId) return res.status(400).json({ message: 'calleeId is required' });

    const roomId = `${req.user.id}_${calleeId}_${Date.now()}`;
    const call = await CallSession.create({
      caller: req.user.id,
      callee: calleeId,
      callType,
      status: 'ringing',
      roomId
    });

    await createNotification({
      userId: calleeId,
      actorId: req.user.id,
      title: callType === 'video' ? 'Incoming video call' : 'Incoming voice call',
      body: `${req.user.username} is calling you`,
      type: 'call_invite',
      data: {
        callId: call._id.toString(),
        roomId,
        callType
      }
    });

    res.status(201).json(await populateCall(CallSession.findById(call._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const answerCall = async (req, res) => {
  try {
    const { accepted = true } = req.body;
    const call = await CallSession.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found' });
    if (call.callee.toString() !== req.user.id && call.caller.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    call.status = accepted ? 'accepted' : 'declined';
    if (accepted) call.answeredAt = new Date();
    if (!accepted) {
      call.endedAt = new Date();
      call.endedBy = req.user.id;
    }
    await call.save();

    res.json(await populateCall(CallSession.findById(call._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const endCall = async (req, res) => {
  try {
    const call = await CallSession.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found' });
    if (call.callee.toString() !== req.user.id && call.caller.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    call.status = 'ended';
    call.endedAt = new Date();
    call.endedBy = req.user.id;
    await call.save();

    res.json(await populateCall(CallSession.findById(call._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addSignal = async (req, res) => {
  try {
    const { kind, payload } = req.body;
    const call = await CallSession.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found' });
    if (call.callee.toString() !== req.user.id && call.caller.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    call.signals.push({
      sender: req.user.id,
      kind,
      payload
    });
    await call.save();

    res.json({ message: 'Signal stored', signals: call.signals.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyActiveCalls = async (req, res) => {
  try {
    const calls = await populateCall(
      CallSession.find({
        $or: [{ caller: req.user.id }, { callee: req.user.id }],
        status: { $in: ['initiated', 'ringing', 'accepted'] }
      }).sort({ createdAt: -1 })
    );

    res.json(calls);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  startCall,
  answerCall,
  endCall,
  addSignal,
  getMyActiveCalls
};
