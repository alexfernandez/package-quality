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
var requestLib = require('request');
var badges = require('../lib/badges.js');
var estimator = require('../lib/estimation.js');
var Log = require('log');

// globals
var log = new Log(config.logLevel);
var server;

exports.startServer = function(port, callback) {
    if (typeof port === 'function') {
        // no port
        callback = port;
        port = config.noMongoExpressPort;
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
	// no package list
    response.send([]);
}

function serveBadge (request, response) {
	var packageName = request.params['package'].replace(/.png$/, '');
	badges.compileBadge(packageName, (Math.random() * 10).toFixed(2), function (err, png) {
		response.send(png);
	});
}
function serve (request, response) {
    var npmPackage = request.params.package;
    var registryUrl = 'http://registry.npmjs.org/' + npmPackage;
    log.debug('Requesting info for package: %s', npmPackage);
    requestLib.get(registryUrl, function(error, getResponse, body)
    {
        if (error)
        {
            return response.status(403).send(error);
        }
        var registryResponse;
        try
        {
            registryResponse = JSON.parse(body);
        }
        catch(exception)
        {
            return response.status(403).send({error: 'package ' + npmPackage + ' not valid.'});
        }
        var entry = {
            name: registryResponse.name,
            repository: registryResponse.repository,
            description: registryResponse.description
        };
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
    });
}
