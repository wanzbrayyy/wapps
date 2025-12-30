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
  console.log("User connected to socket");

  socket.on("setup", (userData) => {
    socket.join(userData._id);
    socket.emit("connected");
  });

  socket.on("join chat", (room) => {
    socket.join(room);
  });

  socket.on("new message", (newMessageReceived) => {
    var chat = newMessageReceived.chat;

    if (!chat.users) return;

    chat.users.forEach((user) => {
      if (user._id == newMessageReceived.sender._id) return;
      socket.in(user._id).emit("message received", newMessageReceived);
    });
  });

  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  socket.off("setup", (userData) => {
    console.log("User disconnected");
    socket.leave(userData._id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});