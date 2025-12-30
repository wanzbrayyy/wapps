const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const roomRoutes = require('./routes/roomRoutes');
const matchRoutes = require('./routes/matchRoutes'); // Import new route
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/match', matchRoutes); // Register new route

app.use(notFound);
app.use(errorHandler);

module.exports = app;