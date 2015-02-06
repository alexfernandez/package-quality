#!/usr/bin/env node
'use strict';

/**
 * Update only expired packages (those with nextUpdate previous to current date)
 * (C) 2014 Alex Fernández.
 */

// requires
var config = require('../config.js');
var db = require('../lib/db.js');
var estimation = require('../lib/estimation.js');
var async = require('async');
var moment = require('moment');
var testing = require('testing');
var Log = require('log');

// globals
var log = new Log(config.logLevel);
var githubApiRemainingCalls;
var githubApiResetLimit;
var limit = config.limit;
var packagesCollection;

/**
 * Go over all the packages in all.json check if it needs to be updated and update it
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
        var name = entry.name;
        var now = moment();
        // check if the package is in the database
        packagesCollection.findOne({name: name}, function(error, item)
        {
            var isNewEntry = error || !item;
            var shouldUpdate = isNewEntry || (moment(item.nextUpdate) < now);
            // return if we should not update
            if (!shouldUpdate)
            {
                return callback(null);
            }
            // update!!
            estimation.estimate(entry, function(error, result)
            {
                if (error || !result)
                {
                    callback(error);
                }
                if (result.githubApiRemainingCalls && result.githubApiResetLimit)
                {
                    githubApiRemainingCalls = result.githubApiRemainingCalls;
                    githubApiResetLimit = result.githubApiResetLimit;
                    log.debug('githubApiRemainingCalls: ' + githubApiRemainingCalls);
                    log.debug('githubApiResetLimit: ' + githubApiResetLimit);
                }
                delete result.githubApiRemainingCalls;
                delete result.githubApiResetLimit;
                // new entry?
                if (!isNewEntry)
                {
                    delete result.created;
                    result.timesUpdated = item.timesUpdated + 1;
                    // should we defer the update one year
                    var created = moment(item.created);
                    var lastUpdated = moment(result.lastUpdated);
                    var monthsAgo = lastUpdated.diff(created, 'months');
                    if ((monthsAgo > 11) && (result.timesUpdated <= (monthsAgo + 1)))
                    {
                        result.nextUpdate = moment(lastUpdated).add(1, 'years');
                    }
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

/**
 * Unit tests.
 */
function testUpdateNewEntry(callback)
{
    var newEntry = {name: 'newEntry'};
    var now = moment().format();
    var nextUpdate = moment(now).add(1, 'month').format();
    // stubs
    estimation = {
        estimate: function(entry, internalCallback) {
            testing.assertEquals(entry.name, newEntry.name, 'wrong entry passed to estimate', callback);
            return internalCallback(null, {
                name: entry.name,
                created: now,
                nextUpdate: nextUpdate,
                timesUpdated: 0
            });
        }
    };
    packagesCollection = {
        findOne: function(query, internalCallback) {
            testing.assertEquals(query.name, newEntry.name, 'wrong name passed to findOne', callback);
            return internalCallback(true);
        },
        update: function(query, update, options, internalCallback) {
            testing.assertEquals(query.name, newEntry.name, 'wrong name passed to update in query', callback);
            testing.assertEquals(update.$set.name, newEntry.name, 'wrong name passed to update in set', callback);
            testing.assertEquals(moment(update.$set.created).diff(now), 0, 'wrong created time passed to update in set', callback);
            testing.assertEquals(moment(update.$set.nextUpdate).diff(nextUpdate), 0, 'wrong nextUpdate time passed to update in set', callback);
            testing.assertEquals(update.$set.timesUpdated, 0, 'wrong timesUpdated passed to update in set', callback);
            return internalCallback(null);
        }
    };
    var estimator = getEstimator(newEntry);
    estimator(function(error) {
        testing.check(error, callback);
        testing.success(callback);
    });
}

