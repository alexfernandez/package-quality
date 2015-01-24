'use strict';

/**
 * Global config settings.
 * (C) 2015 Diego Lafuente.
 */

exports.logLevel = 'info';
exports.limit = 100;
exports.expressPort = 80;
exports.packagesCollection = 'packages';
exports.maxGithubApiCallsPerHour = 5000;
exports.mongoConnection = 'mongodb://localhost/quality?autoReconnect=true&connectTimeoutMS=5000';
exports.testMongoConnection = 'mongodb://localhost/qualitytest?autoReconnect=true&connectTimeoutMS=5000';