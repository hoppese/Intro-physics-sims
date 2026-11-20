#!/bin/sh
# Energy Track: run the checks, then rebuild energy-track/index.html from this folder.
#   tools/energy-track/build.sh          test, then write the markup and the component into the bundle
#   tools/energy-track/build.sh test     test only
# A failing check stops the build: the bundle is left as it was.
set -e
here="$(cd "$(dirname "$0")" && pwd)"; root="$(cd "$here/../.." && pwd)"
for t in physics scene; do
  if log="$(node "$here/test/t-$t.js" 2>&1)"; then echo "$log" | tail -1
  else echo "$log" | tail -25; echo "t-$t failed: bundle NOT rebuilt"; exit 1; fi
done
[ "$1" = "test" ] && exit 0
python3 "$here/markup.py"
out="$(mktemp -t energy-track-build).js"
cat "$here"/src/*.js > "$out"
python3 "$root/tools/sim-script.py" apply energy-track "$out"
rm -f "$out"
echo "Now open energy-track/?v=<new number> in a browser: the checks above do not see pixels."
