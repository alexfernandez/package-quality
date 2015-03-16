'use strict';

var Canvas = require('canvas');
var Image = Canvas.Image;
var fs = require('fs');

exports.compileBadge = function (name, quality, callback) {

	if (name.length > 10) {
		name = name.slice(0, 7) + '...';
	}
	var canvas = new Canvas(128, 32);
	var ctx = canvas.getContext('2d');

	fs.readFile(__dirname + '/../app/img/badge.png', function(err, data){
		if (err) {
			throw err;
		}
		var img = new Image();
		img.src = data;
		ctx.drawImage(img, 0, 0, 128, 32);

		ctx.font = '13px monospace';
		ctx.textAlign = 'right';
		ctx.fillText(name, 122, 14);

		ctx.font = '10px monospace';
		ctx.textAlign = 'right';
		ctx.fillText('score: ' + quality, 122, 26);

		//canvas.toDataURL('image/png', callback);
		canvas.toBuffer(callback);
	});

};
