'use strict';

/**
 * Estimates the quality of a package based on the number of downloads durin the last year.
 * (C) 2015 Diego Lafuente.
 */

// requires
var Log = require('log');
var config = require('../../config.js');
var request = require('request');
var moment = require('moment');
var testing = require('testing');

// globals
var log = new Log(config.logLevel);

/**
 * Estimates the quality of a package based on the number of downloads during last year.
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
        downloads: [0,1]
    };
    var now = moment();
    var aYearAgo = moment(now).subtract(1,'year');
    var downloadsUrl = 'http://npm-stat.com/downloads/range/' + aYearAgo.format('YYYY-MM-DD') + ':' + now.format('YYYY-MM-DD') + '/' + name;
    log.debug('Downloads URL: %s', downloadsUrl);
    request.get(downloadsUrl, function(error, response, body) {
        if (error || !body)
        {
            log.error('Could not read downloads for ' + name + ' (' + downloadsUrl + '): ' + error);
            return callback(null, estimation);
        }
        var npmstatResponse;
        try
        {
            npmstatResponse = JSON.parse(body);
        }
        catch(exception)
        {
            log.error('Could not parse ' + name + ': ' + exception);
            return callback(null, estimation);
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
function testEstimateInvalidRepo(callback)
{
    // stub request.get
    request.get = function(url, internalCallback) {
        return internalCallback('error');
    };
    exports.estimate('invalidRepo', function (error, estimation) {
        testing.check(error, callback);
        testing.assertEquals(estimation.downloads[0], 0, 'invalid repo should return quality 0', callback);
        testing.success(callback);
    });
}

function testEstimateValidRepo(callback)
{
    // stub request.get
    request.get = function(url, internalCallback) {
        var response = {downloads: [{downloads: 4}, {downloads: 6}]};
        return internalCallback(null, null, JSON.stringify(response));
    };
    exports.estimate('validRepo', function (error, estimation) {
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
        testEstimateInvalidRepo,
        testEstimateValidRepo
    ], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
    exports.test(testing.show);
}