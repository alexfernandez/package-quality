'use strict';

// requires
var Canvas = require('canvas');
var fs = require('fs');

// constants
var MAX_PACKAGE_NAME = 19;

// globals
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

function getStarsCount(score) {
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
	var ctx = canvas.getContext('2d');

	var img = new Canvas.Image();
	img.src = badge;
	ctx.drawImage(img, 0, 0, 256, 64);

	ctx.font = '15px monospace';
	ctx.textAlign = 'right';
	ctx.fillText(name, 244, 23);

	var starsImage = new Canvas.Image();
	starsImage.src = getStarsImage(quality);
	ctx.drawImage(starsImage, 155, 27, 92, 17);

	//canvas.toDataURL('image/png', callback);
	canvas.toBuffer(callback);
};

