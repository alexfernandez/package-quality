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
var githubApiCalls = 0;
var limit = config.limit;
var startTime;
var packagesCollection;

// constants
var MILLISECONDS_IN_AN_HOUR = 3600000;

/**
 * Go over all the packages in all.json and update mongo.
 * There are two constraints:
 *   - Github only allows 5000 requests per hour.
 *   - We should use config.limit to avoid RangeErrors in the stack size
 */
exports.goOver = function(callback)
{
	var all;
	log.info('loading all.json...');
	try
	{
		all = require('../all.json');
	}
	catch(exception)
	{
		return callback('Could not parse all.json: ' + exception);
	}
	log.info('all.json loaded');
	var numberOfPackages = Object.keys(all).length;
	limit = (limit == null) || (numberOfPackages < limit) ? numberOfPackages : limit;
	var chunks = [];
	for (var i = 0; i < Math.ceil(numberOfPackages/limit); i++)
	{
		chunks.push([]);
	}
	var packageCount = 0;
	for (var name in all)
	{
		if (name != '_updated')
		{
			var entry = all[name];
			log.debug('Going over package %s: %s', name, JSON.stringify(entry, null, '\t'));
			var index = Math.floor(packageCount/limit);
			chunks[index].push(getEstimator(entry));
			packageCount++;
		}
	}
	log.debug('number of chunks: ' + chunks.length);
	db.addCallback(function(error, result)
	{
        if (error) {
            return callback(error);
        }
        startTime = moment();
        packagesCollection = result.collection(config.packagesCollection);
        var series = [];
        chunks.forEach(function(chunk)
		{
			series.push(getChunkProcessor(chunk));
		});
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
			if (result.githubApiCalled)
			{
				githubApiCalls++;
			}
			packagesCollection.update({name: result.name}, {'$set':result}, {upsert: true}, function(error)
			{
				if (error)
				{
					log.error('Package ' + result.name + 'could not be upserted in the database: ' + JSON.stringify(error));
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
			// check elapsed time and api calls.
			if (githubApiCalls + limit > config.maxGithubApiCallsPerHour)
			{
				var now = moment();
				var elapsed = now.diff(startTime, 'milliseconds');
				githubApiCalls = 0;
				if (elapsed < MILLISECONDS_IN_AN_HOUR)
				{
					log.info('Waiting ' + (MILLISECONDS_IN_AN_HOUR - elapsed) + ' milliseconds until next chunk');
					setTimeout(function()
					{
						startTime = moment();
						return callback(null);
					}, MILLISECONDS_IN_AN_HOUR - elapsed);
				}
				else
				{
					startTime = moment();
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
	exports.goOver(function(error, result)
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

