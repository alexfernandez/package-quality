#!/usr/bin/env node
'use strict';

/**
 * Serve que quality of a required package using mongodb
 * (C) 2015 Diego Lafuente.
 */

// requires
var path = require('path');
var config = require('../config.js');
var express = require('express');
var db = require('../lib/db.js');
var badges = require('../lib/badges.js');
var estimator = require('../lib/estimation.js');
var async = require('async');
var moment = require('moment');
var packages = require('../lib/packages.js');
var Log = require('log');

// globals
var log = new Log(config.logLevel);
var packagesCollection;
var updateCollection;
var server;
var githubApiRemainingCalls = 9999999;

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
	// connect to database
	db.addCallback(function(error, result) {
		if (error) {
            return callback(error);
        }
		packagesCollection = result.collection(config.packagesCollection);
		updateCollection = result.collection(config.updateCollection);
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
		if (error || !result) {
			delete result._id;
			return response.status(403).send({error: 'package ' + packageName + ' not found.'});
		}
		badges.compileBadge(packageName, (result.quality * 100).toFixed(2), function (err, png) {
			response.setHeader('Content-type', 'image/png');
			response.send(png);
		});
	});
}

function servePackagesList (request, response) {
	packagesCollection.find({}, {name: true}).toArray(function(error, result) {
		if (error) {
			response.send(500);
			return;
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
		packages.find({
			name: npmPackage
		}, function (error, result) {
			if (error) {
				return callback(error);
			}
			if (!result) {
				return callback('package ' + npmPackage + ' not found.');
			}
			return callback(error, result);
		});
	});
	// find the package in mongo
	mainStream.push(function (entry, callback) {
		packagesCollection.findOne({name: entry.name}, function(error, dbRecord) {
			if (error || !dbRecord) {
				// not found, add it to the update collection and go to next step
				updateCollection.update({name: entry.name}, {'$set':entry}, {upsert: true});
				return callback(null, entry, dbRecord, /*stop?*/ false););
			}
			// package found, check if expired
			var now = moment();
			var lastUpdated = moment(dbRecord.lastUpdated);
			if (now.diff(lastUpdated, 'seconds') > config.packageExpiration) {
				// expired, try to refresh
				return callback(null, entry, dbRecord, /*stop?*/ false);
			}
			// not expired, return result
			return callback(null, entry, dbRecord, /*stop?*/ true);
		});
	});
	// estimate quality or return
	mainStream.push(function (entry, dbRecord, stop, callback) {
		// stop?
		if (stop) {
			return callback(null, entry, dbRecord, stop);
		}
		// check if githubApiRemainingCalls is zero
		if (githubApiRemainingCalls === 0) {
			if (dbRecord)
		}
		// estimate
		estimator.estimate(entry, function(error, estimation)
        {
            if (error) {
                //return dbRecord if it exists, the error otherwise
                if (dbRecord) {
                	return callback((null, entry, dbRecord, /*stop*/ true);
                }
                return callback(error);
            }
            // update githubApiRemainingCalls
            githubApiRemainingCalls = estimation.githubApiRemainingCalls;
            // remove non-factor fields
            delete estimation.created;
            delete estimation.githubApiRemainingCalls;
            delete estimation.githubApiResetLimit;
            delete estimation.lastUpdated;
            delete estimation.name;
            delete estimation.nextUpdate;
            delete estimation.source;
            delete estimation.timesUpdated;
            // pending??
            if (estimation.pending)
            {
                estimator.pending(estimation.pending, function (error, pendingEstimation)
                {
                    delete pendingEstimation.githubApiRemainingCalls;
                    delete pendingEstimation.githubApiResetLimit;
                    delete estimation.pending;
                    return response.jsonp(estimator.addQuality(estimation.concat(pendingEstimation)));
                });
            }
            else
            {
                return response.jsonp(estimator.addQuality(estimation));
            }
        });
	});
	// run mainStream
	async.waterfall(mainStream, function(error, result) {
		if (error) {
			return response.status(403).send({error: error});
		}
		delete result._id;
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

