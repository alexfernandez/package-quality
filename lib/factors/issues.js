'use strict';

/**
 * Estimates the quality of a package based on the number of total/open/closed github issues during the last year.
 * (C) 2015 Diego Lafuente.
 */

// requires
var Log = require('log');
var config = require('../../config.js');
var request = require('request');
var url = require('url');
var querystring = require('querystring');
var moment = require('moment');
var async = require('async');
var testing = require('testing');

// globals
var log = new Log(config.logLevel);

/**
 * Estimates the quality of a github repo based on its issues (open/closed/total).
 * Receives an object with two fields:
 *    - type: a string indicating the type of repository ('git')
 *    - url: the url of the repo
 * It returns (through the second parameter of the callback) an object with the different
 * factors estimated. If it returns an object with the key 'pending', then the pending method
 * has to be called in order to complete the operation. This will happen when several pages of issues are found
 * in order to prevent the limit of github API calls to be reached.
 * @param repo[required]: an object with the following fields:
 *    - type: a string indicating the type of repository ('git')
 *    - url: the url of the repo
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Error is always null, and result is always object.
 * If the object contains the key 'pending', the pending method has to be called using result.pending as first parameter
 * in order to complete the estimation. If 'pending' is not a key, then each key of the result object is the name of a 
 * measured factor and the value is an array of two elements (both of them floats between 0.0 and 1.0): the first is the 
 * value of the estimated factor, and the second is the weight of this factor in the overall average. The returned object
 * also contains the following two keys:
 *    - githubApiRemainingCalls: the github API remaining calls. Set to undefined if the request to github API does not succeed.
 *    - githubApiResetLimit: the millisecons left for github API to reset the remaining calls. Set to undefined if the request to github API does not succeed.
 * The pending object, if present, has the following fields:
 *    - owner: owner of the repository
 *    - name: name of the repository
 *    - pages: an array containing two elements: the next page number to process and the last page number to process
 *    - total: number of total valid issues so far
 *    - open: number of valid open issues so far
 *    - closed: number of valid closed issues so far
 *    - longOpen: number of valid long open issues so far
 */
