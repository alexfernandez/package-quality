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
 * @return This method returns through the callback parameter. Error is always null, and result is always object.
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
            log.error('Could not read registry for ' + name + ' (' + registryUrl + '): ' + error);
            return callback(null, estimation);
        }
        var registryResponse;
        try
        {
            registryResponse = JSON.parse(body);
        }
        catch(exception)
        {
            log.debug('Could not parse ' + name + ' registry response: ' + exception);
            return callback(null, estimation);
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