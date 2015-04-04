'use strict';

// requires
require('prototypes');
var Canvas = require('canvas');
var testing = require('testing');
var fs = require('fs');
var basicRequest = require('basic-request');
var Log = require('log');
var config = require('../config.js');

// constants
var MAX_PACKAGE_NAME = 19;
var RATING_PARAM = '$rating$';
var COLOR_PARAM = '$color$';
var SHIELDS_IO_URL = 'https://img.shields.io/badge/quality-' + RATING_PARAM + '-' + COLOR_PARAM + '.svg?';

// globals
var log = new Log(config.logLevel);
var badge = fs.readFileSync(__dirname + '/../app/img/badge2.png');
var stars = {};
for (var i = 0.5; i <= 5; i += 0.5) {
	stars[i] = fs.readFileSync(__dirname + '/../app/img/stars' + i + '.png');
}
var ranges = [
	[0, 1],
	[12, 25],
	[37, 50],
	[62, 75],
	[87, 99],
];
var colors = {
	0: 'lightgrey',
	0.5: 'red',
	1: 'red',
	1.5: 'red',
	2: 'orange',
	2.5: 'orange',
	3: 'yellow',
	3.5: 'yellow',
	4: 'lightgreen',
	4.5: 'green',
	5: 'brightgreen',
};


function getStarsCount(score) {
	if (!score)
	{
		return 0;
	}
	var range;
	for (var i = 0, len = ranges.length; i < len; i++) {
		range = ranges[i];
		if (score < range[0]) {
			return i;
		}
		if (score < range[1]) {
			return i + '.5';
		}
	}
	return '5';
}

function getStarsImage(score) {
	return stars[getStarsCount(score)];
}

exports.compileBadge = function (name, quality, callback) {

	if (name.length > MAX_PACKAGE_NAME) {
		name = name.slice(0, MAX_PACKAGE_NAME - 3) + '...';
	}
	var canvas = new Canvas(256, 64);
	var context = canvas.getContext('2d');

	var image = new Canvas.Image();
	image.src = badge;
	context.drawImage(image, 0, 0, 256, 64);

	context.font = '15px monospace';
	context.textAlign = 'right';
	context.fillText(name, 244, 23);

	var starsImage = new Canvas.Image();
	starsImage.src = getStarsImage(quality);
	context.drawImage(starsImage, 155, 27, 92, 17);

	//canvas.toDataURL('image/png', callback);
	canvas.toBuffer(callback);
};

function convertToText(stars)
{
	var text = '';
	for (var i = 0; i < 5; i++)
	{
		if (stars <= i)
		{
			text += '☆';
		}
		else if (stars >= i + 1)
		{
			text += '★';
		}
		else
		{
			text += '½';
		}
	}
	return text;
}

function testStarsText(callback)
{
	testing.assertEquals(convertToText(0), '☆☆☆☆☆', callback);
	testing.assertEquals(convertToText(0.5), '½☆☆☆☆', callback);
	testing.assertEquals(convertToText(1), '★☆☆☆☆', callback);
	testing.assertEquals(convertToText(3.5), '★★★½☆', callback);
	testing.assertEquals(convertToText(5), '★★★★★', callback);
	testing.success(callback);
}

function convertToColor(stars)
{
	return colors[stars];
}

exports.retrieveShield = function(name, quality, queryString, callback)
{
	var stars = getStarsCount(quality);
	var text = convertToText(stars);
	log.info('Shield for %s: quality %s, stars %s, text %s', name, quality, stars, text);
	var color = convertToColor(stars);
	var url = SHIELDS_IO_URL.replace(RATING_PARAM, text).replace(COLOR_PARAM, color) + queryString;
	basicRequest.get(url, function(error, body)
	{
		if (error)
		{
			log.error('Could not get shield for %s from %s: %s', name, url, error);
			return callback('Could not retrieve badge');
		}
		return callback(null, body);
	});
};

function testRetrieveShield(callback)
{
	exports.retrieveShield('test', 65, '', function(error, result)
	{
		testing.check(error, 'Could not retrieve shield', callback);
		testing.assert(result, 'Did not retrieve shield', callback);
		testing.assert(result.contains('★★★½☆'), 'Invalid text', callback);
		testing.assert(result.contains('quality'), 'Invalid text', callback);
		testing.success(callback);
	});
}

exports.test = function(callback)
{
	testing.run([
		testStarsText,
		testRetrieveShield,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

