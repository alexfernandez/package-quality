'use strict';

/**
 * Estimates the quality of a package based on the number of total/open/closed github issues during the last year.
 * (C) 2015 Diego Lafuente.
 */

// requires
require('prototypes');
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
 * factors estimated. It returns an error if something fails (this includes if the system runs out of github API calls)
 * @param repo[required]: an object with the following fields:
 *    - type: a string indicating the type of repository ('git')
 *    - url: the url of the repo
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Returns an error in case something fails (including running out of github calls)
 * If the error is null, then the result is always object.
 * Each key of the result object is the name of a measured factor and the value is an array of two elements 
 * (both of them floats between 0.0 and 1.0): the first is the value of the estimated factor, and the second is the weight of this 
 * factor in the overall average. The returned object also contains the following two keys:
 *    - githubApiRemainingCalls: the github API remaining calls. Set to undefined if the request to github API does not succeed.
 *    - githubApiResetLimit: the millisecons left for github API to reset the remaining calls. Set to undefined if the request to github API
 * does not succeed.
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
        if (error)
        {
            return callback(error);
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
        // more than one page. Process pending pages
        log.info('Repository ' + info.name + ' has ' + result.githubIssuesLastPage + ' pages of issues');
        var pendingObject = {
            owner: info.owner,
            name: info.name,
            pages: [2, result.githubIssuesLastPage],
            total: total,
            open: open,
            closed: closed,
            longOpen: longOpen
        };
        return pending(pendingObject, callback);
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
 * @return This method returns through the callback parameter. Returns an error in case something fails (including running out of github calls)
 * If the error is null, then the result is always object.
 * Each key of the result object is the name of a measured factor and the value is an array of two elements (both of them floats between 0.0 and 1.0): the first is the 
 * value of the estimated factor, and the second is the weight of this factor in the overall average. The returned object
 * also contains the following two keys:
 *    - githubApiRemainingCalls: the github API remaining calls. Set to undefined if the request to github API does not succeed.
 *    - githubApiResetLimit: the millisecons left for github API to reset the remaining calls. Set to undefined if the request to github API does not succeed.
 */
function pending(pendingObject, callback)
{
    log.info('Pending ' + (pendingObject.pages[1] - pendingObject.pages[0]) + ' pages of repo: ' + pendingObject.name + ' - owner: ' + pendingObject.owner);
    var stream = [];
    var estimation = {};
    function streamItem(page)
    {
        return function (callback)
        {
            getIssuesForPageLastYear(pendingObject.owner, pendingObject.name, page, callback);
        };
    }
    for(var i = pendingObject.pages[0]; i <= pendingObject.pages[1]; i++)
    {
        stream.push(streamItem(i));
    }
    async.parallel(stream, function (error, results)
    {
        if (error) 
        {
            return callback(error);
        }
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
        var open = pendingObject.open;
        var longOpen = pendingObject.longOpen;
        var closed = pendingObject.closed;
        var total = pendingObject.total;
        log.debug('Total number of issues received: %s', issues.length);
        issues.forEach(function(issue)
        {
            if (!issue)
            {
                return log.error('Null issues in %s' + pendingObject.name);
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
}

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
 * @return This method returns through the callback parameter. Returns an error if something fails
 * If error is null, then result is always object containing the following fields:
 *    - issues: an array with the issues retrieved as returned by the github API
 *    - githubApiRemainingCalls: the github API remaining calls. Set to undefined if the request to github API does not succeed.
 *    - githubApiResetLimit: the millisecons left for github API to reset the remaining calls. Set to undefined if the request to github API does not succeed.
 *    - githubIssuesLastPage: the last page of issues in this repo.
 */
function getIssuesForPageLastYear (repoOwner, repoName, page, callback)
{
    var result = {issues:[]};
    var aYearAgo = moment().subtract(1,'year').format();
    var issuesUrl = 'https://api.github.com/repos/' + repoOwner + '/' + repoName + '/issues?per_page=100&state=all&since=' + aYearAgo + '&page=' + page;
    var pageIssuesUrl = issuesUrl + '&page=' + page;
    request({method:'GET', uri:pageIssuesUrl, headers:{'User-Agent':'node.js'}, auth:{user:config.githubToken}}, function(error, response, body)
    {
        if (error)
        {
            return callback('Could not access issues on ' + issuesUrl + ': ' + error);
            
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
            return callback('Could not parse issues returned by ' + issuesUrl + ': ' + exception);
        }
        // check if we exceeded the maximum number of calls to github api
        if (result.issues.message) {
            return callback('maximum number of github API calls reached');
        }
        return callback(null, result);
    });
}

/************************************************
 **************** UNIT TESTS ********************
 ************************************************/

//getIssuesForPageLastYear tests

function testGetIssuesForPageLastYearErrorResponse(callback)
{
    //stub request
    var restoreRequest = request;
    request = function (params, internalCallback)
    {
        internalCallback({check: true});
    };
    getIssuesForPageLastYear('repoOwner', 'repoName', 2, function (error, result) {
        testing.check(result, callback);
        testing.assert(error, 'no error returned by getIssuesForPageLastYear when the request returns an error', callback);
        // restore request
        request = restoreRequest;
        testing.success(callback);
    });
}

function testGetIssuesForPageLastYearNoMoreGithubApiCalls(callback)
{
    //stub request
    var restoreRequest = request;
    request = function (params, internalCallback)
    {
        internalCallback(null, null, '{"message":"API rate limit exceeded"}');
    };
    getIssuesForPageLastYear('repoOwner', 'repoName', 2, function (error, result) {
        testing.check(result, callback);
        testing.assert(error, 'no error returned by getIssuesForPageLastYear when no more github API calls are available', callback);
        // restore request
        request = restoreRequest;
        testing.success(callback);
    });
}

function testValidGetIssuesForPageLastYear(callback)
{
    //stub request
    var restoreRequest = request;
    request = function (params, internalCallback)
    {
        var response = {
            headers: {
                'x-ratelimit-remaining': 2,
                'x-ratelimit-reset': 1,
                'link': 'rel="last"<http://test.com/test?page=12>'
            }
        };
        var body = [{}, {}];
        internalCallback(null, response, JSON.stringify(body));
    };
    getIssuesForPageLastYear('repoOwner', 'repoName', 2, function (error, result) {
        testing.check(error, callback);
        testing.assertEquals(result.githubApiRemainingCalls, 2, 'wrong remaining github API calls returned', callback);
        testing.assertEquals(result.githubApiResetLimit, 1, 'wrong limit github API time returned', callback);
        testing.assertEquals(result.githubIssuesLastPage, 12, 'wrong last page of issues returned', callback);
        testing.assertEquals(result.issues.length, 2, 'wrong number of issues returned', callback);
        // restore request
        request = restoreRequest;
        testing.success(callback);
    });
}

// extractRepoInfo tests

function testExtractRepoInfoInvalidRepo(callback)
{
    testing.assertEquals(extractRepoInfo(null), null, 'extractRepoInfo of null did not return null', callback);
    testing.assertEquals(extractRepoInfo({}), null, 'extractRepoInfo of empty object did not return null', callback);
    testing.assertEquals(extractRepoInfo({type:'non-git', url:'https://github.com/alexfernandez/loadtest'}), null, 'extractRepoInfo of non-git repo did not return null', callback);
    testing.success(callback);
}

function testExtractRepoInfoValidRepo(callback)
{
    var repoInfo = extractRepoInfo({type:'git', url:'https://github.com/alexfernandez/loadtest.git'});
    testing.assert(repoInfo.valid, 'valid repo returned invalid info', callback);
    testing.assertEquals(repoInfo.owner, 'alexfernandez', 'valid repo returned wrong owner', callback);
    testing.assertEquals(repoInfo.name, 'loadtest', 'valid repo returned wrong owner', callback);
    testing.success(callback);
}

// estimate tests

function testEstimateInvalidRepo(callback)
{
    exports.estimate({}, function (error, result) {
        testing.check(error, callback);
        testing.assertEquals(result.repoTotalIssues[0], 0, 'repoTotalIssues should be zero for a invalid repo', callback);
        testing.assertEquals(result.repoOpenIssues[0], 0, 'repoOpenIssues should be zero for a invalid repo', callback);
        testing.assertEquals(result.repoLongOpenIssues[0], 0, 'repoLongOpenIssues should be zero for a invalid repo', callback);
        testing.success(callback);
    });
}

function testEstimateValidRepoGetIssuesForPageLastYearReturnedError(callback)
{
    var validRepo = {
        type:'git',
        url:'https://github.com/alexfernandez/loadtest'
    };
    // stub getIssuesForPageLastYear
    getIssuesForPageLastYear = function (repoOwner, repoName, page, internalCallback)
    {
        return internalCallback({check: true});
    };
    exports.estimate(validRepo, function (error, result) {
        testing.check(result, callback);
        testing.assert(error.check, 'estimate should return the right error when getIssuesForPageLastYear returns an error', callback);
        testing.success(callback);
    });
}

function testEstimateValidRepo(callback)
{
    var validRepo = {
        type:'git',
        url:'https://github.com/alexfernandez/loadtest'
    };
    // stub getIssuesForPageLastYear
    getIssuesForPageLastYear = function (repoOwner, repoName, page, internalCallback)
    {
        testing.assertEquals(repoOwner, 'alexfernandez', 'wrong repo owner used to call getIssuesForPageLastYear', callback);
        testing.assertEquals(repoName, 'loadtest', 'wrong repo owner used to call getIssuesForPageLastYear', callback);
        testing.assertEquals(page, 1, 'estimate should always request page 1', callback);
        return internalCallback(null, {issues: [{state: 'open',
                                                created_at: moment().format()}],
                                        githubIssuesLastPage: 1});
    };
    // stub pending
    var restorePending = pending;
    pending = function()
    {
        testing.assert(false, 'pending should never be called when there is only one page of issues', callback);
    };
    exports.estimate(validRepo, function (error, result) {
        testing.check(error, callback);
        testing.assertEquals(result.repoTotalIssues[0], 0, 'repoTotalIssues should be zero for this repo', callback);
        testing.assert(Math.abs(result.repoOpenIssues[0] - 0.2) < 0.00001, 'repoOpenIssues should be 0.2 for this repo', callback);
        testing.assertEquals(result.repoLongOpenIssues[0], 1, 'repoLongOpenIssues should be 1 for this repo', callback);
        pending = restorePending;
        testing.success(callback);
    });
}

function testEstimateValidRepoPendingReturnsError(callback)
{
    var validRepo = {
        type:'git',
        url:'https://github.com/alexfernandez/loadtest'
    };
    // stub getIssuesForPageLastYear
    getIssuesForPageLastYear = function (repoOwner, repoName, page, internalCallback)
    {
        testing.assertEquals(repoOwner, 'alexfernandez', 'wrong repo owner used to call getIssuesForPageLastYear', callback);
        testing.assertEquals(repoName, 'loadtest', 'wrong repo owner used to call getIssuesForPageLastYear', callback);
        testing.assertEquals(page, 1, 'estimate should always request page 1', callback);
        return internalCallback(null, {issues: [{state: 'open',
                                                created_at: moment().subtract(366, 'days').format()}],
                                        githubIssuesLastPage: 3});
    };
    // stub pending
    var restorePending = pending;
    pending = function(pendingObject, internalCallback)
    {
        testing.assertEquals(pendingObject.owner, 'alexfernandez', 'wrong repo owner sent to pending', callback);
        testing.assertEquals(pendingObject.name, 'loadtest', 'wrong repo name sent to pending', callback);
        testing.assertEquals(pendingObject.pages[0], 2, 'wrong initial page sent to pending', callback);
        testing.assertEquals(pendingObject.pages[1], 3, 'wrong final page sent to pending', callback);
        testing.assertEquals(pendingObject.total, 1, 'wrong total issues sent to pending', callback);
        testing.assertEquals(pendingObject.open, 1, 'wrong open issues sent to pending', callback);
        testing.assertEquals(pendingObject.closed, 0, 'wrong closed issues sent to pending', callback);
        testing.assertEquals(pendingObject.longOpen, 1, 'wrong long open issues sent to pending', callback);
        internalCallback({check:true});
    };
    exports.estimate(validRepo, function (error, result) {
        testing.check(result, callback);
        testing.assert(error.check, 'estimate should return the right error when pending returns an error', callback);
        //restore pending
        pending = restorePending;
        testing.success(callback);
    });
}

function testEstimateValidRepoPending(callback)
{
    var validRepo = {
        type:'git',
        url:'https://github.com/alexfernandez/loadtest'
    };
    // stub getIssuesForPageLastYear
    getIssuesForPageLastYear = function (repoOwner, repoName, page, internalCallback)
    {
        testing.assertEquals(repoOwner, 'alexfernandez', 'wrong repo owner used to call getIssuesForPageLastYear', callback);
        testing.assertEquals(repoName, 'loadtest', 'wrong repo owner used to call getIssuesForPageLastYear', callback);
        testing.assertEquals(page, 1, 'estimate should always request page 1', callback);
        return internalCallback(null, {issues: [{state: 'open',
                                                created_at: moment().subtract(366, 'days').format()}],
                                        githubIssuesLastPage: 3});
    };
    // stub pending
    var restorePending = pending;
    pending = function(pendingObject, internalCallback)
    {
        testing.assertEquals(pendingObject.owner, 'alexfernandez', 'wrong repo owner sent to pending', callback);
        testing.assertEquals(pendingObject.name, 'loadtest', 'wrong repo name sent to pending', callback);
        testing.assertEquals(pendingObject.pages[0], 2, 'wrong initial page sent to pending', callback);
        testing.assertEquals(pendingObject.pages[1], 3, 'wrong final page sent to pending', callback);
        testing.assertEquals(pendingObject.total, 1, 'wrong total issues sent to pending', callback);
        testing.assertEquals(pendingObject.open, 1, 'wrong open issues sent to pending', callback);
        testing.assertEquals(pendingObject.closed, 0, 'wrong closed issues sent to pending', callback);
        testing.assertEquals(pendingObject.longOpen, 1, 'wrong long open issues sent to pending', callback);
        internalCallback(null, {check:true});
    };
    exports.estimate(validRepo, function (error, result) {
        testing.check(error, callback);
        testing.assert(result.check, 'estimate should return the right result when pending returns a result', callback);
        //restore pending
        pending = restorePending;
        testing.success(callback);
    });
}

// pending tests

function testPendingGetIssuesForPageLastYearReturnedError(callback)
{
    var pendingObject = {
        owner: 'alexfernandez',
        name: 'loadtest',
        pages: [2, 3],
        total: 1,
        open: 0,
        closed: 1,
        longOpen: 0
    };
    // stub getIssuesForPageLastYear
    getIssuesForPageLastYear = function (repoOwner, repoName, page, internalCallback)
    {
        return internalCallback({check: true});
    };
    pending(pendingObject, function (error, result) {
        testing.check(result, callback);
        testing.assert(error.check, 'pending returned wrong error when getIssuesForPageLastYear returned an error', callback);
        testing.success(callback);
    });
}

function testPending(callback)
{
    var pendingObject = {
        owner: 'alexfernandez',
        name: 'loadtest',
        pages: [2, 3],
        total: 1,
        open: 0,
        closed: 1,
        longOpen: 0
    };
    // stub getIssuesForPageLastYear
    getIssuesForPageLastYear = function (repoOwner, repoName, page, internalCallback)
    {
        testing.assertEquals(repoOwner, 'alexfernandez', 'wrong repo owner used to call getIssuesForPageLastYear', callback);
        testing.assertEquals(repoName, 'loadtest', 'wrong repo owner used to call getIssuesForPageLastYear', callback);
        return internalCallback(null, {issues: [{state: 'closed'}],
                                        githubIssuesLastPage: 3});
    };
    pending(pendingObject, function (error, result) {
        testing.check(error, callback);
        testing.assert(Math.abs(result.repoTotalIssues[0] - 2/3) < 0.00001, 'repoTotalIssues should be 2/3 for this repo', callback);
        testing.assertEquals(result.repoOpenIssues[0], 1, 'repoOpenIssues should be 1 for this repo', callback);
        testing.assertEquals(result.repoLongOpenIssues[0], 1, 'repoLongOpenIssues should be 1 for this repo', callback);
        testing.success(callback);
    });
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
    testing.run([
        testGetIssuesForPageLastYearErrorResponse,
        testGetIssuesForPageLastYearNoMoreGithubApiCalls,
        testValidGetIssuesForPageLastYear,
        testExtractRepoInfoInvalidRepo,
        testExtractRepoInfoValidRepo,
        testEstimateInvalidRepo,
        testEstimateValidRepoGetIssuesForPageLastYearReturnedError,
        testEstimateValidRepo,
        testEstimateValidRepoPendingReturnsError,
        testEstimateValidRepoPending,
        testPendingGetIssuesForPageLastYearReturnedError,
        testPending
    ], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
    exports.test(testing.show);
}