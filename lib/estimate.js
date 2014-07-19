'use strict';

/**
 * Read info about a package and estimate its quality.
 * (C) 2014 Alex Fernández.
 */

// requires
var http = require('http');
var testing = require('testing');


/**
 * Estimate the quality of a package.
 */
exports.estimate = function(name)
{
	var url = 'http://registry.npmjs.org/' + name;
	http.get(url, function(response)
	{
		if (response.statusCode != 200)
		{
			return console.error('Invalid response %s', response.statusCode);
		}
	}).on('error', function(error)
	{
		console.error('Could not read %s, got error %s', url, error.message);
	});
};

function testEstimation(callback)
{
	testing.success(callback);
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

