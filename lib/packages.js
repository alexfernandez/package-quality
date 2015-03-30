'use strict';

// requires
var Log = require('log');
var testing = require('testing');
var db = require('./db.js');
var config = require('../config.js');

// globals
var packagesCollection;
var log = new Log(config.logLevel);


function openCollection(callback)
{
	if (packagesCollection)
	{
		return callback(null, packagesCollection);
	}
	db.addCallback(function(error, result)
	{
		if (error)
		{
			return callback('Could not access database: ' + error);
		}
		packagesCollection = result.collection(config.packagesCollection);
		if (packagesCollection)
		{
			return callback(null, packagesCollection);
		}
		result.createCollection(config.packagesCollection, function(error)
		{
			if (error)
			{
				return callback(error);
			}
			return callback(null, result.collection(config.packagesCollection));
		});
	});
}

function testOpenCollection(callback)
{
	// init
	openCollection(function(error, collection)
	{
		testing.check(error, 'Could not open collection', callback);
		testing.assert(collection, 'Did not open collection', callback);
		testing.success(callback);
	});
}

exports.update = function(object, callback)
{
	openCollection(function(error, collection)
	{
		if (error)
		{
			log.error('Could not open collection: %s', error);
			return callback('database not available');
		}
		collection.update({name: object.name}, {'$set': object}, {upsert: true, w: 1}, function(error, result)
		{
			if (error)
			{
				log.error('Could not update package %s: %s', object.name, error);
				return callback('database not available');
			}
			return callback(null, result);
		});
	});
};

exports.find = function(name, callback)
{
	openCollection(function(error, collection)
	{
		if (error)
		{
			log.error('Could not open collection: %s', error);
			return callback('database not available');
		}
		collection.findOne({name: name}, function(error, result)
		{
			if (error)
			{
				log.error('Could not read package %s: %s', name, error);
				return callback('database not available');
			}
			return callback(null, result);
		});
	});
};

function testFind(callback)
{
	var name = 'test_package';
	var value = '187349';
	var object = {
		name: name,
		value: value,
	};
	exports.update(object, function(error)
	{
		testing.check(error, 'Could not save object', callback);
		exports.find(name, function(error, result)
		{
			testing.check(error, 'Could not find package', callback);
			testing.assert(result, 'Did not find package', callback);
			testing.assertEquals(result.value, value, 'Invalid value', callback);
			testing.success(callback);
		});
	});
}

exports.listAll = function(callback)
{
	openCollection(function(error, collection)
	{
		if (error)
		{
			log.error('Could not open collection: %s', error);
			return callback('database not available');
		}
		collection.find({}, {name: true}).toArray(function(error, result)
		{
			if (error)
			{
				log.error('Could not list packages: %s', error);
				return callback('database not available');
			}
			return callback(null, result);
		});
	});
};

function testListAll(callback)
{
	exports.listAll(function(error, result)
	{
		testing.check(error, 'Could not list packages', callback);
		testing.assert(result, 'Did not list packages', callback);
		testing.success(callback);
	});
}

exports.remove = function(name, callback)
{
	openCollection(function(error, collection)
	{
		if (error)
		{
			log.error('Could not open collection: %s', error);
			return callback('database not available');
		}
		collection.remove({name: name}, {w: 1}, callback);
	});
};

function testRemove(callback)
{
	var name = 'to_remove';
	var object = {
		name: name,
	};
	exports.update(object, function(error)
	{
		testing.check(error, 'Could not save object', callback);
		exports.find(name, function(error, result)
		{
			testing.check(error, 'Could not find package', callback);
			testing.assert(result, 'Did not find package', callback);
			exports.remove(name, function(error)
			{
				testing.check(error, 'Could not remove package', callback);
				exports.find(name, function(error, result)
				{
					testing.check(error, 'Could not find package again', callback);
					testing.assert(!result, 'Should not find package', callback);
					testing.success(callback);
				});
			});
		});
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
		testOpenCollection,
		testFind,
		testListAll,
		testRemove,
		testClose,
	], callback);
};

// start tests if invoked directly
if (__filename == process.argv[1]) {
	exports.test(testing.show);
}

