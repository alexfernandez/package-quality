'use strict';

/**
 * Run package tests.
 * (C) 2014 Alex Fernández.
 */

// requires
var testing = require('testing');
var Log = require('log');

// globals
var log = new Log('info');


/**
 * Run all module tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	var tests = {};
	var libs = ['estimation', 'db', 'badges', 'packages', 'update'];
    var factors = ['issues', 'versions', 'downloads'];
    var bin = ['all'];
	libs.forEach(function(lib)
	{
		tests[lib] = require('./lib/' + lib + '.js').test;
	});
    factors.forEach(function(factor)
    {
        tests[factors] = require('./lib/factors/' + factor + '.js').test;
    });
    bin.forEach(function(bin)
    {
        tests[bin] = require('./bin/' + bin + '.js').test;
    });
	testing.run(tests, 4200, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

