#!/usr/bin/env node
'use strict';

/**
 * Serve que quality of a required package using mongodb
 * (C) 2015 Diego Lafuente.
 */

// requires
require('prototypes');
var path = require('path');
var config = require('../config.js');
var express = require('express');
var db = require('../lib/db.js');
var badges = require('../lib/badges.js');
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
	// Static files
	app.use(express.static(path.join(__dirname, '..', 'app')));
	// Enable JSONP
	app.set('jsonp callback', true);
	// GET requests
	app.get('/package/:package', serve);
	app.get('/packages', servePackagesList);
    app.get('/badge/:package', serveBadge);
    app.get('/shield/:package', serveShield);
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

function serveBadge (request, response) {
	var packageName = request.params['package'].replace(/.png$/, '');
	packagesCollection.findOne({name: packageName}, function(error, result) {
		if (error) {
			return response.status(503).send({error: 'database not available'});
		}
		if (!result) {
			return response.status(403).send({error: 'package ' + packageName + ' not found'});
		}
		badges.compileBadge(packageName, (result.quality * 100).toFixed(2), function (err, png) {
			response.setHeader('Content-type', 'image/png');
			response.send(png);
		});
	});
}

function serveShield(request, response) {
	var packageName = request.params['package'].substringUpTo('.');
	packagesCollection.findOne({name: packageName}, function(error, result) {
		if (error)
		{
			return response.status(503).send({error: 'database not available'});
		}
		if (!result) {
			return response.status(403).send({error: 'package ' + packageName + ' not found'});
		}
		badges.compileShield(packageName, (result.quality * 100).toFixed(2), function (err, svg) {
			response.setHeader('Content-type', 'image/svg');
			response.send(svg);
		});
	});
}

function servePackagesList (request, response) {
	packagesCollection.find({}, {name: true}).toArray(function(error, result) {
		if (error) {
			return response.status(503).send({error: 'database not available'});
		}
		var packages = (result || []).map(function (pkg) {
			return pkg.name;
		});
		response.send(packages);
	});
}

function serve (request, response) {
	var npmPackage = request.params.package;
	packagesCollection.findOne({name: npmPackage}, function(error, result) {
		if (error) {
			return response.status(503).send({error: 'database not available'});
		}
		if (!result) {
			return response.status(403).send({error: 'package ' + npmPackage + ' not found.'});
		}
		return response.jsonp(result);
	});
}

// run if invoked directly
if (__filename == process.argv[1])
{
	exports.startServer(function(error)
	{
		if (error)
		{
			log.error('Could not start server: %s', error);
		}
	});
}

