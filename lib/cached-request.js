'use strict';

/**
 * Wrapper over the request library featuring a cache.
 * (C) 2015 Diego Lafuente.
 */

// requires
var config = require('../config.js');
var requestLib = require('request');
var cache = require('./cache.js');
var testing = require('testing');
var Log = require('log');

// globals
var log = new Log(config.logLevel);

/**
 * Wraps request.get including the cache option
 * @param url[required]: the url to call
 * @param shouldCache[optional]: boolean indicating if the request should be cached. Defaults to false.
 * @param callback[required]: a function(error, response, body) to be called when finished
 */
 exports.get = function(url, shouldCache, callback) {
 	if (typeof shouldCache === 'function') {
 		callback = shouldCache;
 		shouldCache = false;
 	}
 	// check cache if needed
 	if (shouldCache) {
	 	var cachedResponse = cache.get(url);
	 	if (cachedResponse) {
	 		log.debug('returning cached response for ' + url);
	 		return callback (null, null, cachedResponse);
	 	} 
 	}
 	requestLib.get(url, function(error, response, body) {
 		// cache response if everything ok and cache is true
 		if (shouldCache && !error && response.statusCode === 200) {
 			log.debug('setting cahe for ' + url);
 			cache.set(url, body);
 		}
 		return callback (error, response, body);
 	});
};

/************************************************
 **************** UNIT TESTS ********************
 ************************************************/
function testShouldCacheOmitted(callback) {
	var testUrl = 'testUrl';
	//stubs
	var restoreRequestLibGet = requestLib.get;
	requestLib.get = function(url, internalCallback) {
		testing.assertEquals(url, testUrl, 'wrong url passed to request.get', callback);
		return internalCallback(null, 'testResponse', 'testBody');
	};
	var restoreCache = cache;
	cache = {
		get: function() {
			testing.assert(false, 'cache.get should not be called');
		},
		set: function() {
			testing.assert(false, 'cache.set should not be called');
		}
	};

	exports.get(testUrl, function (error, response, body) {
		testing.check(error, callback);
		testing.assertEquals(response, 'testResponse', 'wrong response', callback);
		testing.assertEquals(body, 'testBody', 'wrong response', callback);
		// restore
		cache = restoreCache;
		requestLib.get = restoreRequestLibGet;
		testing.success(callback);
	});
}

function testShouldCacheFalse(callback) {
	var testUrl = 'testUrl';
	//stubs
	var restoreRequestLibGet = requestLib.get;
	requestLib.get = function(url, internalCallback) {
		testing.assertEquals(url, testUrl, 'wrong url passed to request.get', callback);
		return internalCallback(null, 'testResponse', 'testBody');
	};
	var restoreCache = cache;
	cache = {
		get: function() {
			testing.assert(false, 'cache.get should not be called');
		},
		set: function() {
			testing.assert(false, 'cache.set should not be called');
		}
	};

	exports.get(testUrl, false, function (error, response, body) {
		testing.check(error, callback);
		testing.assertEquals(response, 'testResponse', 'wrong response', callback);
		testing.assertEquals(body, 'testBody', 'wrong response', callback);
		// restore
		cache = restoreCache;
		requestLib.get = restoreRequestLibGet;
		testing.success(callback);
	});
}

function testShouldCacheTrue(callback) {
	var testUrl = 'testUrl';
	//stubs
	var restoreRequestLibGet = requestLib.get;
	requestLib.get = function(url, internalCallback) {
		testing.assertEquals(url, testUrl, 'wrong url passed to request.get', callback);
		return internalCallback(null, {statusCode: 200}, 'testBody');
	};
	var restoreCache = cache;
	cache = {
		get: function(key) {
			testing.assertEquals(key, testUrl, 'wrong url passed to cache.get', callback);
		},
		set: function(key, value) {
			testing.assertEquals(key, testUrl, 'wrong url passed to cache.set', callback);
			testing.assertEquals(value, 'testBody', 'wrong url passed to cache.set', callback);
		}
	};

	exports.get(testUrl, true, function (error, response, body) {
		testing.check(error, callback);
		testing.assertEquals(body, 'testBody', 'wrong response', callback);
		// restore
		cache = restoreCache;
		requestLib.get = restoreRequestLibGet;
		testing.success(callback);
	});
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
    testing.run([
    	testShouldCacheOmitted,
    	testShouldCacheFalse,
    	testShouldCacheTrue
    ], function (error, result) {
    	cache.clearInterval();
    	return callback (error, result);
    });
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
    exports.test(testing.show);
}