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
var badges = require('../lib/badges.js');
var packages = require('../lib/packages.js');
var Log = require('log');

// globals
var log = new Log(config.logLevel);
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
	// serve
	server = app.listen(port, callback);
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
	packages.findPackage(packageName, function(error, result) {
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
	packages.findPackage(packageName, function(error, result) {
		if (error)
		{
			return response.status(503).send({error: 'database not available'});
		}
		if (!result) {
			return response.status(403).send({error: 'package ' + packageName + ' not found'});
		}
		var queryString = request.url.substringFrom('?');
		var score = Math.round((result.quality || 0) * 100) / 100;
		badges.retrieveShield(packageName, score, queryString, function (err, svg) {
			response.setHeader('Content-type', 'image/svg+xml');
			response.send(svg);
		});
	});
}

function servePackagesList (request, response) {
	packages.listAll(function(error, result) {
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
	packages.findPackage(npmPackage, function(error, result) {
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

