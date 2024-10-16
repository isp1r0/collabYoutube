var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var cookieSession = require('cookie-session')

var mongoose = require('mongoose');

var http = require('http');
var debug = require('debug')('collabYoutube:server');

var passport = require('passport');
var flash    = require('connect-flash');
var cors = require('cors');
var uuid = require('node-uuid');


//var users = require('/routes/users');

var configDB = require('./config/database.js');

// configuration ===============================================================


mongoose.connect(configDB.url || process.env.MONGOLAB_URI); // connect to our database




var app = express();

var Room = require('./models/room.js');


/**
 * Create HTTP server.
 */

var server = http.createServer(app);

var io = require('socket.io')(server);

var port = normalizePort(process.env.PORT || '3000');



// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

app.use(cors());

/*
app.use(session({
  secret: 'thatrealprotectedsecret',
  saveUninitialized: true,
  proxy: true,
  resave: true,

})); // session
*/

app.set('trust proxy', 1) // trust first proxy

app.use(cookieSession({
  name: 'session',
  keys: ['key1', 'key2']
}));

// This allows you to set req.session.maxAge to let certain sessions
// have a different value than the default.
/*app.use(function (req, res, next) {
  req.sessionOptions.maxAge = req.session.maxAge || req.sessionOptions.maxAge
})*/

//app.use(favicon(__dirname + '/public/images/favicon.ico'));
app.use(logger('dev'));
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));



/*if (app.get('env') === 'production') {
  session.cookie.maxAge = 1000*60*60;
  session.cookie.secure = true // serve secure cookies
}*/
//app.get('*', routes.index);

require('./routes/routes.js')(app, passport);

require('./config/passport')(passport);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

app.set('port', port);


/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

var counter = 0;
var people = {};
var rooms = {};
var clients = [];

