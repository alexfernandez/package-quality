/*global angular, $*/

var app = angular.module('PackageQuality', ['ui.bootstrap']);

app.controller('MainController', ['$scope', '$timeout', function($scope, $timeout){
	'use strict';

	$scope.packages = ['sergio', 'pepe', 'serio', 'josete', 'pepita'];
	$scope.query = null;
	$scope.package = null;
	$scope.metrics = ['repoQuality', 'downloadsQuality', 'versionsQuality'];

	$scope.$watch('query', function (query) {
		if ($scope.packages.indexOf(query) === -1) {
			return;
		}
		console.log('query chages to "%s"', query);

		$scope.isLoadingPackage = true;
		$timeout(function () {
			$scope.isLoadingPackage = false;
			$scope.package = {
				"_id": "54cb2b46465dcde6761dc044",
				"name": "stdio",
				"source": "npm",
				"repoQuality": 0.9761904761904763,
				"repoFactors": {
					"totalFactor": 0.9285714285714286,
					"openFactor": 1,
					"longOpenFactor": 1
				},
				"downloadsQuality": 0.9999891826403011,
				"versionsQuality": 0.9444444444444444,
				"quality": 0.9219476988099072,
				"created": "2015-02-06T11:06:21+00:00",
				"lastUpdated": "2015-02-11T01:56:16+00:00",
				"nextUpdate": "2015-02-11T01:56:16+00:00",
				"timesUpdated": 2
			};
		}, 1000);

	});
}]);
