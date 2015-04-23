#!/usr/bin/env node
'use strict';

/**
 * Update only pending packages (those in the pending collection)
 * (C) 2015 Diego Lafuente.
 */

// requires
require('prototypes');
var config = require('../config.js');
var packages = require('../lib/packages.js');
var estimator = require('../lib/estimation.js');
var async = require('async');
var moment = require('moment');
var packages = require('../lib/packages');
var Log = require('log');
var testing = require('testing');

// globals
var log = new Log(config.logLevel);
var limit = config.limit;

/**
 * Go over all the packages in pending collection and update them.
 * The only constraint is the 5000 requests per hour allowed by the GitHub API
 * @param callback[required]: a function(error, result) with the results of the process
 */
exports.goOver = function(callback)
{
	packages.listAllPending(function (error, pending) {
		if (error) {
			return callback(error);
		}
		var numberOfPackages = pending.length;
		limit = (limit === null) || (numberOfPackages < limit) ? numberOfPackages : limit;
		var chunks = [];
		for (var j = 0; j < Math.ceil(numberOfPackages/limit); j++)
		{
			chunks.push([]);
		}
		var packageCount = 0;
		pending.forEach(function (entry)
		{
			var index = Math.floor(packageCount/limit);
			chunks[index].push(getEstimator(entry));
			packageCount++;
		});
		log.debug('number of chunks: ' + chunks.length);
		var series = [];
		while (chunks.length)
		{
			series.push(getChunkProcessor(chunks.shift()));
		}
		log.debug('series has length ' + series.length);
		async.series(series, function(error)
		{
			if (error)
			{
				callback(error);
			}
			callback(null, series.length);
		});
	});
};

function getEstimator(entry)
{
	return function(callback)
	{
		estimator.estimate(entry, function (error, estimation)
		{
			if (error)
			{
				return callback(error);
			}
			estimation.lastUpdated = moment().format();
			return callback (null, estimation);
		});
	};
}

function getChunkProcessor(chunk)
{
	return function(callback)
	{
		log.info('About to process chunk: ' + chunk.length);
		async.parallel(chunk, function(error, estimations)
		{
			if (error)
			{
				log.error('Chunk processed with error ', error);
				return callback(error);
			}
			log.info('Chunk processed.');
			estimations.forEach(function (estimation)
			{
				if (!estimation || estimation.countProperties() === 0)
				{
					return;
				}
				// update database and remove pending
				packages.update(estimator.addQuality(estimation), function(error)
				{
					if (error)
					{
						log.error('Package ' + estimation.name + ' could not be upserted in the database: ' + JSON.stringify(error));
					}
					// remove entry from pending
					packages.removePending(estimation.name, function() {
						return callback(null);
					});
				});
			});
		});
	};
}

/************************************************
 **************** UNIT TESTS ********************
 ************************************************/
function testEstimatorError(callback)
{
		var newEntry = {name: 'newEntry'};
		// stubs
		estimator = {
			estimate: function(entry, internalCallback) {
				testing.assertEquals(entry.name, newEntry.name, 'wrong entry passed to estimate', callback);
				return internalCallback('some crazy error');
			}
		};
		packages.setTestMode(function(error)
		{
			testing.check(error, callback);
			var theEstimator = getEstimator(newEntry);
			theEstimator(function(error, estimation) {
				testing.check(estimation, callback);
				testing.assertEquals(error, 'some crazy error', 'wrong error returned by the estimator', callback);
				testing.success(callback);
			});
		});
}

function testEstimatorSuccess(callback)
{
		var newEntry = {name: 'newEntry'};
		var now = moment();
		// stubs
		estimator = {
			estimate: function(entry, internalCallback) {
				testing.assertEquals(entry.name, newEntry.name, 'wrong entry passed to estimate', callback);
				return internalCallback(null, {});
			}
		};
		var restoreMoment = moment;
		moment = function () 
		{
			return now;
		};
		packages.setTestMode(function(error)
		{
			testing.check(error, callback);
			var theEstimator = getEstimator(newEntry);
			theEstimator(function(error, estimation) {
				testing.check(error, callback);
				testing.assertEquals(estimation.lastUpdated, now.format(), 'wrong estimation lastUpdate returned by the estimator', callback);
				moment = restoreMoment;
				testing.success(callback);
			});
		});
}

function testClose(callback)
{
	packages.close(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	testing.run([
		testEstimatorError,
		testEstimatorSuccess,
		testClose,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

