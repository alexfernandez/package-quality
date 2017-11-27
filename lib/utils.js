'use strict';
var testing = require('testing');

exports.urlEncodeRepoName = function(name) {
  return name.replace(/\//g, '%2F');
};

/************************************************
 **************** UNIT TESTS ********************
 ************************************************/
function testUrlEncodeRepoName(callback)
{
  var result = exports.urlEncodeRepoName('kkfu');
  testing.assertEquals(result, 'kkfu', 'wrong result for regular string');
  result = exports.urlEncodeRepoName('@storybook/react');
  testing.assertEquals(result, '@storybook%2Freact', 'wrong result for scoped string');
  result = exports.urlEncodeRepoName('@storybook/react/kkfu');
  testing.assertEquals(result, '@storybook%2Freact%2Fkkfu', 'wrong result for multi-scoped string');
  testing.success(callback);
}

/**
 *  * Run all tests.
 *   */
exports.test = function(callback)
{
  testing.run([
      testUrlEncodeRepoName
  ], 10000, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
  exports.test(testing.show);
}

