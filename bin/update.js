#!/usr/bin/env node
'use strict';

/**
 * Update only expired packages (those with nextUpdate previous to current date)
 * (C) 2015 Diego Lafuente.
 */

// requires
require('prototypes');
var update = require('../lib/update.js');
var config = require('../config.js');
var Log = require('log');

// globals
var log = new Log(config.logLevel);


function update()
{
	var offset = process.argv[2] || 0;
	var all;
	// read all.json and apply offset
	log.info('loading all.json...');
	try
	{
		all = require('../all.json');
		delete all._updated;
	}
	catch(exception)
	{
		log.error('Could not parse all.json: ' + exception);
		process.exit(1);
	}
	log.info('all.json loaded');
	var names = Object.keys(all);
	log.info('All packages: ' + names.length);
	if (offset)
	{
		log.info('Offset ' + offset);
		for (var i=0; i<offset; i++)
		{
			delete all[names.shift()];
		}
	}
	log.info('All packages after offset: ' + names.length);
	update.goOver(all, function(error, result)
	{
		if (error)
		{
			log.error('Could not evaluate all: %s', error);
			process.exit(1);
		}
		log.info('Processed ' + result + ' chunks of approx ' + config.limit + ' elements each.');
		process.exit(0);
	});
}

update();

