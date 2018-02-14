const http = require('http');
const socketio = require('socket.io');
const fs = require('fs');
/**
 Library for the xxhash library to generate xxhash string
 https://cyan4973.github.io/xxHash/
 
 All I use this for is quick hashing
 https://en.wikipedia.org/wiki/Hash_function
 
 I want to give each user a unique ID that can be 
 used to identify one app object vs another. 
 You could do this in any way you want as long as they are
 guaranteed unique. 
 
 I used xxhash because it's a reliable algorithm (not secure)
 that generates a unique key at close to limits of ram speed. 
 
 This makes it incredibly fast and lightweight, but again
 you could use any unique identifier you want.
**/
const xxh = require('xxhashjs');

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

//start http server and get HTTP server instance
const app = http.createServer(handler);
/**
  pass http server instance into socketio to get 
  a websocket server instance running inside our
  http server. We do this so socket.io can host
  the client-side script that we import in the browser
  and so it runs on the same port/address as our HTTP server.
  
  DON'T PASS THE HTTP MODULE itself. 
**/
const io = socketio(app);

app.listen(PORT); //start listening

//for each new socket connection
io.on('connection', (sock) => {
  const socket = sock;
  //joining into hard-coded room for this app
  //app users in room1
  socket.join('room1');
  
  /**
    Attach a "square" object to each socket (each connection/user).
    Technically a user could have multiple connections, but in our app
    they only have. 
    
    This is directly attaching to the socket instead of having an object,
    which is not necessarily the best option. In fact it could be messy, but
    this does mean each socket will have a square object and we don't have
    to worry about management since each socket will be deleted by socket.io
    when no longer needed. 
    
    Plus we can guarantee that every socket has a square and only one square. 
    We don't have to figure out which square is a user because we always know
    which socket is a individual user's. If it's attached to their socket, it's
    theirs. 
    
    The caveat to this is that we are tying our code to socket.io which is a bit
    of bad practice. This does mean behind the scenes, the JS engine will be holding
    a class for socket and a class for socket with a square property (separate class).
    
    It also could conflict with socket.io if socket.io used a 'square' variable.
    
    By doing this, we avoid having to do look ups in a user list or data structure
    for each user's square. We also avoid having to figure out which square goes
    to which socket, but it all comes at a cost.
    
    I would not always do this because of the cost.
  **/
  
  //Giving each square a 'hash' (or alternatively a userId field) that is guaranteed
  //unique. The xxh function takes a string/buffer to encode and a seed to use for generation.
  //The string can be any string or buffer (in our case the socket's built-in id combined with time).
  //I'm using socket's built-in Id (which is unique until the user disconnects) and combining
  //it with the time to make the guarantee of it being unique higher. 
  //The seed can be any number in hex. It does not matter.
  //This will get us a hex value that we can convert to a string with toString(16)
  socket.square = {
    hash: xxh.h32(`${socket.id}${new Date().getTime()}`, 0xCAFEBABE).toString(16),
    lastUpdate: new Date().getTime(), //last time this object was updated
    x: 0, //default x value of this square
    y: 0, //default y value of this square
    prevX: 0, //default x value of the last known position
    prevY: 0, //default y value of the last known position
    destX: 0, //default x value of the desired next x position
    destY: 0, //default y value of the desired next y position
    alpha: 0, //default alpha (how far this object is % from prev to dest)
    height: 100, //default height
    width: 100, //default width
  };
  
  //send the user a joined event sending them their new square.
  //This square object on exists server side. Properties of the socket
  //are not the same on both the client and server.
  socket.emit('joined', socket.square);

  //when we receive a movement update from the client
  socket.on('movementUpdate', (data) => {
    //currently data will be the entire square object from the client
    //We really want to avoid that if possible, but it will work for
    //this example. So data is the entire object.
    //Additionally we are not validating any data. Any invalid data
    //could break our server/clients (if x position is a jpeg for example)
    //We are blindly trusting the data for now and overriding this 
    //socket's square with the client's square
    socket.square = data;
    //we do update the time though, so we know the last time this is updated
    socket.square.lastUpdate = new Date().getTime();
    
    //could send to everyone including ourselves, but we probably don't need to
    //That user should already have the latest info of themselves 
    //UNLESS their data is invalid and we decide to force override their stuff.
    //io.sockets.in('room1').emit('updatedMovement', socket.square);
    
    //instead we will broadcast to everyone EXCEPT the user who sent us the data
    //In some implementations we may prefer the emit to all to confirm with the 
    //client who sent it. Otherwise it's unnecessary traffic, so I skipped it.
    socket.broadcast.to('room1').emit('updatedMovement', socket.square);
    
    //If we as the server want to forcefully override a person's screen
    //(resetting their position on their screen) because of collision
    //or something, we can do that. Sometimes a user might lag or not
    //have accurate info so they will seem up to date on their screen
    //but we need to rubber-band them back to a valid position.
    //socket.emit('updatedMovement', socket.square);
  });

  //when a user disconnects, we want to make sure we let everyone know
  //and ask them to remove the object 
  socket.on('disconnect', () => {
    //ask users to remove the extra object on their side by sending the object id
    io.sockets.in('room1').emit('left', socket.square.hash);
  
    //remove this socket from the room
    socket.leave('room1');
  });
});

console.log(`listening on port ${PORT}`);
