'use strict';

/*
 * TuiInnovation database class.
 * Connect to MongoDB, return a collection.
 *
 * Copyright (C) 2013 TuiInnovation.
 */

// requires
var MongoClient = require('mongodb').MongoClient;
var config = require('../config.js');
var Log = require('log');
var testing = require('testing');

// globals
var log = new Log(config.logLevel);
var db = null;
var callbacks = [];
var isClosed = null;
var connectionString = config.mongoConnection;

// init
connect();

/**
 * Connect to the database.
 */
function connect() {
	var connection = connectionString;
	MongoClient.connect(connection, {w: 1}, function(error, result) {
		if (connectionString != connection) {
			// connection string changed on the fly; close and ignore
			log.debug('Discarding open connection to %s', connection);
			result.close();
			return;
		}
		if (error) {
			log.error('Could not connect to MongoDB: %s', error);
		} else {
			//close db before assigning a new one
			log.debug('opening database: ' +  connectionString);
			if (db) {
				db.close(true);
			}
			db = result;
			isClosed = false;
			while (callbacks.length > 0) {
				var callback = callbacks.shift();
				callback(error, db);
			}
			
		}
	});
}

/**
 * Check whether the db is open or closed
 */
exports.isClosed = function() {
	return (isClosed !== false);
};

/**
 * Add a new callback for database online.
 */
exports.addCallback = function(callback) {
	if (db) {
		if (isClosed === true) {
			callbacks.push(callback);
			return connect();
		}
		// db open
		return callback(null, db);
	}
	callbacks.push(callback);
};

/**
 * Reconnect to the database, possibly with different paramters.
 */
exports.reconnect = function(callback) {
	if (callback) {
		callbacks.push(callback);
	}
	return connect();
};

/**
 * Closes the db connection
 */
exports.close = function(callback) {
	if (!db)
	{
		return callback(null);
	}
	db.close(true, function (error, result) {
		isClosed = true;
		callback (error, result);
	});
};

/**
 * Get a collection.
 */
exports.getCollection = function(name) {
	if (!db) {
		return null;
	}
	return db.collection(name);
};

exports.setTestMode = function()
{
	connectionString = config.testMongoConnection;
};

exports.unsetTestMode = function()
{
	connectionString = config.mongoConnection;
};

/***********************************
 ************ UNIT TESTS ***********
 ***********************************/

function testCollection(callback) {
	exports.addCallback(function(error) {
		testing.check(error, 'Could not start database', callback);
		testing.assertEquals(isClosed, false, 'Did not open database', callback);
		var test = exports.getCollection('test');
		testing.assert(test, 'Empty test collection', callback);
		test.count(function(error) {
			testing.check(error, 'Could not get test count');
			testing.success(callback);
		});
	});
}

function testReconnect(callback) {
	exports.setTestMode();
	exports.reconnect(function() {
		testing.assertEquals(isClosed, false, 'Did not open database', callback);
		var test = exports.getCollection('test');
		testing.assert(test, 'Empty test collection', callback);
		test.count(function(error/*, count*/) {
			testing.check(error, 'Could not get test count: ' + JSON.stringify(error));
			exports.unsetTestMode();
			testing.success(callback);
		});
	});
}

function testClose(callback) {
	exports.close(function(error) {
		testing.check(error, 'Could not close database', callback);
		testing.assertEquals(isClosed, true, 'wrong value for isClosed', callback);
		//add callback and check that the db opens again
		exports.addCallback(function(error) {
			testing.check(error, 'Could not start database', callback);
			testing.assertEquals(isClosed, false, 'Did not open database', callback);
			var test = exports.getCollection('test');
			testing.assert(test, 'Empty test collection', callback);
			test.count(function(error) {
				testing.check(error, 'Could not get test count');
				testing.success(callback);
			});
		});
	});
}

/**
 * Run all tests.
 */
exports.test = function(callback) {
	testing.run({
		reconnect: testReconnect,
		collection: testCollection,
		close: testClose
	}, function(error, result) {
		exports.close(function(/*err*/) {
			log.debug ('closing mongo');
			callback (error, result);
		});
	});
};

// start tests if invoked directly
if (__filename == process.argv[1]) {
    exports.test(testing.show);
}
