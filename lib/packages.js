'use strict';

// requires
var Log = require('log');
var testing = require('testing');
var db = require('./db.js');
var config = require('../config.js');

// globals
var packagesCollection;
var log = new Log(config.logLevel);

// init
init();


function init()
{
	db.addCallback(function(error, result)
	{
		if (error)
		{
			return log.error('Could not access database: %s', error);
		}
		packagesCollection = result.collection(config.packagesCollection);
	});
}

function testInit(callback)
{
	db.addCallback(function(error, result)
	{
		if (packagesCollection)
		{
			return testing.success(callback);
		}
		result.createCollection(config.packagesCollection, function(error)
		{
			testing.check(error, 'Could not create collection', callback);
			testing.assert(result.collection, 'Did not create collection', callback);
			testing.success(callback);
		});
	});
}

exports.findPackage = function(name, callback)
{
	if (!packagesCollection)
	{
		return callback('database not available');
	}
	packagesCollection.findOne({name: name}, function(error, result)
	{
		if (error)
		{
			log.error('Could not read package %s: %s', name, error);
			return callback('database not available');
		}
		return callback(null, result);
	});     

};

function testFindPackage(callback)
{
	var name = 'test_package';
	var value = '187349';
	testing.assert(packagesCollection, 'no collections', callback);
	var object = {
		name: name,
		value: value,
	};
	packagesCollection.save(object, function(error)
	{
		testing.check(error, 'Could not save object', callback);
		exports.findPackage(name, function(error, result)
		{
			testing.check(error, 'Could not find package', callback);
			testing.assert(result, 'Did not find package', callback);
			testing.assertEquals(result.value, value, 'Invalid value', callback);
			testing.success(callback);
		});
	});
}

exports.listPackages = function(callback)
{
	if (!packagesCollection)
	{
		return callback('database not available');
	}
	packagesCollection.find({}, {name: true}).toArray(function(error, result)
	{
		if (error)
		{
			log.error('Could not list packages: %s', error);
			return callback('database not available');
		}
		return callback(null, result);
	});
};

function testListPackages(callback)
{
	testing.assert(packagesCollection, 'no collections', callback);
	exports.listPackages(function(error, result)
	{
		testing.check(error, 'Could not list packages', callback);
		testing.assert(result, 'Did not list packages', callback);
		testing.success(callback);
	});
}

exports.close = function(callback)
{
	db.close(callback);
};

function testClose(callback)
{
	exports.close(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback) {
	testing.run([
		testInit,
		testFindPackage,
		testListPackages,
		testClose,
	], callback);
};

// start tests if invoked directly
if (__filename == process.argv[1]) {
exports.test(testing.show);
}