exports.estimate = function(repo, callback)
{
    var estimation = {
        repoTotalIssues: [0, 1],
        repoOpenIssues: [0, 1],
        repoLongOpenIssues: [0, 1]
    };
    log.debug('estimateRepo %j', repo);
    var info = extractRepoInfo(repo);
    if (!info || !info.valid)
    {
        log.error('Invalid or null repo: ' + JSON.stringify(repo));
        return callback(null, estimation);
    }
    // get issues for the first page
    getIssuesForPageLastYear(info.owner, info.name, 1, function (error, result)
    {
        if (!result)
        {
            return callback(null, estimation);
        }
        // add github keys to the estimation
        estimation.githubApiRemainingCalls = result.githubApiRemainingCalls;
        estimation.githubApiResetLimit = result.githubApiResetLimit;
        // metrics
        var open = 0;
        var longOpen = 0;
        var closed = 0;
        var total = 0;
        log.debug('Total number of issues received: %s', result.issues.length);
        result.issues.forEach(function(issue)
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
        // is there only one page?
        if (result.githubIssuesLastPage == 1)
        {
            log.debug('Repository ' + info.name + ' has only 1 page of issues');
            if (total === 0)
            {
                estimation.repoTotalIssues = [0, 1];
                estimation.repoOpenIssues = [0, 1];
                estimation.repoLongOpenIssues = [0, 1];
                return callback(null, estimation);
            }
            var totalFactor = 1 - 1 / total;
            var openFactor = (open / total > 0.2) ? 1.2 - open / total : 1;
            var longOpenFactor = (open > 0) ? 1 - longOpen / open : 1;
            estimation.repoTotalIssues = [totalFactor, 1];
            estimation.repoOpenIssues = [openFactor, 1];
            estimation.repoLongOpenIssues = [longOpenFactor, 1];
            return callback(null, estimation);
        }
        // more than one page. Add 'pending' to the estimation
        log.info('Repository ' + info.name + ' has ' + result.githubIssuesLastPage + ' pages of issues');
        estimation.pending = {
            owner: info.owner,
            name: info.name,
            pages: [2, result.githubIssuesLastPage],
            total: total,
            open: open,
            closed: closed,
            longOpen: longOpen
        };
        return callback(null, estimation);
    });
};

/**
 * Finishes the measure of quality started by 'estimate'. It receives a pending object, performs the remaining API requests in parallel
 * and returns the result in the callback. Errors are logged but not returned
 * @param pending[required]: an object with the following fields:
 *    - owner: owner of the repository
 *    - name: name of the repository
 *    - pages: an array containing two elements: the next page number to process and the last page number to process
 *    - total: number of total valid issues so far
 *    - open: number of valid open issues so far
 *    - closed: number of valid closed issues so far
 *    - longOpen: number of valid long open issues so far
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Error is always null, and result is always object.
 * Each key of the result object is the name of a measured factor and the value is an array of two elements (both of them floats between 0.0 and 1.0): the first is the 
 * value of the estimated factor, and the second is the weight of this factor in the overall average. The returned object
 * also contains the following two keys:
 *    - githubApiRemainingCalls: the github API remaining calls. Set to undefined if the request to github API does not succeed.
 *    - githubApiResetLimit: the millisecons left for github API to reset the remaining calls. Set to undefined if the request to github API does not succeed.
 */
exports.pending = function(pending, callback)
{
    log.info('Pending ' + (pending.pages[1] - pending.pages[0]) + ' pages of repo: ' + pending.name + ' - owner: ' + pending.owner);
    var stream = [];
    var estimation = {};
    function streamItem(page)
    {
        return function (callback)
        {
            getIssuesForPageLastYear(pending.owner, pending.name, page, callback);
        };
    }
    for(var i = pending.pages[0]; i <= pending.pages[1]; i++)
    {
        stream.push(streamItem(i));
    }
    async.parallel(stream, function (error, results)
    {
        estimation.githubApiRemainingCalls = 9999999;
        var issues = [];
        results.forEach(function (result)
        {
            if (result.githubApiRemainingCalls < estimation.githubApiRemainingCalls)
            {
                estimation.githubApiRemainingCalls = result.githubApiRemainingCalls;
                estimation.githubApiResetLimit = result.githubApiResetLimit;
            }
            issues = issues.concat(result.issues);
        });
        // metrics
        var open = pending.open;
        var longOpen = pending.longOpen;
        var closed = pending.closed;
        var total = pending.total;
        log.debug('Total number of issues received: %s', issues.length);
        issues.forEach(function(issue)
        {
            if (!issue)
            {
                return log.error('Null issues in %s' + pending.name);
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
        var totalFactor = 1 - 1 / total;
        var openFactor = (open / total > 0.2) ? 1.2 - open / total : 1;
        var longOpenFactor = (open > 0) ? 1 - longOpen / open : 1;
        estimation.repoTotalIssues = [totalFactor, 1];
        estimation.repoOpenIssues = [openFactor, 1];
        estimation.repoLongOpenIssues = [longOpenFactor, 1];
        return callback(null, estimation);
    });
};

/**
 * Extracts the info of a repo object
 * @param repo[required]: an object with the following fields:
 *    - type: a string indicating the type of repository ('git')
 *    - url: the url of the repo
 * @return An object containing the following fields:
 *    - valid: true if the provided repo is valid, false otherwise
 *    - owner: the owner of the repo
 *    - name: the name of the repo
 * The object returned is null if the repo object is not complete or if the repo type is not 'git'
 */
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
    // Auxiliary function to extract pieces
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
}

/**
 * Makes a request to the github issues API and return an object with the information about the issues retrieved and
 * about the remaining API calls/time. It only returns the issues updated during the last year.
 * @param repoOwner[required]: the owner of the repo
 * @param repoName[required]: the name of the repo
 * @param page[required]: the page number of the issues to be retrieved. First page is page=1.
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Error is always null, and result is always object containing the following fields:
 *    - issues: an array with the issues retrieved as returned by the github API
 *    - githubApiRemainingCalls: the github API remaining calls. Set to undefined if the request to github API does not succeed.
 *    - githubApiResetLimit: the millisecons left for github API to reset the remaining calls. Set to undefined if the request to github API does not succeed.
 *    - githubIssuesLastPage: the last page of issues in this repo.
 */
function getIssuesForPageLastYear(repoOwner, repoName, page, callback)
{
    var result = {issues:[]};
    var aYearAgo = moment().subtract(1,'year').format();
    var issuesUrl = 'https://api.github.com/repos/' + repoOwner + '/' + repoName + '/issues?per_page=100&state=all&since=' + aYearAgo + '&page=' + page;
    var pageIssuesUrl = issuesUrl + '&page=' + page;
    request({method:'GET', uri:pageIssuesUrl, headers:{'User-Agent':'node.js'}, auth:{user:config.githubToken}}, function(error, response, body)
    {
        if (error)
        {
            log.error('Could not access issues on ' + issuesUrl + ': ' + error);
            return callback(null, result);
        }
        if (response && response.headers)
        {
            result.githubApiRemainingCalls = response.headers['x-ratelimit-remaining'];
            result.githubApiResetLimit = response.headers['x-ratelimit-reset'];
            result.githubIssuesLastPage = 1;
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
                    result.githubIssuesLastPage = parseInt(querystring.parse(lastPageUrl.query).page, 10);
                }
                catch(exception)
                {
                    log.warning('Repository with LINK gave no last page. Probably this is the last page', response.headers.link);
                    result.githubIssuesLastPage = 1;
                }
            }
        }
        try
        {
            result.issues  = JSON.parse(body);
        }
        catch(exception)
        {
            log.error('Could not parse issues returned by ' + issuesUrl + ': ' + exception);
            return callback(null, result);
        }
        return callback(null, result);
    });
}