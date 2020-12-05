/*global angular, $*/

var app = angular.module('PackageQuality', ['ui.bootstrap']);

/**
 * Packages HTTP access service
 **/
app.factory('packages', ['$http', function ($http) {
	'use strict';

	return {
		get: function (packageName, callback) {
			if (typeof packageName === 'function') {
				callback = packageName;
				packageName = null;
			}
			var url = packageName ? '/package/' + packageName.replace(/\//g, '%2F') : '/packages';
			$http.get(url).success(function (result) {
				callback(null, result);
			}).error(function (description, status) {
				callback({error: description, status: status});
			});
		}
	};
}]);

/**
 * Filter to transform dates into "X days ago" strings
 **/
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

		var timeStr = [
			((YY && (!attributes || attributes.years)) ? YY + ' years ': ''),
			((MM && (!attributes || attributes.months)) ? MM + ' months ': ''),
			((DD && (!attributes || attributes.days)) ? DD + ' days ': ''),
			((hh && (!attributes || attributes.hours)) ? hh + ' hours ': ''),
			((mm && (!attributes || attributes.minutes)) ? mm + ' minutes ' : ''),
			((ss && (!attributes || attributes.seconds)) ? ss + ' seconds ' : '')
		].join('');
		if (!timeStr) {
			return 'today';
		}
		return timeStr + ' ago';
	};
});

/**
 * Directive for auto selecting text in input fields
 **/
app.directive('selectOnClick', function () {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            element.on('click', function () {
                this.select();
            });
        }
    };
});

/**
 * Main controller
 * This handles GUI components for packages search
 **/
app.controller('MainController', ['$scope', '$location', 'packages', function($scope, $location, packages){
	'use strict';

	/**
	 * Flags and main properties declaration
	 **/
	$scope.query = null;
	$scope['package'] = null;
	$scope.DEBUG = $location.search().debug === 'true';

	/**
	 * Autocompletable packages
	 **/
	$scope.autocompletablePackages = ['hola', 'adios'];
	packages.get(function (err, packages) {
		if (err || !Array.isArray(packages)) {
			return;
		}
		$scope.autocompletablePackages = packages;
		console.log('Available packages ready!: %d packages', packages.length);
	});

	/**
	 * When location changes
	 **/
	$scope.$on('$locationChangeSuccess', function () {
		console.log('Location change! Arguments:', $location.search());
		$scope.query = $location.search()['package'];
		if ($scope.query) {
			loadPackage($location.search()['package']);
		}
	});

	/**
	 * Available metrics
	 **/
	$scope.metrics = [{
		key: 'repoTotalIssues',
		label: 'Total issues'
	}, {
		key: 'repoOpenIssues',
		label: 'Open issues'
	}, {
		key: 'repoLongOpenIssues',
		label: 'Long open issues'
	}, {
		key: 'versions',
		label: 'Versions quality'
	}, {
		key: 'downloads',
		label: 'Downloads quality'
	}];

	/**
	 * Retrieve the package info through HTTP
	 **/
	function loadPackage(packageName) {
		$scope.isLoadingPackage = true;
		packages.get(packageName, function (err, result) {
			$scope.isLoadingPackage = false;
			if (err) {
				$scope['package'] = {query: packageName, notfound: true};
				return;
			}
			$scope['package'] = result;
		});
	}

	/**
	 * Enter press event handler. Changes the location to start a search
	 **/
	$scope.keyup = function (keyCode) {
		var isEnter = (keyCode === 13);
		if (!isEnter) {
			return;
		}
		var args = {};
		if ($scope.query) {
			args['package'] = $scope.query;
		}
		if ($scope.DEBUG) {
			args.debug = 'true';
		}
		$location.search(args);
	};

	/**
	 * URLs
	 **/
	// TODO: this should be a property on the package
	$scope.siteUrl = function (pkg) {
		return 'https://packagequality.com/#?package=' + pkg.name;
	};
	$scope.packageUrl = function (pkg) {
		if (pkg.source !== 'npm') {
			return false;
		}

		return 'https://www.npmjs.com/package/' + pkg.name;
	};

	/**
	 * Badges
	 **/
	// TODO: this should probably be generated on the backend and passed down as a property
	$scope.genBadgeUrl = function (pkg) {
		return ['https://packagequality.com/badge/', pkg.name, '.png'].join('');
	};
	$scope.genShieldUrl = function (pkg) {
		return ['https://packagequality.com/shield/', pkg.name, '.svg'].join('');
	};
	$scope.shareFormats = [
		{
			title: 'Image',
			markup: $scope.genBadgeUrl
		}, {
			title: 'HTML',
			markup: function (pkg) {
				return ['<img src="', $scope.genBadgeUrl(pkg), '"/>'].join('');
			}
		}, {
			title: 'Markdown',
			markup: function (pkg) {
				return ['[![Package Quality](', $scope.genBadgeUrl(pkg), ')](', $scope.siteUrl(pkg), ')'].join('');
			}
		}, {
			title: 'Textile',
			markup: function (pkg) {
				return ['!', $scope.genBadgeUrl(pkg), '!:', $scope.siteUrl(pkg)].join('');
			}
		}, {
			title: 'Shield',
			markup: $scope.genShieldUrl
		}, {
			title: 'Shield markdown',
			markup: function (pkg) {
				return ['[![Package Quality](', $scope.genShieldUrl(pkg), ')](', $scope.siteUrl(pkg), ')'].join('');
			}
		}
	];
}]);
