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
var Log = require('log');

// globals
var log = new Log(config.logLevel);

/**
 * Go over all the packages in all.json and update mongo.
 * There are two constraints:
 *   - Github only allows 5000 requests per hour.
 *   - We should use config.limit to avoid RangeErrors in the stack size
 */
exports.goOver = function(callback)
{
	var packagesCollection;
	var all;
	log.debug('loading all.json...');
	try
	{
		all = require('../all.json');
	}
	catch(exception)
	{
		return callback('Could not parse all.json: ' + exception);
	}
	log.debug('all.json loaded');
	var numberOfPackages = Object.keys(all).length;
	var limit = (config.limit === null) || (numberOfPackages < config.limit) ? numberOfPackages : config.limit;
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
			chunks[Math.floor(packageCount/limit)].push(getEstimator(entry));
			packageCount++;
		}
	}
	log.debug('number of chunks: ' + chunks.length);
	db.addCallback(function(error, result) {
        if (error) {
            return callback(error);
        }
        packagesCollection = result.collection('packages');
		callback(null, chunks.length);
	});
};

function getEstimator(entry)
{
	return function(callback)
	{
		return estimation.estimate(entry, callback);
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
		log.info('Result: %s', JSON.stringify(result, null, '\t'));
		db.close(function () {
			log.info('DB closed');
			process.exit(0);
		});
	});
}

