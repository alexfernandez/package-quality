#!/usr/bin/env node
'use strict';

/**
 * Serve que quality of a required package using mongodb
 * (C) 2015 Diego Lafuente.
 */

// requires
var config = require('../config.js');
var express = require('express');
var db = require('../lib/db.js');
var Log = require('log');

// globals
var log = new Log(config.logLevel);
var packagesCollection;
var server;

exports.startServer = function(port, callback) {
	if (typeof port === 'function') {
		// no port
		callback = port;
		port = config.expressPort;
	}
	var app = express();
	// Enable JSONP
	app.set('jsonp callback', true);
	// GET requests
	app.get('/:package', serve);
	// connect to database
	db.addCallback(function(error, result) {
		if (error) {
            return callback(error);
        }
		packagesCollection = result.collection(config.packagesCollection);
		// serve
		server = app.listen(port, callback);
	});
};

exports.stopServer = function(callback) {
	if (!server) {
		log.info('No server to close');
		return callback(null);
	}
	server.close(function() {
		log.info('Server closed');
		callback(null);
	});
};

function serve (request, response) {
	var npmPackage = request.params.package;
	packagesCollection.findOne({name: npmPackage}, function(error, result) {
		if (error || !result) {
			return response.status(403).send({error: 'package ' + npmPackage + ' not found.'});
		}
		return response.jsonp(result);
	});
}

