'use strict';

/**
 * Estimates the quality of a package based on the number of downloads durin the last year.
 * (C) 2015 Diego Lafuente.
 */

// requires
var Log = require('log');
var config = require('../../config.js');
var utils = require('../utils.js');
var request = require('request');
var moment = require('moment');
var testing = require('testing');

// globals
var log = new Log(config.logLevel);

/**
 * Estimates the quality of a package based on the number of downloads during last year.
 * @param entry[required]: an object describing a package as returned by http://registry.npmjs.org/-/all
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Returns an error in case something fails. 
 * If the error is null, then the result is always object.
 * Each key of the result object is the name of a measured factor and the value is an array of two elements (both of 
 * them floats between 0.0 and 1.0): the first is the value of the estimated factor, and the second is the weight of 
 * this factor in the overall average.
 */
exports.estimate = function(entry, callback)
{
    if (!entry || !entry.name)
    {
        log.error('null entry or entry without name: ' + JSON.stringify(entry));
        return callback(JSON.stringify(entry) + ' is null or has no name');
    }
    var name = entry.name;
    var estimation = {
        downloads: [0,1]
    };
    var now = moment();
    var aYearAgo = moment(now).subtract(1,'year');
    var downloadsUrl = 'http://npm-stat.com/downloads/range/' + aYearAgo.format('YYYY-MM-DD') + ':' + now.format('YYYY-MM-DD') + '/' + utils.urlEncodeRepoName(name);
    log.debug('Downloads URL: %s', downloadsUrl);
    request.get(downloadsUrl, function(error, response, body) {
        if (error || !body)
        {
            return callback('Could not read downloads for ' + name + ' (' + downloadsUrl + '): ' + error);
        }
        var npmstatResponse;
        try
        {
            npmstatResponse = JSON.parse(body);
        }
        catch(exception)
        {
            return callback('Could not parse ' + name + ': ' + exception);
        }
        var quality = 0;
        if ('downloads' in npmstatResponse) {
            var downloads = 0;
            npmstatResponse.downloads.forEach(function(item) {
                downloads += item.downloads;
            });
            log.debug('Downloads %s', downloads);
            quality = 1 - 1/downloads;
        }
        estimation.downloads = [quality, 1];
        return callback(null, estimation);
    });
};

/************************************************
 **************** UNIT TESTS ********************
 ************************************************/
 function testEstimateInvalidEntry(callback)
{
    exports.estimate({}, function (error, estimation) {
        testing.check(estimation, callback);
        testing.assert(error, 'invalid entry should return an error', callback);
        testing.success(callback);
    });
}
function testEstimateInvalidPackageName(callback)
{
    var entry = {
        name: 'invalid'
    };
    // stub request.get
    request.get = function(url, internalCallback) {
        return internalCallback('error');
    };
    exports.estimate(entry, function (error, estimation) {
        testing.check(estimation, callback);
        testing.assert(error, 'invalid repo should return an error', callback);
        testing.success(callback);
    });
}

function testEstimateInvalidJsonReturnedByRegistry(callback)
{
    var entry = {
        name: 'valid'
    };
    // stub request.get
    request.get = function(url, internalCallback) {
        return internalCallback(null, null, 'invalid_json');
    };
    exports.estimate(entry, function (error, estimation) {
        testing.check(estimation, callback);
        testing.assert(error, 'if registry returns an error, the factor should return an error', callback);
        testing.success(callback);
    });
}

function testEstimateValidEntry(callback)
{
    var entry = {
        name: 'valid'
    };
    // stub request.get
    request.get = function(url, internalCallback) {
        var response = {downloads: [{downloads: 4}, {downloads: 6}]};
        return internalCallback(null, null, JSON.stringify(response));
    };
    exports.estimate(entry, function (error, estimation) {
        testing.check(error, callback);
        testing.assertEquals(estimation.downloads[0], 0.9, 'wrong quality for this repo', callback);
        testing.success(callback);
    });
}

 /**
 * Run all tests.
 */
exports.test = function(callback)
{
    testing.run([
        testEstimateInvalidEntry,
        testEstimateInvalidPackageName,
        testEstimateInvalidJsonReturnedByRegistry,
        testEstimateValidEntry
    ], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
    exports.test(testing.show);
}
