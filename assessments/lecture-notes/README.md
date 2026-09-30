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

## Not every day is a fill-in-the-blank skeleton

`electrostatics-review-notes.tex` (Sep 30) is a practice-problem worksheet, not a
derivation skeleton — a Catch-up/Flex day calls for open-ended problems to work at
stations, not blanks to fill in while a derivation happens on the board. It's built
with `worksheet-common.sty` (the `../in-class-practice/latex-worksheets/` package,
copied into `latex/` here) instead of `notes-common.sty`, but still lives in this
directory since the master schedule links each day's handout from here regardless of
which template built it.

## Notes so far

| Day | File | Topic |
|-----|------|-------|
| Wed Sep 23 | `gauss-applications-notes.pdf` | More Gauss's law — line, sheet, sphere |
| Fri Sep 25 | `electric-pe-notes.pdf` | Electric potential energy (gravity → uniform field → point charges → dipole) |
| Mon Sep 28 | `electric-potential-notes.pdf` | Electric potential — height analogy, capacitor V vs. E, Examples 25.6 & 25.9 |
| Wed Sep 30 | `electrostatics-review-notes.pdf` | Flex-day review practice — dipole torque/PE/motion, even-step equipotentials, path-independent ΔU, superposition with continuous distributions |
