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
		description: entry.description,
		source: 'npm',
		created: now,
		lastUpdated: now,
		nextUpdate: now,
		timesUpdated: 0
	};
	// stream of factors
	var stream = [];
	Object.keys(factors).forEach(function (factorName) {
		var factor = factors[factorName];
		stream.push(function (callback)
		{
			factor.estimate(entry, function(error, result) {
				if (error)
				{
					return callback(error);
				}
				estimation = estimation.concat(result);
				return callback(null);
			});
		});
	});
	// async!!
	async.parallel(stream, function (error)
	{
		if (error) {
			return callback(error);
		}
		return callback(null, estimation);
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
			var quality = typeof estimation[factor][0] === 'number' ? estimation[factor][0] : 0;
			var weight = typeof quality === 'number' ? estimation[factor][1] : 0;
			numerator += (weight * quality);
			denominator += weight;
		}
	}
	if (denominator !== 0)
	{
		estimation.quality = numerator/denominator;
	}
	return estimation;
};

/************************************************
 **************** UNIT TESTS ********************
 ************************************************/
function testEstimateInvalidEntry(callback)
{
	var entry = {};
	exports.estimate(entry, function (error, result) {
		testing.check(result, callback);
		testing.assert(error, 'invalid entry should alwasy return an error', callback);
		testing.success(callback);
	});
}

function testEstimateValidEntryOneFactorReturnsError(callback)
{
	var entry = require('../test/test_entry.json');
	// stub factors
	factors = {
		downloads: {
			estimate: function(name, internalCallback) {
				return internalCallback(null, {downloads: 1});
			}
		},
		issues: {
			estimate: function(repo, internalCallback) {
				return internalCallback({check:true});
			}
		},
		versions: {
			estimate: function(name, internalCallback) {
				return internalCallback(null, {versions: 3});
			}
		},
	};
	exports.estimate(entry, function (error, result) {
		testing.check(result, callback);
		testing.assert(error.check, 'estimate did not return the right error when factor failed', callback);
		testing.success(callback);
	});
}

function testEstimateValidEntry(callback)
{
	var entry = require('../test/test_entry.json');
	// stub moment
	var restore_moment = moment;
	moment = function() {
		return {
			format: function() {
				return 'now';
			}
		};
	};
	// stub factors
	factors = {
		downloads: {
			estimate: function(name, internalCallback) {
				return internalCallback(null, {downloads: 1});
			}
		},
		issues: {
			estimate: function(repo, internalCallback) {
				return internalCallback(null, {issues: 2});
			}
		},
		versions: {
			estimate: function(name, internalCallback) {
				return internalCallback(null, {versions: 3});
			}
		},
	};
	exports.estimate(entry, function (error, result) {
		testing.check(error, callback);
		testing.assertEquals(result.name, entry.name, 'wrong name returned in estimation', callback);
		testing.assertEquals(result.source, 'npm', 'wrong source returned in estimation', callback);
		testing.assertEquals(result.created, 'now', 'wrong created returned in estimation', callback);
		testing.assertEquals(result.lastUpdated, 'now', 'wrong lastUpdated returned in estimation', callback);
		testing.assertEquals(result.nextUpdate, 'now', 'wrong nextUpdate returned in estimation', callback);
		testing.assertEquals(result.timesUpdated, 0, 'wrong timesUpdated returned in estimation', callback);
		testing.assertEquals(result.downloads, 1, 'wrong downloads returned in estimation', callback);
		testing.assertEquals(result.issues, 2, 'wrong issues returned in estimation', callback);
		testing.assertEquals(result.versions, 3, 'wrong versions returned in estimation', callback);
		// restore moment
		moment = restore_moment;
		testing.success(callback);
	});
}

function testAddQuality(callback)
{
	var estimation = {};
	var result = exports.addQuality(estimation);
	testing.assertEquals(result.quality, 0, 'empty estimation should return zero quality', callback);
	estimation = {kkfu:'tennis', kkfu2:[1,2,3]};
	result = exports.addQuality(estimation);
	testing.assertEquals(result.quality, 0, 'estimation with invalid factors should return zero quality', callback);
	testing.assertEquals(result.kkfu, 'tennis', 'estimation with invalid factors should keep kkfu factor', callback);
	testing.assertEquals(result.kkfu2.length, 3, 'estimation with invalid factors should keep kkfu2 factor', callback);
	estimation.valid = [1,1];
	result = exports.addQuality(estimation);
	testing.assertEquals(result.quality, 1, 'estimation with invalid factors should return a proper quality', callback);
	testing.assertEquals(result.kkfu, 'tennis', 'estimation with invalid factors should keep kkfu factor', callback);
	testing.assertEquals(result.kkfu2.length, 3, 'estimation with invalid factors should keep kkfu2 factor', callback);
	testing.assertEquals(result.valid.length, 2, 'estimation with invalid factors should keep valid factor', callback);
	testing.success(callback);
}

function testAddQualityInfinity(callback)
{
	var estimation = require('../test/gulp-filter.json');
	var result = exports.addQuality(estimation);
	log.info(result.quality);
	testing.assert(result.quality < 1, 'quality must always be lower than 1.0', callback);
	testing.assert(result.quality > 0, 'quality must always be higher than 0.0', callback);
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	testing.run([
		testEstimateInvalidEntry,
		testEstimateValidEntryOneFactorReturnsError,
		testEstimateValidEntry,
		testAddQuality,
		testAddQualityInfinity
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

