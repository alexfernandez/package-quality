'use strict';

/**
 * Read info about a package and estimate its quality.
 * (C) 2014 Alex Fernández.
 */

// requires
require('prototypes');
var config = require('../config.js');
var url = require('url');
var querystring = require('querystring');
var request = require('request');
var moment = require('moment');
var async = require('async');
var testing = require('testing');
var Log = require('log');

// globals
var log = new Log(config.logLevel);

/**
 * Estimate the quality of a package.
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
	var result = {
		name: entry.name,
		source: 'npm',
		created: now,
		lastUpdated: now,
		nextUpdate: now,
		timesUpdated: 0
	};
	var waterfall = [
		// estimate repo 
		function(callback)
		{
			return estimateRepo(entry.repository, function(error, repoResult) {
				if (error)
				{
					result.githubApiCalled = false;
					return callback(error);
				}
				result.repoQuality = repoResult.repoQuality || 0;
				result.repoFactors = repoResult.repoFactors;
				result.githubApiRemainingCalls = repoResult.githubApiRemainingCalls;
				result.githubApiResetLimit = repoResult.githubApiResetLimit;
				// set nextUpdate to a month from now if repoQuality is zero
				result.nextUpdate = result.repoQuality > 0 ? result.nextUpdate : moment(now).add(1, 'month').format();
				return callback(error, result.repoQuality);
			});
		},
		// estimate downloads ONLY if estimateRepo returned quality > 0.0
		function(consolidatedQuality, callback)
		{
			log.debug('Repo consolidated quality: %s', consolidatedQuality);
			if (consolidatedQuality > 0) {
				estimateDownloadsLastYear(entry.name, function(error, downloadsQuality)
				{
					if (error)
					{
						return callback(error);
					}
					result.downloadsQuality = downloadsQuality;
					return callback(null, consolidatedQuality * downloadsQuality);
				});
			}
			else
			{
				return callback(null, consolidatedQuality);
			}
		},
		// call registry URL ONLY if estimateRepo returned quality > 0.0
		function(consolidatedQuality, callback)
		{
			log.debug('Downloads consolidated quality: %s', consolidatedQuality);
			if (consolidatedQuality > 0)
			{
				var url = 'http://registry.npmjs.org/' + entry.name;
				log.debug('Registry URL: %s', url);
				request.get(url, function(error, response, body)
				{
					if (error)
					{
						log.error('Could not read registry for ' + entry.name + ' (' + url + '): ' + error);
						return callback(null, 0, null);
					}
					if (response.statusCode == 404)
					{
						log.error('404 received while reading registry for ' + entry.name + ' (' + url + '): ' + error);
						return callback(null, 0, null);
					}
					var registryResponse;
					try
					{
						registryResponse = JSON.parse(body);
					}
					catch(exception)
					{
						log.debug('Could not parse ' + entry.name + ' registry response: ' + exception);
						return callback(null, 0, null);
					}
					return callback(null, consolidatedQuality, registryResponse);
				});
			}
			else
			{
				return callback(null, consolidatedQuality, null);
			}
		},
		// estimate version ONLY if consolidatedQuality > 0
		function(consolidatedQuality, registryResponse, callback)
		{
			log.debug('Downloads consolidated quality: %s', consolidatedQuality);
			if (consolidatedQuality > 0)
			{
				estimateVersions(registryResponse.versions, function(error, versionsQuality)
				{
					if (error)
					{
						return callback(error);
					}
					result.versionsQuality = versionsQuality;
					callback(null, consolidatedQuality * versionsQuality);
				});
			}
			else
			{
				return callback (null, consolidatedQuality);
			}
		}
	];
	// launch waterfall
	async.waterfall(waterfall, function(error, consolidatedQuality) {
		if (error)
		{
			return callback(error);
		}
		result.quality = consolidatedQuality;
		return callback(null, result);
	});
};

function estimateVersions(versions, callback)
{
	if (!versions)
	{
		return callback(null, 0);
	}
	var number = versions.countProperties();
	log.debug('Versions %s', number);
	return callback(null, 1 - 1 / number);
}

function estimateDownloadsLastYear(name, callback) {
	var now = moment();
	var aYearAgo = now.clone().subtract(1,'year');
	var url = 'http://npm-stat.com/downloads/range/' + aYearAgo.format('YYYY-MM-DD') + ':' + now.format('YYYY-MM-DD') + '/' + name;
	log.debug('Downloads URL: %s', url);
	request.get(url, function(error, response, body) {
		if (error)
		{
			log.error('Could not read downloads for ' + name + ' (' + url + '): ' + error);
			return callback(null, 0);
		}
		if (response.statusCode == 404)
		{
			log.error('404 returned while reading downloads for ' + name + ' (' + url + ').');
			return callback(null, 0);
		}
		var result;
		try
		{
			result = JSON.parse(body);
		}
		catch(exception)
		{
			log.error('Could not parse ' + name + ': ' + exception);
			return callback(null, 0);
		}
		var quality = 0;
		if ('downloads' in result) {
			var downloads = 0;
			result.downloads.forEach(function(item) {
				downloads += item.downloads;
			});
			log.debug('Downloads %s', downloads);
			quality = 1 - 1/downloads;
		}
		return callback(null, quality);
	});

}

function estimateRepo(repo, callback)
{
	log.debug('estimateRepo %j', repo);
	var info = extractRepoInfo(repo);
	if (!info || !info.valid)
	{
		log.error('Invalid or null repo: ' + JSON.stringify(repo));
		return callback(null, {});
	}
	getIssuesForRepoInfo(info, function(error, result)
	{
		if (error) {
			log.error(error);
			return callback(null, repoResult);
		}
		var repoResult = {
			repoQuality: 0,
			githubApiRemainingCalls: result.githubApiRemainingCalls,
			githubApiResetLimit: result.githubApiResetLimit
		};
		var issues = result.issues;
		var open = 0;
		var longOpen = 0;
		var closed = 0;
		var total = 0;
		log.debug('Total number of issues received: %s', issues.length);
		issues.forEach(function(issue)
		{
			if (!issue)
			{
				return log.error('Null issues in %s' + info.name);
			}
			total += 1;
			if (issue.state == 'open')
			{
				open += 1;
				var now = moment();
				var created = moment(issue.created_at);
				if (now.diff(created, 'days') > 365)
				{
					longOpen += 1;
				}
			}
			else if (issue.state == 'closed')
			{
				closed += 1;
			}
			else
			{
				log.debug('Invalid state %s', issue.state);
			}
		});
		if (!total)
		{
			log.debug('No issues in %s', issues);
			return callback(null, repoResult);
		}
		var totalFactor = 1 - 1 / total;
		var openFactor = (open / total > 0.2) ? 1.2 - open / total : 1;
		var longOpenFactor = (open > 0) ? 1 - longOpen / open : 1;
		repoResult.repoFactors = {
			totalFactor: totalFactor,
			openFactor: openFactor,
			longOpenFactor: longOpenFactor
		};
		repoResult.repoQuality = (totalFactor + openFactor + longOpenFactor) / 3;
		log.debug('Issues: %s / %s open', open, total);
		log.debug('Issues: %s / %s longOpen', longOpen, open);
		log.debug('Issues: %s closed', closed);
		return callback(null, repoResult);
	});
}

function getIssuesForRepoInfo(info, callback) {
	var result = {};
	var pages = 1;
	var issuesUrl = 'https://api.github.com/repos/' + info.owner + '/' + info.name + '/issues?per_page=100&state=all';
	log.debug('URL for issues: %s', issuesUrl);
	request({method:'GET', uri:issuesUrl, headers:{'User-Agent':'node.js'}, auth:{user:config.githubToken}}, function(error, response, body)
	{
		if (error)
		{
			return callback('Could not access issues on ' + issuesUrl + ': ' + error);
		}
		if (response && response.headers)
		{
			result.githubApiRemainingCalls = response.headers['x-ratelimit-remaining'];
			result.githubApiResetLimit = response.headers['x-ratelimit-reset'];
			// check if there are pages
			if (response.headers.link)
			{
				try
				{
					var lastPageLinkElement = response.headers.link.split(',').filter(function(element) {
						if (element.indexOf('rel="last"') > -1) {
							return true;
						}
						return false;
					})[0];
					var lastPageUrl = url.parse(lastPageLinkElement.substring(lastPageLinkElement.lastIndexOf('<') + 1,lastPageLinkElement.lastIndexOf('>')));
					pages = parseInt(querystring.parse(lastPageUrl.query).page, 10);
				}
				catch(exception)
				{
					log.error('Repository with LINK gave no pages');
					pages = 1;
				}
			}
		}
		// parse first issues
		try
		{
			result.issues = JSON.parse(body);
		}
		catch(exception)
		{
			return callback('Invalid issues for ' + issuesUrl + ' in ' + body + ': ' + exception);
		}
		// return if there is only one page
		if (pages <= 1)
		{
			log.debug('Repository ' + info.name + ' has only 1 page of issues');
			return callback(null, result);
		}
		// more than one page
		var stream = [];
		for (var page = 2; page <= pages; page++)
		{
			stream.push(getIssuesForPage(page));
		}
		log.info('Repository ' + info.name + ' has ' + (stream.length + 1) + ' pages of issues');
		// Do we have enough remaining API calls?
		var now = moment().unix();
		if ((result.githubApiRemainingCalls < stream.length) && (result.githubApiResetLimit > now))
		{
			var millisecondsToWait = (result.githubApiResetLimit - now) * 1000;
			log.info('Waiting ' + millisecondsToWait + ' milliseconds before getting next page of issues in ' + info.name);
			setTimeout(function()
			{
				async.series(stream, function(error, seriesResults) {
					seriesResults.forEach(function (item) {
						result.issues = result.issues.concat(item.issues);
					});
					result.githubApiRemainingCalls = seriesResults[seriesResults.length-1].githubApiRemainingCalls;
					result.githubApiResetLimit = seriesResults[seriesResults.length-1].githubApiResetLimit;
					callback(null, result);
				});
			}, millisecondsToWait);
		}
		else
		{
			async.series(stream, function(error, seriesResults) {
				seriesResults.forEach(function (item) {
					result.issues = result.issues.concat(item.issues);
				});
				result.githubApiRemainingCalls = seriesResults[seriesResults.length-1].githubApiRemainingCalls;
				result.githubApiResetLimit = seriesResults[seriesResults.length-1].githubApiResetLimit;
				callback(null, result);
			});
		}
	});

	function getIssuesForPage(page) {
		return function(callback) {
			var result = {issues:[]};
			var pageIssuesUrl = issuesUrl + '&page=' + page;
			request({method:'GET', uri:pageIssuesUrl, headers:{'User-Agent':'node.js'}, auth:{user:config.githubToken}}, function(error, response, body) {
				if (error)
				{
					return callback(null, result);
				}
				if (response && response.headers)
				{
					result.githubApiRemainingCalls = response.headers['x-ratelimit-remaining'];
					result.githubApiResetLimit = response.headers['x-ratelimit-reset'];
				}
				try
				{
					result.issues  = JSON.parse(body);
				}
				catch(exception)
				{
					return callback(null, result);
				}
				return callback(null, result);
			});
		};
	}
}

function extractRepoInfo(repo)
{
	log.debug('extractRepoInfo %j', repo);
	if (!repo || !repo.type || !repo.url)
	{
		log.debug('Incomplete repo. Returning null info.');
		return null;
	}
	if (repo.type != 'git')
	{
		log.debug('Invalid repo type: %s', repo.type);
		return null;
	}
	if (repo.url.startsWith('git@github.com:'))
	{
		return extractPieces(repo.url.substringFrom('git@github.com:'), 0);
	}
	if (repo.url.startsWith('git://github.com:'))
	{
		return extractPieces(repo.url.substringFrom('git://github.com:'), 0);
	}
	return extractPieces(repo.url, 3);
}

function extractPieces(remaining, initial)
{
	var pieces = remaining.split('/');
	if (pieces.length != initial + 2)
	{
		log.debug('Invalid URL %s', remaining);
		return {};
	}
	return {
		valid: true,
		owner: pieces[initial],
		name: pieces[initial + 1].substringUpTo('.git'),
	};
}

/**
 * Unit tests.
 */

function testEstimation(callback)
{
	var entry = require('../test/test_entry.json');
	exports.estimate(entry, function(error, result)
	{
		testing.check(error, 'Could not read %s', entry.name, callback);
		testing.assert(result, 'No result', callback);
		testing.assertEquals(result.name, entry.name, 'wrong name stored in result');
		testing.assertEquals(result.source, 'npm', 'wrong source stored in result');
		testing.assert(result.repoQuality > 0, 'the test entry has to return a positive repo quality', callback);
		testing.assert(result.downloadsQuality > 0, 'the test entry has to return a positive downloads quality', callback);
		testing.assert(result.versionsQuality > 0, 'the test entry has to return a positive versions quality', callback);
		testing.assertEquals(result.quality, result.repoQuality * result.downloadsQuality * result.versionsQuality, 'wrong consolidated quality stored in result');
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
	], 10000, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

