#!/usr/bin/env node
'use strict';

/**
 * Go over all packages and estimate quality for all.
 * (C) 2014 Alex Fernández.
 */

// requires
require('prototypes');
var config = require('../config.js');
var db = require('../lib/db.js');
var estimator = require('../lib/estimation.js');
var async = require('async');
var moment = require('moment');
var testing = require('testing');
var Log = require('log');

// globals
var log = new Log(config.logLevel);
var limit = config.limit;
var packagesCollection;

/**
 * Go over all the packages in all.json and update mongo.
 * There are two constraints:
 *   - Github only allows 5000 requests per hour.
 *   - We should use config.limit to avoid RangeErrors in the stack size
 * @param offset[optional]: offset over the all.json file. Defaults to zero.
 * @param callback[required]: a function(error, result) with the results of the process
 */
exports.goOver = function(offset, callback)
{
	if (typeof offset === 'function') {
		callback = offset;
		offset = 0;
	}
	var all;
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
	log.info('all.json loaded');
	var names = Object.keys(all);
	log.info('All packages: ' + names.length);
	if (offset)
	{
		log.info('Offset ' + offset);
		for (var i=0; i<offset; i++)
		{
			delete all[names.shift()];
		}
	}
	var numberOfPackages = names.length;
	log.info('All packages after offset: ' + numberOfPackages);
	limit = (limit === null) || (numberOfPackages < limit) ? numberOfPackages : limit;
	var chunks = [];
	for (var j = 0; j < Math.ceil(numberOfPackages/limit); j++)
	{
		chunks.push([]);
	}
	var packageCount = 0;
	for (var name in all)
	{
		var entry = all[name];
		var index = Math.floor(packageCount/limit);
		chunks[index].push(getEstimator(entry));
		packageCount++;
		delete all[name];
	}
	log.debug('number of chunks: ' + chunks.length);
	db.addCallback(function(error, result)
	{
        if (error) {
            return callback(error);
        }
        packagesCollection = result.collection(config.packagesCollection);
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
		estimator.estimate(entry, callback);
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
			// Adjust pending, remaining calls, etc
			var pendings = [];
			var updates = [];
			var githubApiRemainingCalls = 9999999;
			var githubApiResetLimit;
			estimations.forEach(function (estimation)
			{
				if (estimation.githubApiRemainingCalls < githubApiRemainingCalls)
				{
					githubApiRemainingCalls = estimation.githubApiRemainingCalls;
					githubApiResetLimit = estimation.githubApiResetLimit;
				}
				delete estimation.githubApiRemainingCalls;
				delete estimation.githubApiResetLimit;
				if (estimation.pending)
				{
					var item = {
						pending: estimation.pending
					};
					delete estimation.pending;
					item.previousEstimation = estimation;
					pendings.push(item);
				}
				else
				{
					var finalEstimation = estimator.addQuality(estimation);
					updates.push(finalEstimation);
				}
			});
			// process updates, and then pendings
			var updatesPendingsStream = [];
			updatesPendingsStream.push(function (callback)
			{
				processUpdates(updates, callback);
			});
			updatesPendingsStream.push(function (result, callback)
			{
				processPendings(pendings, githubApiRemainingCalls, githubApiResetLimit, callback);
			});
			async.waterfall(updatesPendingsStream, function (error, result)
			{
				githubApiRemainingCalls = result.githubApiRemainingCalls;
				githubApiResetLimit = result.githubApiResetLimit;
				// check remaining api calls.
				if (githubApiRemainingCalls < limit)
				{
					var now = moment().unix();
					if (githubApiResetLimit > now)
					{
						var millisecondsToWait = (githubApiResetLimit - now) * 1000;
						log.info('Waiting ' + millisecondsToWait + ' milliseconds until next chunk');
						setTimeout(function()
						{
							return callback(null);
						}, millisecondsToWait);
					}
					else
					{
						return callback(null);
					}
				}
				else
				{
					return callback(null);
				}
			});
		});
	};
}

var processUpdates = function (estimations, callback)
{
	var updatesStream = [];
	estimations.forEach(function (estimation)
	{
		updatesStream.push(function (callback)
		{
			packagesCollection.update({name: estimation.name}, {'$set':estimation}, {upsert: true}, function(error)
			{
				if (error)
				{
					log.error('Package ' + estimation.name + ' could not be upserted in the database: ' + JSON.stringify(error));
				}
				return callback(null);
			});
		});
	});
	async.parallel(updatesStream, callback);
};

