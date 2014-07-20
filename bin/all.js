#!/usr/bin/env node
'use strict';

/**
 * Go over all packages and estimate quality for all.
 * (C) 2014 Alex Fernández.
 */

// requires
var estimation = require('../lib/estimation.js');
var async = require('async');
var Log = require('log');

// globals
var log = new Log('info');


/**
 * Estimate the quality of a package between 0 and 1.
 */
exports.goOver = function(callback)
{
	var all;
	try
	{
		all = require('../all.json');
	}
	catch(exception)
	{
		return callback('Could not parse all.json: ' + exception);
	}
	var tasks = {};
	for (var name in all)
	{
		var entry = all[name];
		log.debug('Going over package %s: %s', name, JSON.stringify(entry, null, '\t'));
		tasks[name] = getEstimator(entry);
	}
	async.series(tasks, function(error, results)
	{
		if (error)
		{
			return callback(error);
		}
		var result = {
			packages: 0,
			quality: 0,
			zeros: 0,
		};
		for (var key in results)
		{
			result.packages += 1;
			var quality = results[key];
			if (!quality)
			{
				result.zeros += 1;
			}
			else
			{
				result.quality += quality;
			}
		}
		result.averageQuality = result.quality / result.packages;
		return callback(null, result);
	});
};

function getEstimator(entry)
{
	return function(callback)
	{
		return estimation.estimate(entry, callback);
	};
}

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.goOver(function(error, result)
	{
		if (error)
		{
			return console.error('Could not evaluate all: %s', error);
		}
		console.log('Result: %s', JSON.stringify(result, null, '\t'));
	});
}

