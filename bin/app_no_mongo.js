#!/usr/bin/env node
'use strict';

/**
 * Serve que quality of a required package using the estimation package
 * (C) 2015 Diego Lafuente.
 */

// requires
var config = require('../config.js');
var express = require('express');
var estimation = require('../lib/estimation.js');
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
    // Enable JSONP
    app.set('jsonp callback', true);
    // GET requests
    app.get('/:package', serve);
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

function serve (request, response) {
    var npmPackage = request.params.package;
    var entry = all[npmPackage];
    if (!entry)
    {
        return response.status(403).send({error: 'package ' + npmPackage + ' not found.'});
    }
    estimation.estimate(entry, function(error, result)
    {
        if (error)
        {
            return response.status(403).send(error);
        }
        return response.jsonp(result);
    });
}