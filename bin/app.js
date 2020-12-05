#!/usr/bin/env node
'use strict';

/**
 * Serve que quality of a required package using mongodb
 * (C) 2015 Diego Lafuente.
 */

// requires
require('prototypes');
var config = require('../config.js');
var server = require('../lib/server.js');
var Log = require('log');

// globals
var log = new Log(config.logLevel);

server.startServer(function(error)
{
	if (error) {
		return log.error('Could not start server: %s', error);
	}
	log.info('Server listening on port %s', config.expressPort);
});

