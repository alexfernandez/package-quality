/*global angular, $*/

var app = angular.module('PackageQuality', ['ui.bootstrap']);

app.factory('packages', ['$http', function ($http) {
	'use strict';

	return {
		get: function (packageName, callback) {
			var url = '/package/' + packageName;
			$http.get(url).success(function (result) {
				callback(null, result);
			}).error(function (description, status) {
				callback({error: description, status: status});
			});
		}
	};
}]);

app.filter('timeAgo', function () {
	'use strict';

	return function (date, attributesArray) {

		var attributes = {};
		attributesArray.forEach(function (attr) {
			attributes[attr] = true;
		});

		if (typeof date === 'string') {
			date = new Date(Date.parse(date));
		}
		var date2 = new Date();
		var diff = date2 - date;

		var msec = diff;
		var YY = Math.floor(msec / 1000 / 60 / 60 / 24 / 365);
		msec -= YY * 1000 * 60 * 60 * 24 * 365;
		var MM = Math.floor(msec / 1000 / 60 / 60 / 24 / 30);
		msec -= MM * 1000 * 60 * 60 * 24 * 30;
		var DD = Math.floor(msec / 1000 / 60 / 60 / 24);
		msec -= DD * 1000 * 60 * 60 * 24;
		var hh = Math.floor(msec / 1000 / 60 / 60);
		msec -= hh * 1000 * 60 * 60;
		var mm = Math.floor(msec / 1000 / 60);
		msec -= mm * 1000 * 60;
		var ss = Math.floor(msec / 1000);
		msec -= ss * 1000;

		return [
			((YY && (!attributes || attributes.years)) ? YY + ' years ': ''),
			((MM && (!attributes || attributes.months)) ? MM + ' months ': ''),
			((DD && (!attributes || attributes.days)) ? DD + ' days ': ''),
			((hh && (!attributes || attributes.hours)) ? hh + ' hours ': ''),
			((mm && (!attributes || attributes.minutes)) ? mm + ' minutes ' : ''),
			((ss && (!attributes || attributes.seconds)) ? ss + ' seconds ' : '')
		].join('') + ' ago';
	};
});

app.controller('MainController', ['$scope', 'packages', function($scope, packages){
	'use strict';

	$scope.packages = []; // Add items to autocomplete
	$scope.query = null;
	$scope.package = null;
	$scope.metrics = [{
		key: 'quality',
		label: 'Package quality'
	}, {
		key: 'repoQuality',
		label: 'Repo quality'
	}, {
		key: 'downloadsQuality',
		label: 'Downloads quality'
	}, {
		key: 'versionsQuality',
		label: 'Versions quality'
	}];

	$scope.genArray = function (count) {
		return new Array(count);
	};

	$scope.getStars = function (pack) {
		return Math.floor(pack.quality * 5);
	};

	$scope.keyup = function (isEnter) {
		if (!isEnter) {
			return;
		}
		$scope.isLoadingPackage = true;
		packages.get($scope.query, function (err, result) {
			$scope.isLoadingPackage = false;
			if (err) {
				$scope.package = {query: $scope.query, notfound: true};
				return;
			}
			$scope.package = result;
		});
	};
}]);
