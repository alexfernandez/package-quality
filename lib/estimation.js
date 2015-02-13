'use strict';

/**
 * Read info about a package and estimate its quality.
 * (C) 2014 Alex Fernández.
 */

// requires
require('prototypes');
var config = require('../config.js');
var async = require('async');
var moment = require('moment');
var testing = require('testing');
var Log = require('log');

// globals
var log = new Log(config.logLevel);
var factors = {
	downloads: require('./factors/downloads.js'),
	issues: require('./factors/issues.js'),
	versions: require('./factors/versions.js')
};


/**
 * Estimates the quality of a package based on a number of factors.
 * @param entry[required]: an object describing a package as returned by http://registry.npmjs.org/-/all
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Returns an error if the entry is invalid (i.e. has no name)
 * or if any of the factors return an error. If there is no error, the result is always an object.
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
	log.info('Estimating package: ' + entry.name);
	var now = moment().format();
	var estimation = {
		name: entry.name,
		source: 'npm',
		created: now,
		lastUpdated: now,
		nextUpdate: now,
		timesUpdated: 0
	};
	// stream of factors
	var stream = [];
	// downloads
	stream.push(function (callback)
	{
		factors.downloads.estimate(entry.name, function(error, result) {
			if (error)
			{
				return callback(error);
			}
			estimation = estimation.concat(result);
			return callback(null);
		});
	});
	// issues
	stream.push(function (callback)
	{
		factors.issues.estimate(entry.repository, function(error, result) {
			if (error)
			{
				return callback(error);
			}
			// pending??
			if ('pending' in result)
			{
				result.pending.factor = 'issues';
				estimation.pending = estimation.pending && (estimation.pending instanceof Array) ? estimation.pending.concat(result.pending) : [result.pending];
				delete result.pending;
			}
			estimation = estimation.concat(result);
			return callback(null);
		});
	});
	// versions
	stream.push(function (callback)
	{
		factors.versions.estimate(entry.name, function(error, result) {
			if (error)
			{
				return callback(error);
			}
			estimation = estimation.concat(result);
			return callback(null);
		});
	});
	// async!!
	async.parallel(stream, function (error)
	{
		return callback(error, estimation);
	});
};

/**
 * Estimates the quality of some factors of a package that remained 'pending' after the estimation phase.
 * @param pending[required]: an array of pending objects, each indicating which factor they refer to.
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Returns an error if any of the pending factors return an error. 
 * If there is no error, the result is always an object.
 * Each key of the result object is the name of a measured 'pending' factor and the value is an array of two elements (both of 
 * them floats between 0.0 and 1.0): the first is the value of the estimated factor, and the second is the weight of 
 * this factor in the overall average.
 */
exports.pending = function(pending, callback)
{
	//stream of actions
	var stream = [];
	pending.forEach(function (pendingItem)
	{
		var factor = pendingItem.factor;
		if (factor && factors[factor] && typeof factors[factor].pending === 'function')
		{
			var estimation = {};
			stream.push(function (callback)
			{
				factors[factor].pending(pendingItem, function (error, result)
				{
					if (error)
					{
						return callback(error);
					}
					estimation = estimation.concat(result);
					return callback(null);
				});
			});
			//async!!
			async.parallel(stream, function (error)
			{
				return callback(error, estimation);
			});
		}
	});
};

/**
 * Calculates the total quality of an estimation and adds it to the given estimation object.
 * @param estimation[required]: the object with the different factors using the [quality, weight] format.
 * @return The estimation with the 'quality' field calculated and added
 */
exports.addQuality = function(estimation)
{
	var numerator = 0;
	var denominator = 0;
	estimation.quality = 0;
	for (var factor in estimation)
	{
		if (estimation[factor] instanceof Array && estimation[factor].length === 2)
		{
			var quality = estimation[factor][0];
			var weight = estimation[factor][1];
			if (quality === 0)
			{
				return estimation;
			}
			numerator += weight;
			denominator += weight/quality;
		}
	}
	if (denominator !== 0)
	{
		estimation.quality = numerator/denominator;
	}
	return estimation;
};

/**
 * Unit tests.
 */

/*function testEstimation(callback)
{
	var entry = require('../test/test_entry.json');
	exports.estimate(entry, function(error, result)
	{
		testing.check(error, 'Could not read %s', entry.name, callback);
		testing.assert(result, 'No result', callback);
		testing.assertEquals(result.name, entry.name, 'wrong name stored in result');
		testing.assertEquals(result.source, 'npm', 'wrong source stored in result');
		testing.assert(result.repoQuality > 0, 'the test entry has to return a positive repo quality', callback);
		testing.assert(result.downloadsQuality > 0, 'the test entry has to return a positive downloads quality', callback);
		testing.assert(result.versionsQuality > 0, 'the test entry has to return a positive versions quality', callback);
		testing.assertEquals(result.quality, result.repoQuality * result.downloadsQuality * result.versionsQuality, 'wrong consolidated quality stored in result');
		testing.success(callback);
	});
}*/

/**
 * Run all tests.
 */
/*exports.test = function(callback)
{
	testing.run([
		testEstimation,
	], 10000, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}*/

