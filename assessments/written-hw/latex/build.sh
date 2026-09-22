#!/bin/bash
# Compile every solutions .tex in this folder and copy the finished PDF up
# into assessments/written-hw/, where the rest of the HW PDFs live. Usage:
#   ./build.sh                          # build every *-solutions.tex file
#   ./build.sh written-hw-3-solutions   # build just one (name, no .tex)
set -euo pipefail
cd "$(dirname "$0")"

PDFLATEX="${PDFLATEX:-pdflatex}"
OUTDIR=".."

targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  targets=()
  for f in *.tex; do
    targets+=("${f%.tex}")
  done
fi

for name in "${targets[@]}"; do
  echo "==> building $name.tex"
  "$PDFLATEX" -interaction=nonstopmode -halt-on-error "$name.tex" >/tmp/"$name".log 2>&1 \
    || { echo "FAILED — see /tmp/$name.log"; tail -40 /tmp/"$name".log; exit 1; }
  # run twice so \needspace / page counts settle
  "$PDFLATEX" -interaction=nonstopmode -halt-on-error "$name.tex" >/tmp/"$name".log 2>&1
  cp "$name.pdf" "$OUTDIR/$name.pdf"
  echo "    -> $OUTDIR/$name.pdf"
  rm -f "$name.aux" "$name.log" "$name.pdf"
done
