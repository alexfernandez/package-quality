'use strict';

/**
 * Estimates the quality of a package based on the number of versions.
 * (C) 2015 Diego Lafuente.
 */

// requires
require('prototypes');
var Log = require('log');
var config = require('../../config.js');
var request = require('request');
var testing = require('testing');

// globals
var log = new Log(config.logLevel);

/**
 * Estimates the quality of a package based on the number of versions.
 * @param name[required]: the name of the package
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Returns an error in case something fails. 
 * If the error is null, then the result is always object.
 * Each key of the result object is the name of a measured factor and the value is an array of two elements (both of 
 * them floats between 0.0 and 1.0): the first is the value of the estimated factor, and the second is the weight of 
 * this factor in the overall average.
 */
exports.estimate = function(name, callback)
{
    var estimation = {
        versions: [0, 1]
    };
    var registryUrl = 'http://registry.npmjs.org/' + name;
    log.debug('Estimating versions with URL: %s', registryUrl);
    request.get(registryUrl, function(error, response, body)
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
function testEstimateInvalidRepo(callback)
{
    // stub request.get
    request.get = function(url, internalCallback) {
        return internalCallback('error');
    };
    exports.estimate('invalidRepo', function (error, estimation) {
        testing.check(estimation, callback);
        testing.assert(error, 'invalid repo should return an error', callback);
        testing.success(callback);
    });
}

function testEstimateInvalidJson(callback)
{
    // stub request.get
    request.get = function(url, internalCallback) {
        return internalCallback(null, null, 'invalid_json');
    };
    exports.estimate('invalidRepo', function (error, estimation) {
        testing.check(estimation, callback);
        testing.assert(error, 'invalid repo should return an error', callback);
        testing.success(callback);
    });
}

function testEstimateValidRepoNoVersions(callback)
{
    // stub request.get
    request.get = function(url, internalCallback) {
        var response = {};
        return internalCallback(null, null, JSON.stringify(response));
    };
    exports.estimate('validRepoNoVersions', function (error, estimation) {
        testing.check(error, callback);
        testing.assertEquals(estimation.versions[0], 0, 'wrong quality for this repo', callback);
        testing.success(callback);
    });
}

function testEstimateValidRepo(callback)
{
    // stub request.get
    request.get = function(url, internalCallback) {
        var response = {versions: {version1: {},version2: {}}};
        return internalCallback(null, null, JSON.stringify(response));
    };
    exports.estimate('validRepo', function (error, estimation) {
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
        testEstimateInvalidRepo,
        testEstimateInvalidJson,
        testEstimateValidRepoNoVersions,
        testEstimateValidRepo
    ], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
    exports.test(testing.show);
}