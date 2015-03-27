'use strict';

/**
 * Utilities on packages.
 * (C) 2015 Diego Lafuente.
 */

// requires
var config = require('../config.js');
var testing = require('testing');
var requestLib = require('request');
var Log = require('log');

// globals
var log = new Log(config.logLevel);

/**
 * Finds a package by name and package manager.
 * @param package[required]: an object describing a package as by its name and package manager, like {name:"loadtest", manager:"npm"}
 * @param callback[required]: a function(error, result) to be called when finished
 * @return This method returns through the callback parameter. Returns an error if the package is invalid (i.e. has no name)
 * Returns nil if the package was not found. Returns a proper entry {name, repository, description} if it was
 */
exports.find = function (packageObject, callback) {
	if (!packageObject || !packageObject.name)
	{
		log.error('null package or package without name: ' + JSON.stringify(packageObject));
		return callback(JSON.stringify(packageObject) + ' is null or has no name');
	}
	var registryUrl = 'http://registry.npmjs.org/' + packageObject.name;
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

/************************************************
 **************** UNIT TESTS ********************
 ************************************************/
function testFindNoPackage(callback) {
	exports.find(null, function (error, result) {
		testing.check(result, callback);
		testing.assert(error, 'no error returned in empty package', callback);
		testing.success(callback);
	});
}

function testFindNoNamedPackage(callback) {
	exports.find({}, function (error, result) {
		testing.check(result, callback);
		testing.assert(error, 'no error returned in no-named package', callback);
		testing.success(callback);
	});
}

function testFindErrorResponse(callback) {
	//stub requestLib.get
	var restoreRequestLibGet = requestLib.get;
	requestLib.get = function (url, internalCallback) {
		internalCallback({check:true});
	};
	exports.find({name:'test'}, function (error, result) {
		testing.check(result, callback);
		testing.assert(error, 'no error returned when request returned error', callback);
		testing.assert(error.check, 'wrong error returned', callback);
		//restore requestLib.get
		requestLib.get = restoreRequestLibGet;
		testing.success(callback);
	});
}

function testFindErrorInvalidJsonResponse(callback) {
	//stub requestLib.get
	var restoreRequestLibGet = requestLib.get;
	requestLib.get = function (url, internalCallback) {
		internalCallback(null, 'invalid_json');
	};
	exports.find({name:'test'}, function (error, result) {
		testing.check(result, callback);
		testing.assert(error, 'no error returned when request returned invalid json', callback);
		//restore requestLib.get
		requestLib.get = restoreRequestLibGet;
		testing.success(callback);
	});
}

function testFindValidResponse(callback) {
	//stub requestLib.get
	var restoreRequestLibGet = requestLib.get;
	requestLib.get = function (url, internalCallback) {
		internalCallback(null, null, '{"name":"testName","repository":"testRepository","description":"testDescription"}');
	};
	exports.find({name:'test'}, function (error, result) {
		testing.check(error, callback);
		testing.assertEquals(result.name, 'testName', 'wrong name in response for valid request', callback);
		testing.assertEquals(result.repository, 'testRepository', 'wrong repository in response for valid request', callback);
		testing.assertEquals(result.description, 'testDescription', 'wrong description in response for valid request', callback);
		//restore requestLib.get
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
		testFindNoPackage,
		testFindNoNamedPackage,
		testFindErrorResponse,
		testFindErrorInvalidJsonResponse,
		testFindValidResponse
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}