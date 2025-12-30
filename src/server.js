require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');

connectDB();

const server = http.createServer(app);

const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("setup", (userData) => {
    socket.join(userData._id);
    socket.emit("connected");
  });

  socket.on("join chat", (room) => {
    socket.join(room);
  });

  // Typing Indicators
  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  // New Message
  socket.on("new message", (newMessageReceived) => {
    var chat = newMessageReceived;
    if (!chat.receiver) return;
    socket.in(chat.receiver._id).emit("message received", newMessageReceived);
  });

  // Screen Sharing Signals (WebRTC Relay)
  socket.on("screen_signal", (data) => {
    // data: { roomId, signal, senderId }
    socket.to(data.roomId).emit("screen_signal_received", data);
  });
  
  // Room Live Events
  socket.on("join_room_live", (roomId) => {
    socket.join(roomId);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});