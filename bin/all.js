#!/usr/bin/env node
'use strict';

/**
 * Go over all packages and estimate quality for all.
 * (C) 2014 Alex Fernández.
 */

// requires
var estimation = require('./estimation.js');
var async = require('async');
var Log = require('log');

// globals
var log = new Log('debug');


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
		log.debug('Going over package: %s', name);
		tasks[name] = getEstimator(name);
	}
	async.series(tasks, function(error, results)
	{
		if (error)
		{
			return callback(error);
		}
		var total = 0;
		var quality = 0;
		for (var key in results)
		{
			quality += results[key];
			total += 1;
		}
		return callback(null, total, quality / total);
	});
};

function getEstimator(name)
{
	return function(callback)
	{
		return estimation.estimate(name, callback);
	};
}

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.goOver(function(error, total, quality)
	{
		if (error)
		{
			return console.error('Could not evaluate all: %s', error);
		}
		console.log('Average quality for %s packages: %s', total, quality);
	});
}

