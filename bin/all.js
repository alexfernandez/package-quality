#!/usr/bin/env node
'use strict';

/**
 * Go over all packages and estimate quality for all.
 * (C) 2014 Alex Fernández.
 */

// requires
var estimation = require('../lib/estimation.js');
var request = require('basic-request');
var fs = require('fs');
var async = require('async');
var Log = require('log');

// globals
var log = new Log('info');

/**
 * Read all available npm packages and save them in ../all.json.
 */
exports.readAll = function(callback) {
	var url = 'https://skimdb.npmjs.com/registry/_all_docs';
	log.debug('Requesting package list from: ' + url);
	request.get(url, function(error, body)
	{
		if (error)
		{
			if (body.statusCode == 404)
			{
				return callback(null, 0);
			}
			log.error('Could not read skimdb registry');
			return callback(null, 0);
		}
		log.debug('Response received. Parsing.');
		var all = [];
		try
		{
			JSON.parse(body, function(key, value)
				{
					if (key == 'id')
					{
						all.push(value);
					}
				});
		}
		catch(exception)
		{
			return callback('Could not parse skimdb response: ' + exception);
		}
		log.debug('Parsing complete. Saving.');
		fs.open('../all.json', 'w', function(error, file)
		{
			if (error)
			{
				return callback('Could not open all.json file: ' + error);
			}
			fs.write(file, JSON.stringify(all), function(error)
			{
				if (error)
				{
					return callback('Could not write all.json file: ' + error);
				}
				log.debug('File saved.');
				return callback(null, all.length);
			});
		});
	});
};

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
	if (process.argv.length > 2 && process.argv[2] === 'read_all')
	{
		exports.readAll(function(error, result)
		{
			if (error)
			{
				return log.error('Could not read all: %s', error);
			}
			log.info('all.json file created. Number of entries: ' + result);
		});
	}
	exports.goOver(function(error, result)
	{
		if (error)
		{
			return log.error('Could not evaluate all: %s', error);
		}
		log.info('Result: %s', JSON.stringify(result, null, '\t'));
	});
}

