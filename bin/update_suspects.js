#!/usr/bin/env node
'use strict';

/**
 * Updates packages with quality higher than 2. If arguments are passed, it only updates the packages in the arguments
 * (C) 2015 Diego Lafuente.
 */

// requires
require('prototypes');
var config = require('../config.js');
var db = require('../lib/db.js');
var Log = require('log');
var async = require('async');
var update = require('./update.js');

// globals
var log = new Log(config.logLevel);
var packagesCollection;

/**
 * Go over all the packages in all.json and update mongo if required.
 * There are two constraints:
 *   - Github only allows 5000 requests per hour.
 *   - We should use config.limit to avoid RangeErrors in the stack size
 * @param offset[optional]: offset over the all.json file. Defaults to zero.
 * @param callback[required]: a function(error, result) with the results of the process
 */
exports.goOver = function(suspects, callback)
{
    var all;
    var all_suspects = {};
    var mainStream = [];
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
    // build mainStream
    mainStream.push(function (callback)
    {
        db.addCallback(function(error, result)
        {
            if (error) {
                return callback(error);
            }
            packagesCollection = result.collection(config.packagesCollection);
            return callback(null);
        });

    });
    mainStream.push(function (callback) {
        // If there are no suspects, generate them
        if (suspects.length === 0)
        {
            packagesCollection.find({'quality':{'$gt':1.0}}).toArray(function(error, results)
            {
                if (error) {
                    return callback(error);
                }
                results.forEach(function (result)
                {
                    suspects.push(result.name);
                });
                callback(null);
            });
        }
        else
        {
            callback(null);
        }
    });
    mainStream.push(function (callback) {
        suspects.forEach(function (suspect) {
            if (suspect in all) {
                all_suspects[suspect] = all[suspect];
            }
        });
        update.goOver(all_suspects, callback);
    });
    // perform mainStream
    async.series(mainStream, callback);
};


// run script if invoked directly
if (__filename == process.argv[1])
{
    var suspects = process.argv.slice(2);
    exports.goOver(suspects, function(error, result)
    {
        if (error)
        {
            log.error('Could not evaluate all: %s', error);
            return db.close(function () {
                log.info('DB closed');
                process.exit(1);
            });
        }
        log.info('Processed ' + result + ' chunks of approx ' + config.limit + ' elements each.');
        db.close(function () {
            log.info('DB closed');
            process.exit(0);
        });
    });
}