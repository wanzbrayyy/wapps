const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const roomRoutes = require('./routes/roomRoutes');
const matchRoutes = require('./routes/matchRoutes');
const missionRoutes = require('./routes/missionRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Menangkap error "Unhandled Rejection: [object Object]" agar terbaca di Log
process.on('unhandledRejection', (reason, promise) => {
  console.error("🔥 Critical Unhandled Rejection:", JSON.stringify(reason, null, 2));
  if (reason instanceof Error) console.error(reason.stack);
});

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fix 404 Halaman Utama
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: "Wapps API is Running", 
    status: "OK", 
    timestamp: new Date().toISOString() 
  });
});

// Fix 404 Favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/missions', missionRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;