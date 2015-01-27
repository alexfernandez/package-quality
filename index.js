'use strict';

/**
 * Starts the server.
 * (C) 2014 Alex Fernández.
 */


// requires
var app = process.argv[2] === "no_mongo" ? require('./bin/app_no_mongo.js') : require('./bin/app.js');

app.startServer(function(){});


