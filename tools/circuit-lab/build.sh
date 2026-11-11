#!/bin/sh
# Circuit Lab: run the node tests, then put src/*.js back into circuit-lab/index.html.
#   sh tools/circuit-lab/build.sh          test + build
#   sh tools/circuit-lab/build.sh test     tests only
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"

for t in circuit solver presets bench fixes; do
  node "$here/test/t-$t.js" | tail -1
done
[ "$1" = "test" ] && exit 0

out="$(mktemp -t circuit-lab-build).js"
cat "$here"/src/*.js > "$out"
python3 "$root/tools/sim-script.py" apply circuit-lab "$out"
rm -f "$out"
echo "Now open circuit-lab/?v=<new number> in a browser: the checks above do not see pixels."
