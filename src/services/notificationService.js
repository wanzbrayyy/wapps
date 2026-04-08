const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const Notification = require('../models/notification');
const User = require('../models/user');

const hasFirebaseConfig = () => Boolean(
  process.env.FCM_PROJECT_ID &&
  process.env.FCM_CLIENT_EMAIL &&
  process.env.FCM_PRIVATE_KEY
);

const getFirebaseAccessToken = async () => {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.FCM_CLIENT_EMAIL,
      private_key: (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  return accessTokenResponse?.token || accessTokenResponse;
};

const sendPushMessage = async ({ token, title, body, data = {} }) => {
  if (!hasFirebaseConfig()) {
    return { status: 'skipped', reason: 'firebase_config_missing' };
  }

  if (!token) {
    return { status: 'skipped', reason: 'fcm_token_missing' };
  }

  const accessToken = await getFirebaseAccessToken();
  const projectId = process.env.FCM_PROJECT_ID;

  await axios.post(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      message: {
        token,
        notification: { title, body },
        data: Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, String(value ?? '')])
        )
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return { status: 'sent' };
};

const createNotification = async ({
  userId,
  actorId = null,
  title,
  body,
  type = 'system',
  data = {}
}) => {
  if (!userId || !title || !body) return null;

  const notification = await Notification.create({
    user: userId,
    actor: actorId,
    title,
    body,
    type,
    data
  });

  try {
    const user = await User.findById(userId).select('fcmToken notificationSettings');
    const pushResult = await sendPushMessage({
      token: user?.fcmToken,
      title,
      body,
      data: {
        type,
        notificationId: notification._id.toString(),
        ...data
      }
    });

    notification.pushStatus = pushResult.status;
    if (pushResult.status === 'sent') {
      notification.deliveredAt = new Date();
    }
    await notification.save();
  } catch (error) {
    notification.pushStatus = 'failed';
    await notification.save();
  }

  return Notification.findById(notification._id)
    .populate('actor', 'username fullName profilePic');
};

module.exports = {
  createNotification,
  sendPushMessage
};
