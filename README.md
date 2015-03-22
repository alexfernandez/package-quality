[![Package quality](http://packagequality.com/badge/package-quality.png)](http://packagequality.com/#?package=package-quality)

# package-quality

Measurements of quality for packages, initially for npm.

## Add Your Badge

To show the quality of your npm package, just add this image to your GitHub README:

```
[![Package quality](http://packagequality.com/badge/yourpackage.png)](http://packagequality.com/#?package=yourpackage)
```

Or, in HTML markup:

```
<a href="http://packagequality.com/#?package=yourpackage"><img src="http://packagequality.com/badge/yourpackage.png"/></a>
```

replacing `yourpackage` with (surprise!) the name of your package.

## Measuring Quality

Any objective measurements of quality are going to be flawed one way or another.
`package-quality` only attempts to give some indications about quality,
not be an absolute rating on which to bet your farm.
If you don't agree with our ratings, please [help us improve them](https://github.com/alexfernandez/package-quality/pulls)!

### Algorithm

The following factors are considered when calculating the quality of a package:
  - Versions quality (v): the more versions a package has, the more quality it is. We calculate v as ```v=1-1/total_number_of_versions```
  - Downloads quality (d): the more downloads a package has, the more quality is it. We calculate d as ```d=1-1/number_of_downloads_last_year```
  - Repo quality (r): if the package has no repo, the value of r is zero. Right now (there is an issue open to fix this), if the package does not have repo on Github, it's given ```r=0```. For those packages with a repo on Github, r is calculated considering these three factors:
    - Total factor (rt), calculated as ```rt=1-1/total_number_of_issues```
    - Open factor (ro): we consider "healthy" to have a 20% of open issues in your repo (20% of the total number of issues). Those packages with 20% or less open issues will have ```ro=1```. For those with more than 20%, ```ro=1.2-open_issues/total_number_of_issues```
    - Long open factor (rlo): we consider long open issues those who have been open more that 1 year and are still open today. This factor is calculated as ```rlo=1-long_open_issues/total_number_of_issues```. If a package has no open issues, then ```rlo=1```.

The repo quality r is calculated as the average of rt, ro and rlo: ```r=(rt+ro+rlo)/3```.

The overall quality of a package is ```q=v*d*r```.

### How to Understand Star Ratings

[![By xkcd](http://imgs.xkcd.com/comics/star_ratings.png)](http://xkcd.com/1098/)

### Other Repos

Right now the quality is computed only for npm packages.
But it is trivial to extend the ratings to other package managers,
since there are only external measurements from GitHub and npm:
we don't even look at the code.

If you want to extend package-quality to a new package manager,
you just need:

* a complete list of packages,
* and some way to get the downloads per year.

[Let us know](mailto:alexfernandeznpm@gmail.com) and we will set up a new subdomain.

## License (The MIT License)

Copyright (c) 2014,2015 Alex Fernández <alexfernandeznpm@gmail.com>,
[Diego Lafuente](https://github.com/tufosa),
Sergio García Mondaray <sgmonda@gmail.com>
and [contributors](https://github.com/alexfernandez/package-quality/graphs/contributors).

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


