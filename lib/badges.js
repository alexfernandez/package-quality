'use strict';

var Canvas = require('canvas');
var Image = Canvas.Image;
var fs = require('fs');
var MAX_PACKAGE_NAME = 19;

exports.compileBadge = function (name, quality, callback) {

	if (name.length > MAX_PACKAGE_NAME) {
		name = name.slice(0, MAX_PACKAGE_NAME - 3) + '...';
	}
	var canvas = new Canvas(256, 64);
	var ctx = canvas.getContext('2d');

	fs.readFile(__dirname + '/../app/img/badge2.png', function(err, data){
		if (err) {
			throw err;
		}
		var img = new Image();
		img.src = data;
		ctx.drawImage(img, 0, 0, 256, 64);

		ctx.font = '15px monospace';
		ctx.textAlign = 'right';
		ctx.fillText(name, 244, 23);

		ctx.font = '12px monospace';
		ctx.textAlign = 'right';
		ctx.fillText('Quality score: ' + quality, 245, 38);

		//canvas.toDataURL('image/png', callback);
		canvas.toBuffer(callback);
	});

};
