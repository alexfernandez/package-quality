'use strict';

/**
 * A simple cache.
 * (C) 2015 Diego Lafuente.
 */

 // requires
require('prototypes');
var moment = require('moment');
var testing = require('testing');

// globals
var defaultExpiration = 20.0;
var cache = {};

/**
 * Sets a value for a key in the cache. An optional expiration parameter will set the life of the register.
 * @param key[required]: the key that wants to be set in the cache. Will return false if key is null of undefined.
 * @param value[optional]: the value to be set in the cache.
 * @param expiration[optional]: the expiration (in seconds) for the key-value pair. If falsy, defaultExpiration will apply.
 * @return true if everything went ok, false otherwise.
 */
exports.set = function(key, value, expiration) 
{
	if (key === null || key === undefined)
	{
		return false;
	}
	expiration = expiration || defaultExpiration;
	cache[key] = {
		value: value,
		expiration: moment().add(expiration, 'seconds')
	};
	return true;
};

/**
 * Gets a value for a key in the cache. Will return null if the value for the key is null, if the registry has expired or if it does not exist.
 * @param key[required]: the key that wants to be fetched from the cache. 
 * @return the value stored in the cache. Will return null if the value for the key is null, if the registry has expired or if it does not exist.
 */
exports.get = function(key) 
{
	if (key === null || key === undefined || cache[key] === undefined)
	{
		return null;
	}
	if (cache[key].expiration < moment())
	{
		delete cache[key];
		return null;
	}
	return cache[key].value;
};

/*
 * Clears the cache
 */
exports.clear = function ()
{
	cache = {};
};

/*
 * Clears the expired registries
 */
function clearExpired()
{
	var now = moment();
	for (var key in cache)
	{
		if (cache[key].expiration < now)
		{
			delete cache[key];
		}
	}
}

// TODO!!: set timeout with a period (repetitive) and assign it to a variable 
//setTimeout(clearExpired, defaultExpiration * 1000);

/************************************************
 **************** UNIT TESTS ********************
 ************************************************/
function testSetInvalidKey(callback)
{
	testing.assertEquals(exports.set(), false, 'trying to set with undefined key should return false', callback);
	testing.assertEquals(exports.set(null, 'valid'), false, 'trying to set with null key should return false', callback);
	testing.success(callback);
}

function testGetInvalidKey(callback)
{
	testing.assert(exports.get() === null, 'calling get with undefined key should return null', callback);
	testing.assert(exports.get(null) === null, 'calling get with null key should return null', callback);
	testing.assert(exports.get('unexisting') === null, 'calling get with unexisting key should return null', callback);
	testing.success(callback);
}

function testClearExpired(callback)
{
	var key = 'testkey';
	var value = 'testvalue';
	var expiration = 1.0;
	testing.assert(exports.set(key, value, expiration), 'valid set did not return true',callback);
	testing.assert(cache[key], 'cache should have the entered key', callback);
	setTimeout(function() {
		clearExpired();
		testing.check(cache[key], callback);
		testing.success(callback);
	}, expiration * 1000 + 1000);
}

function testValidCycleCache(callback) 
{
	var key = 'testkey';
	var value = 'testvalue';
	var expiration = 1.0;
	testing.assertEquals(cache.countProperties(), 0, 'cache should be empty in the beginning', callback);
	testing.assert(exports.set(key, value, expiration), 'valid set did not return true',callback);
	testing.assertEquals(exports.get(key), value, 'wrong value returned by cache.get', callback);
	setTimeout(function() {
		testing.assert(exports.get(key) === null, 'expired key should return null', callback);
		testing.success(callback);
	}, expiration * 1000);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	testing.run([
		testSetInvalidKey,
		testGetInvalidKey,
		testClearExpired,
		testValidCycleCache
	], 10000, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}