var processPendings = function (pendings, githubApiRemainingCalls, githubApiResetLimit, callback)
{
	// stream the pending stuff	
	var pendingStream = [];
	pendings.forEach(function (pendingItem)
	{
		// only pending issues so far
		pendingStream.push(function (callback)
		{
			log.info('Processing pending for ' + pendingItem.previousEstimation.name);
			// function to process pending item
			function processPendingItem(pendingItem)
			{
				estimator.pending(pendingItem.pending, function (error, pendingEstimation)
				{
					githubApiRemainingCalls = pendingEstimation.githubApiRemainingCalls;
					githubApiResetLimit = pendingEstimation.githubApiResetLimit;
					delete pendingEstimation.githubApiRemainingCalls;
					delete pendingEstimation.githubApiResetLimit;
					var finalEstimation = estimator.addQuality(pendingItem.previousEstimation.concat(pendingEstimation));
					packagesCollection.update({name: finalEstimation.name}, {'$set':finalEstimation}, {upsert: true}, function(error)
					{
						if (error)
						{
							log.error('Package ' + finalEstimation.name + ' could not be upserted in the database: ' + JSON.stringify(error));
						}
						return callback(null);
					});
				});
			}
			// pending API calls
			var apiCallsForThisPending = pendingItem.pending[0].pages[1] - pendingItem.pending[0].pages[0] + 1;
			// check remaining api calls.
			if (githubApiRemainingCalls < apiCallsForThisPending)
			{
				var now = moment().unix();
				if (githubApiResetLimit > now)
				{
					var millisecondsToWait = (githubApiResetLimit - now) * 1000;
					log.info('Waiting in pendings ' + millisecondsToWait + ' milliseconds until next pending');
					setTimeout(function()
					{
						processPendingItem(pendingItem);
					}, millisecondsToWait);
				}
				else
				{
					processPendingItem(pendingItem);
				}
			}
			else
			{
				processPendingItem(pendingItem);
			}
		});
	});
	// run pending stream
	async.series(pendingStream, function()
	{
		return callback (null, {
			githubApiRemainingCalls: githubApiRemainingCalls,
			githubApiResetLimit: githubApiResetLimit
		});
	});
};

/************************************************
 **************** UNIT TESTS ********************
 ************************************************/
function testProcessUpdates(callback)
{
	var estimations = [
		{name: 'name1', check: 1},
		{name: 'name2', check: 2}
	];
	// stub packagesCollection
	packagesCollection = {
		update: function(query, update, options, internalCallback) {
			testing.assertEquals(typeof query.name, 'string', 'wrong type passed as query.name to db.update', callback);
			testing.assert(options.upsert, 'upsert should be set to true', callback);
			if (query.name === 'name1') {
				testing.assertEquals(update.$set.check, 1, 'wrong element passed as name1', callback);
			}
			else {
				testing.assertEquals(update.$set.check, 2, 'wrong element passed as name2', callback);
			}
			internalCallback(null);
		}
	};
	processUpdates(estimations, function(error) {
		testing.check(error, callback);
		testing.success(callback);
	});
}

function testProcessPendings(callback)
{
	var pendings = [
		{previousEstimation: {name: 'name1'},
		pending:[{pages:[1, 3]}]}
	];
	var githubApiRemainingCalls = 10;
	var githubApiResetLimit = 100;
	// stub estimator.pending
	estimator.pending = function(pending, internalCallback) {
		testing.assertEquals(pending[0].pages[0], 1, 'wrong start page in pending', callback);
		testing.assertEquals(pending[0].pages[1], 3, 'wrong end page in pending', callback);
		internalCallback(null, {check: 1,
			githubApiRemainingCalls: githubApiRemainingCalls,
			githubApiResetLimit: githubApiResetLimit});
	};
	// stub packagesCollection
	packagesCollection = {
		update: function(query, update, options, internalCallback) {
			testing.assertEquals(query.name, 'name1', 'wrong name passed to db.update', callback);
			testing.assert(options.upsert, 'upsert should be set to true', callback);
			testing.assertEquals(update.$set.check, 1, 'wrong element passed as name1', callback);
			internalCallback(null);
		}
	};
	processPendings(pendings, 0, 0, function (error, result)
	{
		testing.check(error, callback);
		testing.assertEquals(result.githubApiRemainingCalls, githubApiRemainingCalls, 'wrong githubApiRemainingCalls returned', callback);
		testing.assertEquals(result.githubApiResetLimit, githubApiResetLimit, 'wrong githubApiResetLimit returned', callback);
		testing.success(callback);
	});
}

function testChunkProcessor(callback)
{
	var chunk = [];
	chunk.push(function (callback) {return callback(null, {check: 1});});
	chunk.push(function (callback) {return callback(null, {check: 2});});
	chunk.push(function (callback) {return callback(null, {check: 3, pending:{check: 4}});});
	// mock processUpdates
	processUpdates = function (estimations, internalCallback) {
		testing.assertEquals(estimations.length, 2, 'wrong number of estimations received', callback);
		testing.assertEquals(estimations[0].check, 1, 'wrong check number in estimation 0', callback);
		testing.assertEquals(estimations[1].check, 2, 'wrong check number in estimation 1', callback);
		return internalCallback(null, {});
	};
	// mock processPendings
	processPendings = function (pendings, githubApiRemainingCalls, githubApiResetLimit, internalCallback)
	{
		testing.assertEquals(pendings.length, 1, 'wrong number of pendings received', callback);
		testing.assertEquals(pendings[0].previousEstimation.check, 3, 'wrong check number in previousEstimation 0', callback);
		testing.assertEquals(pendings[0].pending.check, 4, 'wrong check number in pending 0', callback);
		return internalCallback(null, {});
	};
	var chunkProcessor = getChunkProcessor(chunk);
	chunkProcessor(function (error) {
		testing.check(error, callback);
		testing.success(callback);
	});
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
    testing.run([
		testProcessUpdates,
		testProcessPendings,
        testChunkProcessor
    ], function() {
        db.close(function(error) {
            callback(error);
        });
    });
};

// run script if invoked directly
if (__filename == process.argv[1])
{
	var offset = process.argv[2];
	exports.goOver(offset, function(error, result)
	{
		if (error)
		{
			log.error('Could not evaluate all: %s', error);
			return db.close(function () {
				log.info('DB closed');
				process.exit(1);
			});
		}
		log.info('Processed ' + result + ' chunks of approx ' + limit + ' elements each.');
		db.close(function () {
			log.info('DB closed');
			process.exit(0);
		});
	});
}

