#!/bin/sh
# Circuit Lab: run the node tests, then put src/*.js back into circuit-lab/index.html
# and rebuild the variants (circuit-lab-<name>/index.html, one for each variants/<name>.js).
#   sh tools/circuit-lab/build.sh          test + build
#   sh tools/circuit-lab/build.sh test     tests only
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"

# (a suite that fails -- or cannot even load -- stops the build: nothing is written)
for t in circuit solver presets bench fixes; do
  if log="$(node "$here/test/t-$t.js" 2>&1)"; then echo "$log" | tail -1
  else echo "$log" | tail -25; echo "t-$t failed: bundle NOT rebuilt"; exit 1; fi
done
[ "$1" = "test" ] && exit 0

out="$(mktemp -t circuit-lab-build).js"
cat "$here"/src/*.js > "$out"
python3 "$root/tools/sim-script.py" apply circuit-lab "$out"

# The variants: the same page and the same sources, with variants/<name>.js read in just before the
# page's controller. Each is written to circuit-lab-<name>/ (a copy of the main bundle, script swapped).
for v in "$here"/variants/*.js; do
  [ -e "$v" ] || continue
  name="$(basename "$v" .js)"
  mkdir -p "$root/circuit-lab-$name"
  cp "$root/circuit-lab/index.html" "$root/circuit-lab-$name/index.html"
  cat "$here"/src/[0-7]*.js "$v" "$here"/src/[89]*.js > "$out"
  python3 "$root/tools/sim-script.py" apply "circuit-lab-$name" "$out"
done
rm -f "$out"
echo "Now open circuit-lab/?v=<new number> in a browser: the checks above do not see pixels."
