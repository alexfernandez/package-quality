'use strict';

/**
 * Read info about a package and estimate its quality.
 * (C) 2014 Alex Fernández.
 */

// requires
var request = require('basic-request');
var testing = require('testing');
var Log = require('log');

// globals
var log = new Log('debug');


/**
 * Estimate the quality of a package between 0 and 1.
 */
exports.estimate = function(name, callback)
{
	var url = 'http://registry.npmjs.org/' + name;
	request.get(url, function(error, body)
	{
		if (error)
		{
			return callback('Could not read registry for ' + name + ': ' + error);
		}
		var result;
		try
		{
			result = JSON.parse(body);
		}
		catch(exception)
		{
			return callback('Could not parse ' + name + ': ' + exception);
		}
		var quality = 1;
		estimateRepo(result.repository, function(error, repoQuality)
		{
			if (error)
			{
				return callback(error);
			}
			quality *= repoQuality;
			return callback(null, quality);
		});
	});
};

function estimateRepo(repo, callback)
{
	log.debug('Repo %j', repo);
	if (repo.type != 'git')
	{
		log.info('Repo is not git: %s', repo.type);
		return callback(null, 0);
	}
	var info = extractRepoInfo(repo.url);
	if (!info.valid)
	{
		return callback('Invalid repo URL ' + repo.url);
	}
	var issuesUrl = 'https://api.github.com/repos/' + info.owner + '/' + info.name + '/issues?per_page=1000';
	request.get(issuesUrl, function(error, result)
	{
		var issues;
		try
		{
			issues = JSON.parse(result);
		}
		catch(exception)
		{
			return callback('Invalid issues: ' + exception);
		}
		var open = 0;
		var closed = 0;
		var total = 0;
		issues.forEach(function(issue)
		{
			total += 1;
			if (issue.state == 'open')
			{
				open += 1;
			}
			else if (issue.state == 'closed')
			{
				closed += 1;
			}
			else
			{
				log.error('Invalid state %s', issue.state);
			}
		});
		if (!closed)
		{
			return callback(null, 0);
		}
		return callback(null, 1 - open / total);
	});
}

function extractRepoInfo(url)
{
	var info = {};
	var pieces = url.split('/');
	if (pieces.length != 7)
	{
		console.error('Invalid URL %s', url);
		return info;
	}
	info.owner = pieces[5];
	info.name = pieces[6];
	info.valid = true;
	return info;
}

function testEstimation(callback)
{
	exports.estimate('testing', function(error, result)
	{
		testing.check(error, 'Could not read testing', callback);
		testing.assert(result, 'No result', callback);
		testing.success(callback);
	});
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	testing.run([
		testEstimation,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

