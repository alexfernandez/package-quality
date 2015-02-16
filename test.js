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
	//var libs = ['estimation', 'db'];
    var libs = [];
    var bin = ['update'];
	libs.forEach(function(lib)
	{
		tests[lib] = require('./lib/' + lib + '.js').test;
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

