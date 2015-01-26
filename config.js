'use strict';

/**
 * Global config settings.
 * (C) 2015 Diego Lafuente.
 */

exports.logLevel = 'info';
exports.limit = 35;
exports.expressPort = 80;
exports.packagesCollection = 'packages';
exports.mongoConnection = 'mongodb://localhost/quality?autoReconnect=true&connectTimeoutMS=5000';
exports.testMongoConnection = 'mongodb://localhost/qualitytest?autoReconnect=true&connectTimeoutMS=5000';