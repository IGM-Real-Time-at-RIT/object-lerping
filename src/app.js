const http = require('http');
const socketio = require('socket.io');
const xxh = require('xxhashjs');

const fs = require('fs');

const PORT = process.env.PORT || process.env.NODE_PORT || 3000;

const handler = (req, res) => {
  /** read our file ASYNCHRONOUSLY from the file system. This is much
     lower performance, but allows us to reload the page changes during
	 development. First parameter is the file to read, second is the
	 callback to run when it's read ASYNCHRONOUSLY **/
  fs.readFile(`${__dirname}/../client/index.html`, (err, data) => {
    // if err, throw it for now
    if (err) {
      throw err;
    }
    res.writeHead(200);
    res.end(data);
  });
};

const app = http.createServer(handler);
const io = socketio(app);

app.listen(PORT);

io.on('connection', (sock) => {
  const socket = sock;
  socket.join('room1');
  
  socket.square = {
    hash: xxh.h32(`${socket.id}${new Date().getTime()}`, 0xCAFEBABE).toString(16),
    lastUpdate: new Date().getTime(),
    x: 0,
    y: 0,
    height: 100,
    width: 100,
  };
  
  socket.emit('joined', socket.square);

  socket.on('movementUpdate', (data) => {
    socket.square = data;
    socket.square.lastUpdate = new Date().getTime();
    
    //io.sockets.in('room1').emit('updatedMovement', socket.square);
    socket.broadcast.to('room1').emit('updatedMovement', socket.square);
  });

  socket.on('disconnect', () => {
    io.sockets.in('room1').emit('left', socket.square.hash);
  
    socket.leave('room1');
  });
});

console.log(`listening on port ${PORT}`);
