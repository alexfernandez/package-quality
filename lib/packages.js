'use strict';

// requires
var Log = require('log');
var testing = require('testing');
var db = require('./db.js');
var requestLib = require('request');
var config = require('../config.js');

// globals
var packagesCollection;
var pendingCollection;
var log = new Log(config.logLevel);


exports.setTestMode = function(callback)
{
	db.setTestMode();
	db.reconnect(function(error)
	{
		if (error)
		{
			return callback(error);
		}
		packagesCollection = null;
		pendingCollection = null;
		return callback(null);
	});
};

exports.unsetTestMode = function(callback)
{
	db.unsetTestMode();
	db.reconnect(function(error)
	{
		if (error)
		{
			return callback(error);
		}
		packagesCollection = null;
		pendingCollection = null;
		return callback(null);
	});
};

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
	packagesCollection = null;
	db.setTestMode();
	db.reconnect(function(error)
	{
		testing.check(error, 'Could not set test mode', callback);
		// init
		openCollection(function(error, collection)
		{
			testing.check(error, 'Could not open collection', callback);
			testing.assert(collection, 'Did not open collection', callback);
			testing.success(callback);
		});
	});
}

function openPendingCollection(callback)
{
	if (pendingCollection)
	{
		return callback(null, pendingCollection);
	}
	db.addCallback(function(error, result)
	{
		if (error)
		{
			return callback('Could not access database: ' + error);
		}
		pendingCollection = result.collection(config.pendingCollection);
		if (pendingCollection)
		{
			return callback(null, pendingCollection);
		}
		result.createCollection(config.pendingCollection, function(error)
		{
			if (error)
			{
				return callback(error);
			}
			return callback(null, result.collection(config.pendingCollection));
		});
	});
}

