# Skeleton lecture notes

Print-ready handouts for students to fill in while the derivation happens on the
whiteboard. One PDF per class day that warrants one — not every day needs one.

## The density convention: "scaffolded"

The prose, the setup and the framing are **given**. What gets blanked is:

1. key results (the line they should leave with, in their own handwriting),
2. the crucial algebra step,
3. diagram labels.

Students should be writing *physics*, not transcribing sentences. If they are
copying a whole paragraph off the board, the handout is doing too little.

## Diagram convention

Field arrows live in one band, label leaders in another. If a leader crosses an
arrow the student can't tell which thing the blank belongs to — this bit the
first draft of all three figures in `gauss-applications-notes.tex`.

## Building

    cd latex && ./build.sh gauss-applications-notes

Runs `pdflatex` twice and copies the PDF up one level. Shared macros are in
`latex/notes-common.sty` (sibling of `../in-class-practice/latex-worksheets/worksheet-common.sty`).

## Notes so far

| Day | File | Topic |
|-----|------|-------|
| Wed Sep 23 | `gauss-applications-notes.pdf` | More Gauss's law — line, sheet, sphere |
