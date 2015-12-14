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
var estimator = require('../lib/estimation.js');
var async = require('async');
var moment = require('moment');
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
	packages.find(packageName, function(error, result) {
		if (error) {
			return response.status(503).send({error: 'database not available'});
		}
		if (!result) {
			return response.status(403).send({error: 'package ' + packageName + ' not found'});
		}
		badges.compileBadge(packageName, (result.quality * 100).toFixed(2), function (error, png) {
			if (error) {
				return response.status(503).send({error: 'database not available'});
			}
			response.setHeader('Content-type', 'image/png');
			response.send(png);
		});
	});
}

function serveShield(request, response) {
	var packageName = request.params['package'].substringUpToLast('.');
	packages.find(packageName, function(error, result) {
		if (error)
		{
			return response.status(503).send({error: 'database not available'});
		}
		if (!result) {
			return response.status(403).send({error: 'package ' + packageName + ' not found'});
		}
		var queryString = request.url.substringFrom('?');
		var score = Math.round((result.quality || 0) * 100);
		badges.retrieveShield(packageName, score, queryString, function (error, svg) {
			if (error) {
				return response.status(503).send({error: 'database not available'});
			}
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
	var mainStream = [];
	// look for the package in the registry
	mainStream.push(function (callback) {
		packages.findInNpmRegistry(npmPackage, function (error, result) {
			if (error) {
				log.debug('npm registry error', error);
				return callback(error);
			}
			if (!result) {
				packages.remove(npmPackage, function(){});
				return callback('package ' + npmPackage + ' not found.');
			}
			return callback(null, result);
		});
	});
	// find the package in mongo
	mainStream.push(function (entry, callback) {
		packages.find(entry.name, function(error, dbRecord) {
			if (error || !dbRecord) {
				// not found,  go to next step
				return callback(null, entry, dbRecord, /*stop?*/ false);
			}
			// package found, return first
			callback(null, entry, dbRecord, /*stop?*/ true);
			// check if expired
			var now = moment();
			var lastUpdated = moment(dbRecord.lastUpdated);
			if (now.diff(lastUpdated, 'seconds') > config.packageExpiration) {
				// expired, add to pending
				packages.updatePending(entry, function() {});
			}
		});
	});
	// estimate quality or return
	mainStream.push(function (entry, result, stop, callback) {
		// stop?
		if (stop) {
			return callback(null, entry, result, stop);
		}
		// estimate
		estimator.estimate(entry, function(error, estimation)
        {
            if (error) {
            	// at least one factor returned an error. Add entry to the pendingCollection
            	packages.updatePending(entry, function() {});
                // return result if it exists, the error otherwise
                if (result) {
                	return callback(null, entry, result, /*stop*/ true);
                }
                return callback(error);
            }
            return callback(null, entry, estimator.addQuality(estimation), /*stop?*/ false);
        });
	});
	// update database with most recent estimation
	mainStream.push(function (entry, estimation, stop, callback) {
		// stop?
		if (stop) {
			return callback(null, estimation);
		}
		packages.update(estimation, function (error) {
			if (error) {
				// something happened while trying to update the packages collection. Add to pending
				packages.updatePending(entry, function() {});
			}
			return callback(null, estimation);
		});
	});
	// run mainStream
	async.waterfall(mainStream, function(error, estimation) {
		if (error) {
			return response.status(403).send({error: error});
		}
		return response.jsonp(estimation);
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

