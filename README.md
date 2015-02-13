package-quality
===============

Measurements of quality for packages, especially from npm.

<h3>Measuring quality</h3>

The following factors are considered when calculating the quality of a package:
  - Versions quality (v): the more versions a package has, the more quality it is. We calculate v as ```v=1-1/total_number_of_versions```
  - Downloads quality (d): the more downloads a package has, the more quality is it. We calculate d as ```d=1-1/number_of_downloads_last_year```
  - Repo quality (r): if the package has no repo, the value of r is zero. Right now (there is an issue open to fix this), if the package does not have repo on Github, it's given ```r=0```. For those packages with a repo on Github, r is calculated considering these three factors:
    - Total factor (rt), calculated as ```rt=1-1/total_number_of_issues```
    - Open factor (ro): we consider "healthy" to have a 20% of open issues in your repo (20% of the total number of issues). Those packages with 20% or less open issues will have ```ro=1```. For those with more than 20%, ```ro=1.2-open_issues/total_number_of_issues```
    - Long open factor (rlo): we consider long open issues those who have been open more that 1 year and are still open today. This factor is calculated as ```rlo=1-long_open_issues/total_number_of_issues```. If a package has no open issues, then ```rlo=1```.

  The repo quality r is calculated as the average of rt, ro and rlo: ```r=(rt+ro+rlo)/3```

The overall quality of a package is ```q=v*d*r```
