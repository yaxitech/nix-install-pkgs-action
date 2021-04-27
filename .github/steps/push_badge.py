"""
Pushes the coverage badge to the gh-pages branch.
"""

import json
import os
import tempfile
from bisect import bisect

from ghp_import import ghp_import  # type: ignore


GIT_USER_NAME = "github-actions"
GIT_EMAIL = "actions@yaxi.tech"

BADGE = """
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="96" height="20" role="img"
     aria-label="coverage: {coverage}">
  <title>coverage: {coverage}
  </title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="96" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="61" height="20" fill="#555"/>
    <rect x="61" width="35" height="20" fill="{color}"/>
    <rect width="96" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="315" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="510">coverage
    </text>
    <text x="315" y="140" transform="scale(.1)" fill="#fff" textLength="510">coverage
    </text>
    <text aria-hidden="true" x="775" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="250">{coverage}
    </text>
    <text x="775" y="140" transform="scale(.1)" fill="#fff" textLength="250">{coverage}
    </text>
  </g>
</svg>
"""


COLORS = {
    0: "red",
    50: "#dfb317",
    90: "green",
}


def main():
    with open(os.path.join("coverage", "coverage-summary.json")) as coverage_file:
        coverage_data = json.load(coverage_file)
        total_coverage = coverage_data["total"]["lines"]["pct"]

    with tempfile.TemporaryDirectory() as tmp_dir:
        with open(os.path.join(tmp_dir, "coverage.svg"), "w") as badge_file:
            color = list(COLORS.values())[
                bisect(list(COLORS.keys()), total_coverage) - 1
            ]
            badge_file.write(
                BADGE.format(coverage=f"{int(total_coverage)}%", color=color)
            )

        ghp_import(tmp_dir, push=True)


main()