io.sockets.on('connection', function(clientSocket){
  console.log("connected");


  clientSocket.on('join', function (name) {
    roomID = null;

    console.log(name);
    people[clientSocket.id] = {
      "name": name,
      "room": roomID,
      ready: false
    };

    clientSocket.emit("update", "You have sucessfully connected to the server")

    io.sockets.emit("update", people[clientSocket.id].name + " is online.");
    io.sockets.emit("update-people", people);

    clientSocket.emit("roomList", {rooms: rooms});

    clients.push(clientSocket);


  });

  clientSocket.on('createRoom', function (name) {

    if(people[clientSocket.id].room == null){
      var id = uuid.v4();
      var room = new Room(name, id, clientSocket.id);
      rooms[id] = room;
      io.sockets.emit("roomList", {rooms: rooms});

      clientSocket.room = name;
      people[clientSocket.id].room = name;
      people[clientSocket.id].ready = true;
      clientSocket.join(clientSocket.room);
      room.addPerson(clientSocket.id);
      clientSocket.emit("roomCreation", id);
      clientSocket.emit("updateRoom", {id: id, room: rooms[id]});
    }
    else{
      io.sockets.emit("update", "Sorry, you can only create one room");
    }

  });

  clientSocket.on('joinRoom', function (id) {

    console.log("ID " + id);
    var room = rooms[id];

    if(clientSocket.id == room.owner){
      clientSocket.emit("update", "You are the owner, and already joined this room");
    }
    else{
      room.people.contains(clientSocket.id, function(found){
        if(found){
          clientSocket.emit("update", "You have already joined this room");
        }
        else{
          if(people[clientSocket.id].inroom !== undefined){
            clientSocket.emit("update", "You are already in one room (" + rooms[people[clientSocket.id].inroom].name+"), please leave it first to join another room.");
          }
          else {
            room.addPerson(clientSocket.id);
            people[clientSocket.id].inroom = id;
            clientSocket.room = room.name;
            clientSocket.join(clientSocket.room); //add person to the room
            user = people[clientSocket.id];
            io.sockets.in(clientSocket.room).emit("update", user.name + " has connected to " + room.name + " room.");
            io.sockets.in(clientSocket.room).emit("clientJoin", user.name + " has connected to " + room.name + " room.");
            clientSocket.emit("update", "Welcome to " + room.name + ".");
            clientSocket.emit("sendRoomID", {id: id});
          }
        }
      });
    }
  });

  clientSocket.on("leaveRoom", function(id) {
    var room = rooms[id];
    if (clientSocket.id === room.owner) {
      var i = 0;
      while(i < clients.length) {
        if(clients[i].id == room.people[i]) {
          people[clients[i].id].inroom = null;
          clients[i].leave(room.name);
        }
        ++i;
      }
      delete rooms[id];
      people[room.owner].owns = null; //reset the owns object to null so new room can be added
      io.sockets.emit("roomList", {rooms: rooms});
      io.sockets.in(clientSocket.room).emit("update", "The owner (" +user.name + ") is leaving the room. The room is removed.");
    } else {
      room.people.contains(clientSocket.id, function(found) {
        if (found) { //make sure that the client is in fact part of this room
          var personIndex = room.people.indexOf(clientSocket.id);
          room.people.splice(personIndex, 1);
          io.sockets.in(clientSocket.room).emit("userLeaveRoom", people[clientSocket.id].name);
          io.sockets.emit("update", people[clientSocket.id].name + " has left the room.");
          clientSocket.leave(room.name);
        }
      });
    }
  });

  /*clientSocket.on("disconnect", function() {
    if (people[clientSocket.id]) {
      if (people[clientSocket.id].inroom === null) {
        io.sockets.emit("update", people[clientSocket.id].name + " has left the server.");
        delete people[clientSocket.id];
        io.sockets.emit("update-people", people);
      } else {
        if (people[clientSocket.id].owns !== null) {
          var room= rooms[people[clientSocket.id].owns];
          if (room && clientSocket.id === room.owner) {
            var i = 0;
            while(i < clients.length) {
              if (clients[i].id === room.people[i]) {
                people[clients[i].id].inroom = null;
                clients[i].leave(room.name);
              }
              ++i;
            }
            delete rooms[people[clientSocket.id].owns];
          }

        }
        io.sockets.in(clientSocket.room).emit("userLeaveRoom", people[clientSocket.id].name);
        io.sockets.emit("update", people[clientSocket.id].name + " has left the server.");
        delete people[clientSocket.id];
        io.sockets.emit("update-people", people);
        io.sockets.emit("roomList", {rooms: rooms});
      }
    }
  });*/

  clientSocket.on('readyState', function (id, callback) {

    console.log("on: " + JSON.stringify(rooms[id.room]) + " with: " + id.room);
    var name = rooms[id.room].name;
    io.sockets.in(name).emit("ready", id.url);

  });

  clientSocket.on('retrieveUserNames', function (id, callback) {

    var room = rooms[id];
    var names = [];

    console.log(room);
    room.people.forEach(function(user){
      names.push({name: people[user].name, ready: people[user].ready});
      console.log(people[user].name );

    })

    callback("error", names);

  });

  clientSocket.on('roomExists', function (id, callback) {

    var room = rooms[id];
    var names = [];

    console.log("room: " + id);

    if(room !== undefined){
      callback("error", true);
    }
    else
      callback("error", false);



  });

  clientSocket.on('isRoomOwner', function (id, callback) {

    var room = rooms[id];
    var names = [];

    console.log("room: " + id);

    console.log("user: " + clientSocket.id);

    if(room.owner == clientSocket.id){
      callback("error", true);
    }
    else
      callback("error", false);



  });

  clientSocket.on('clientReady', function (id, callback) {

    var room = rooms[id];
    var names = [];
    var name = rooms[id].name;


    console.log("room: " + id);

    console.log("user: " + clientSocket.id);

    people[clientSocket.id].ready = true;

    io.sockets.in(name).emit("clientIsReady", people[clientSocket.id].name);



  });

  clientSocket.on('playVideo', function (data, callback) {

    console.log(JSON.stringify(data));
    var room = rooms[data.room];
    var video_url = data.url;
    var name = rooms[data.room].name

    console.log("room: " + data.room);

    console.log("user: " + clientSocket.id);
    console.log("video: " + video_url);

    io.sockets.in(name).emit("play", video_url);



  });

  clientSocket.on('pauseVideo', function (data, callback) {

    console.log(JSON.stringify(data));
    var room = rooms[data.room];
    var video_url = data.url;
    var name = rooms[data.room].name


    io.sockets.in(name).emit("pause", video_url);



  });


  counter++;

  console.log("connections: ", counter);

  clientSocket.on('disconnect', function(){
    counter--;
    console.log("disconnected");
    console.log("connections: ", counter);
  });
});

module.exports = app;

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
      ? 'Pipe ' + port
      : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
      ? 'pipe ' + addr
      : 'port ' + addr.port;
  debug('Listening on ' + bind);
}

Array.prototype.contains = function(k, callback) {
  var self = this;
  return (function check(i) {
    if (i >= self.length) {
      return callback(false);
    }
    if (self[i] === k) {
      return callback(true);
    }
    return process.nextTick(check.bind(null, i+1));
  }(0));
};