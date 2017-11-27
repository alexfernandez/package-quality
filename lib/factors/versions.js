'use strict';

/**
 * Estimates the quality of a package based on the number of versions.
 * (C) 2015 Diego Lafuente.
 */

// requires
require('prototypes');
var Log = require('log');
var utils = require('../utils.js');
var config = require('../../config.js');
var cache = require('../cache.js');
var requestLib = require('../cached-request.js');
var testing = require('testing');

// globals
var log = new Log(config.logLevel);

/**
 * Estimates the quality of a package based on the number of versions.
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
        versions: [0, 1]
    };
    var registryUrl = 'http://registry.npmjs.org/' + utils.urlEncodeRepoName(name);
    log.debug('Estimating versions with URL: %s', registryUrl);
    requestLib.get(registryUrl, true, function(error, response, body)
    {
        if (error)
        {
            return callback ('Could not read registry for ' + name + ' (' + registryUrl + '): ' + error);
        }
        var registryResponse;
        try
        {
            registryResponse = JSON.parse(body);
        }
        catch(exception)
        {
            return callback('Could not parse ' + name + ' registry response: ' + exception);
        }
        if (!registryResponse.versions)
        {
            return callback(null, estimation);
        }
        var totalVersions = registryResponse.versions.countProperties();
        log.debug('Versions %s', totalVersions);
        estimation.versions = [1 - 1 / totalVersions, 1];
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
    // stub requestLib.get
    requestLib.get = function(url, shouldCache, internalCallback) {
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
    // stub requestLib.get
    requestLib.get = function(url, shouldCache, internalCallback) {
        return internalCallback(null, null, 'invalid_json');
    };
    exports.estimate(entry, function (error, estimation) {
        testing.check(estimation, callback);
        testing.assert(error, 'if registry returns an error, the factor should return an error', callback);
        testing.success(callback);
    });
}

function testEstimateValidEntryNoVersions(callback)
{
    var entry = {
        name: 'valid'
    };
    // stub requestLib.get
    requestLib.get = function(url, shouldCache, internalCallback) {
        var response = {};
        return internalCallback(null, null, JSON.stringify(response));
    };
    exports.estimate(entry, function (error, estimation) {
        testing.check(error, callback);
        testing.assertEquals(estimation.versions[0], 0, 'wrong quality for this repo', callback);
        testing.success(callback);
    });
}

function testEstimateValidEntry(callback)
{
    var entry = {
        name: 'valid'
    };
    // stub requestLib.get
    requestLib.get = function(url, shouldCache, internalCallback) {
        var response = {versions: {version1: {},version2: {}}};
        return internalCallback(null, null, JSON.stringify(response));
    };
    exports.estimate(entry, function (error, estimation) {
        testing.check(error, callback);
        testing.assertEquals(estimation.versions[0], 0.5, 'wrong quality for this repo', callback);
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
        testEstimateValidEntryNoVersions,
        testEstimateValidEntry
    ], function (error, result) {
        cache.clearInterval();
        return callback(error, result);
    });
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
    exports.test(testing.show);
}