function testOpenPendingCollection(callback)
{
	pendingCollection = null;
	db.setTestMode();
	db.reconnect(function(error)
	{
		testing.check(error, 'Could not set test mode', callback);
		// init
		openPendingCollection(function(error, collection)
		{
			testing.check(error, 'Could not open collection', callback);
			testing.assert(collection, 'Did not open collection', callback);
			testing.success(callback);
		});
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

exports.updatePending = function(object, callback)
{
	openPendingCollection(function(error, collection)
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
	packagesCollection = null;
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

exports.findPending = function(name, callback)
{
	openPendingCollection(function(error, collection)
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

function testFindPending(callback)
{
	var name = 'test_package';
	var value = '187349';
	var object = {
		name: name,
		value: value,
	};
	pendingCollection = null;
	exports.updatePending(object, function(error)
	{
		testing.check(error, 'Could not save object', callback);
		exports.findPending(name, function(error, result)
		{
			testing.check(error, 'Could not find package', callback);
			testing.assert(result, 'Did not find package', callback);
			testing.assertEquals(result.value, value, 'Invalid value', callback);
			testing.success(callback);
		});
	});
}

/**
 * Finds a package in the npm registry by name.
 * @param name[required]: the name of the npm package
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Returns an error if the name is null or empty. It also returns an error if the request to npm registry fails
 * Returns an error if the package was not found. Returns a proper entry {name, repository, description} if it was
 */
exports.findInNpmRegistry = function (name, callback) 
{
	if (!name)
	{
		return callback('name is null or empty');
	}
	var registryUrl = 'http://registry.npmjs.org/' + name;
	requestLib.get(registryUrl, function(error, getResponse, body)
    {
        if (error)
        {
            return callback(error);
        }
        var registryResponse;
        try
        {
            registryResponse = JSON.parse(body);
        }
        catch(exception)
        {
            return callback(exception);
        }
        var result = {
            name: registryResponse.name,
            repository: registryResponse.repository,
            description: registryResponse.description
        };
        return callback(null, result);
    });
};

function testFindInNpmRegistryNullName(callback) 
{
	exports.findInNpmRegistry(null, function (error, result) {
		testing.check(result, callback);
		testing.assert(error, 'no error returned in null name', callback);
		testing.success(callback);
	});
}

function testFindInNpmRegistryEmptyName(callback) 
{
	exports.findInNpmRegistry('', function (error, result) {
		testing.check(result, callback);
		testing.assert(error, 'no error returned in empty-named package', callback);
		testing.success(callback);
	});
}

function testFindInNpmRegistryErrorResponse(callback) 
{
	//stub requestLib.get
	var restoreRequestLibGet = requestLib.get;
	requestLib.get = function (url, internalCallback) {
		internalCallback({check:true});
	};
	exports.findInNpmRegistry('test', function (error, result) {
		testing.check(result, callback);
		testing.assert(error, 'no error returned when request returned error', callback);
		testing.assert(error.check, 'wrong error returned', callback);
		//restore requestLib.get
		requestLib.get = restoreRequestLibGet;
		testing.success(callback);
	});
}

function testFindInNpmRegistryErrorInvalidJsonResponse(callback) 
{
	//stub requestLib.get
	var restoreRequestLibGet = requestLib.get;
	requestLib.get = function (url, internalCallback) {
		internalCallback(null, 'invalid_json');
	};
	exports.findInNpmRegistry('test', function (error, result) {
		testing.check(result, callback);
		testing.assert(error, 'no error returned when request returned invalid json', callback);
		//restore requestLib.get
		requestLib.get = restoreRequestLibGet;
		testing.success(callback);
	});
}

function testFindInNpmRegistryValidResponse(callback) 
{
	//stub requestLib.get
	var restoreRequestLibGet = requestLib.get;
	requestLib.get = function (url, internalCallback) {
		internalCallback(null, null, '{"name":"testName","repository":"testRepository","description":"testDescription"}');
	};
	exports.findInNpmRegistry('test', function (error, result) {
		testing.check(error, callback);
		testing.assertEquals(result.name, 'testName', 'wrong name in response for valid request', callback);
		testing.assertEquals(result.repository, 'testRepository', 'wrong repository in response for valid request', callback);
		testing.assertEquals(result.description, 'testDescription', 'wrong description in response for valid request', callback);
		//restore requestLib.get
		requestLib.get = restoreRequestLibGet;
		testing.success(callback);
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
	packagesCollection = null;
	exports.listAll(function(error, result)
	{
		testing.check(error, 'Could not list packages', callback);
		testing.assert(result, 'Did not list packages', callback);
		testing.success(callback);
	});
}

exports.listAllPending = function(callback)
{
	openPendingCollection(function(error, collection)
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

function testListAllPending(callback)
{
	pendingCollection = null;
	exports.listAllPending(function(error, result)
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
	packagesCollection = null;
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

exports.removePending = function(name, callback)
{
	openPendingCollection(function(error, collection)
	{
		if (error)
		{
			log.error('Could not open collection: %s', error);
			return callback('database not available');
		}
		collection.remove({name: name}, {w: 1}, callback);
	});
};

function testRemovePending(callback)
{
	var name = 'to_remove';
	var object = {
		name: name,
	};
	pendingCollection = null;
	exports.updatePending(object, function(error)
	{
		testing.check(error, 'Could not save object', callback);
		exports.findPending(name, function(error, result)
		{
			testing.check(error, 'Could not find package', callback);
			testing.assert(result, 'Did not find package', callback);
			exports.removePending(name, function(error)
			{
				testing.check(error, 'Could not remove package', callback);
				exports.findPending(name, function(error, result)
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
		testOpenPendingCollection,
		testFind,
		testFindPending,
		testListAll,
		testListAllPending,
		testRemove,
		testRemovePending,
		testFindInNpmRegistryNullName,
		testFindInNpmRegistryEmptyName,
		testFindInNpmRegistryErrorResponse,
		testFindInNpmRegistryErrorInvalidJsonResponse,
		testFindInNpmRegistryValidResponse,
		testClose
	], callback);
};

// start tests if invoked directly
if (__filename == process.argv[1]) {
	exports.test(testing.show);
}

