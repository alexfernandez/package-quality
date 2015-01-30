#!/usr/bin/env node
'use strict';

/**
 * Go over all packages and estimate quality for all.
 * (C) 2014 Alex Fernández.
 */

// requires
var config = require('../config.js');
var db = require('../lib/db.js');
var estimation = require('../lib/estimation.js');
var async = require('async');
var moment = require('moment');
var Log = require('log');

// globals
var log = new Log(config.logLevel);
var githubApiRemainingCalls;
var githubApiResetLimit;
var limit = config.limit;
var packagesCollection;

/**
 * Go over all the packages in all.json and update mongo.
 * There are two constraints:
 *   - Github only allows 5000 requests per hour.
 *   - We should use config.limit to avoid RangeErrors in the stack size
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
		log.debug('Going over package %s: %s', name, JSON.stringify(entry, null, '\t'));
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
		async.series(series, function(error)
		{
			if (error)
			{
				callback(error);
			}
			callback(null, chunks.length);
		});
	});
};

function getEstimator(entry)
{
	return function(callback)
	{
		estimation.estimate(entry, function(error, result)
		{
			if (error)
			{
				callback(error);
			}
			if (result.githubApiRemainingCalls && result.githubApiResetLimit)
			{
				githubApiRemainingCalls = result.githubApiRemainingCalls;
				githubApiResetLimit = result.githubApiResetLimit;
				log.debug('githubApiRemainingCalls: ' + githubApiRemainingCalls);
				log.debug('githubApiResetLimit: ' + githubApiResetLimit);
				delete result.githubApiRemainingCalls;
				delete result.githubApiResetLimit;
			}
			packagesCollection.update({name: result.name}, {'$set':result}, {upsert: true}, function(error)
			{
				if (error)
				{
					log.error('Package ' + result.name + ' could not be upserted in the database: ' + JSON.stringify(error));
				}
				callback(null);
			});
		});
	};
}

function getChunkProcessor(chunk)
{
	return function(callback)
	{
		log.info('About to process chunk.');
		async.parallel(chunk, function(error)
		{
			if (error)
			{
				return callback(error);
			}
			log.info('Chunk processed.');
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
	};
}

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