function testUpdateExistingEntryShouldUpdate(callback)
{
    var existingEntry = {name: 'existingEntry'};
    var now = moment().format();
    var nextUpdate = moment(now).add(1, 'month').format();
    // stubs
    estimation = {
        estimate: function(entry, internalCallback) {
            testing.assertEquals(entry.name, existingEntry.name, 'wrong entry passed to estimate', callback);
            return internalCallback(null, {
                name: entry.name,
                created: now,
                nextUpdate: nextUpdate,
                timesUpdated: 0
            });
        }
    };
    packagesCollection = {
        findOne: function(query, internalCallback) {
            testing.assertEquals(query.name, existingEntry.name, 'wrong name passed to findOne', callback);
            return internalCallback(null, {
                name: query.name,
                nextUpdate: moment(now).subtract(1, 'second').format(),
                timesUpdated: 7
            });
        },
        update: function(query, update, options, internalCallback) {
            testing.assertEquals(query.name, existingEntry.name, 'wrong name passed to update in query', callback);
            testing.assertEquals(update.$set.name, existingEntry.name, 'wrong name passed to update in set', callback);
            testing.assertEquals(moment(update.$set.nextUpdate).diff(nextUpdate), 0, 'wrong nextUpdate time passed to update in set', callback);
            testing.assertEquals(update.$set.timesUpdated, 8, 'wrong timesUpdated passed to update in set', callback);
            testing.check(update.$set.created, 'created should not be passed to update in set', callback);
            return internalCallback(null);
        }
    };
    var estimator = getEstimator(existingEntry);
    estimator(function(error) {
        testing.check(error, callback);
        testing.success(callback);
    });
}

function testUpdateExistingEntryShouldUpdateAndDefer(callback)
{
    var existingEntry = {name: 'existingEntry'};
    var now = moment().format();
    var nextUpdate = moment(now).add(1, 'month').format();
    // stubs
    estimation = {
        estimate: function(entry, internalCallback) {
            testing.assertEquals(entry.name, existingEntry.name, 'wrong entry passed to estimate', callback);
            return internalCallback(null, {
                name: entry.name,
                created: now,
                lastUpdated: now,
                nextUpdate: nextUpdate,
                timesUpdated: 0
            });
        }
    };
    packagesCollection = {
        findOne: function(query, internalCallback) {
            testing.assertEquals(query.name, existingEntry.name, 'wrong name passed to findOne', callback);
            return internalCallback(null, {
                name: query.name,
                created: moment(now).subtract(12, 'months').format(),
                nextUpdate: moment(now).subtract(1, 'second').format(),
                timesUpdated: 12
            });
        },
        update: function(query, update, options, internalCallback) {
            testing.assertEquals(query.name, existingEntry.name, 'wrong name passed to update in query', callback);
            testing.assertEquals(update.$set.name, existingEntry.name, 'wrong name passed to update in set', callback);
            testing.assertEquals(moment(update.$set.nextUpdate).diff(now, 'years'), 1, 'wrong nextUpdate time passed to update in set', callback);
            testing.assertEquals(update.$set.timesUpdated, 13, 'wrong timesUpdated passed to update in set', callback);
            testing.check(update.$set.created, 'created should not be passed to update in set', callback);
            return internalCallback(null);
        }
    };
    var estimator = getEstimator(existingEntry);
    estimator(function(error) {
        testing.check(error, callback);
        testing.success(callback);
    });
}

function testUpdateExistingEntryShouldNotUpdate(callback)
{
    var existingEntry = {name: 'existingEntry'};
    var now = moment();
    // stubs
    estimation = {
        estimate: function() {
            testing.check(true, 'estimate should never be called', callback);
        }
    };
    packagesCollection = {
        findOne: function(query, internalCallback) {
            testing.assertEquals(query.name, existingEntry.name, 'wrong name passed to findOne', callback);
            return internalCallback(null, {
                name: query.name,
                nextUpdate: moment(now).add(1, 'second').format(),
            });
        },
        update: function() {
            testing.check(true, 'update should never be called', callback);
        }
    };
    var estimator = getEstimator(existingEntry);
    estimator(function(error) {
        testing.check(error, callback);
        testing.success(callback);
    });
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
    testing.run([
        testUpdateNewEntry,
        testUpdateExistingEntryShouldUpdate,
        testUpdateExistingEntryShouldUpdateAndDefer,
        testUpdateExistingEntryShouldNotUpdate
    ], function() {
        db.close(function(error) {
            callback(error);
        });
    });
};

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