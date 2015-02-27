#!/usr/bin/env node
'use strict';

/**
 * Serve que quality of a required package using the estimation package
 * (C) 2015 Diego Lafuente.
 */

// requires
require('prototypes');
var path = require('path');
var config = require('../config.js');
var express = require('express');
var badges = require('../lib/badges.js');
var estimator = require('../lib/estimation.js');
var Log = require('log');

// globals
var log = new Log(config.logLevel);
var server;
var all;

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
    // read all.json
    log.info('loading all.json...');
    try
    {
        all = require('../all.json');
        delete all._updated;
    }
    catch(exception)
    {
        return callback('Could not parse all.json: ' + exception);
    }
    // start server
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

function servePackagesList (request, response) {
	var packages = Object.keys(all);
	response.send(packages);
}

function serveBadge (request, response) {
	var packageName = request.params['package'];
	badges.compileBadge(packageName, (Math.random() * 10).toFixed(1), function (err, str) {
		response.send('<img src="' + str + '"/>');
	});
}
function serve (request, response) {
    var npmPackage = request.params.package;
    var entry = all[npmPackage];
    if (!entry)
    {
        return response.status(403).send({error: 'package ' + npmPackage + ' not found.'});
    }
    estimator.estimate(entry, function(error, estimation)
    {
        if (error)
        {
            return response.status(403).send(error);
        }
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
}
