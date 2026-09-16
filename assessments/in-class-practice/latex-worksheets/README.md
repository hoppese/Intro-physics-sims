# LaTeX practice worksheets

Source for the print-ready practice PDFs in `assessments/in-class-practice/`.
Built with plain `pdflatex` (TeX Live) — no external tools needed beyond a
LaTeX install.

## Build

```
./build.sh                          # builds every *.tex file here
./build.sh coulomb-force-practice   # builds just one
```

Each build copies `<name>.pdf` up into `assessments/in-class-practice/`,
next to the other practice sheets.

## Starting a new worksheet

Copy `coulomb-force-practice.tex` as a starting point, or write a new file
that begins:

```latex
\documentclass[11pt]{article}
\usepackage{worksheet-common}
\begin{document}
\worksheettitle{Some Worksheet Name}
...
\end{document}
```

`worksheet-common.sty` (in this folder) provides everything:

- `\worksheettitle{...}` — the big title at the top, nothing else.
- `\partsec{A}{Section Title}` — a "Part A — Section Title" header.
- `\prob ...` — a new auto-numbered problem (`1.`, `2.`, ...). Page-break
  safe: won't split a problem's opening line across pages.
- `\worksp{sm|md|lg|xl}` — blank work space after a problem, no ruled
  lines, no box. `sm`=6cm, `md`=8cm, `lg`=10cm, `xl`=12cm. Pass an
  explicit length instead (e.g. `\worksp{4in}`) if none of those fit.
  Size it to how much work the problem actually takes, not out of habit.
- `\rv{1}{2}` — renders $\vec{r}_{12}$, the separation-vector notation
  used across these worksheets. `\Fv{1}{2}` is the same for forces.
- `\probref{5}` — "Problem 5", for "same setup as ..." follow-ups.
- `\poscharge{x}{y}{radius}` / `\negcharge{x}{y}{radius}` — a filled,
  labeled point-charge circle for TikZ diagrams (red `+` / blue `-`).
  Always use these (or the general `\chargenode`) instead of chaining a
  `node` after a bare `\filldraw ... circle (...)` — TikZ's "current
  point" after a circle path is its 3 o'clock edge, not its center, so
  a chained node ends up off-center or invisible. `\chargenode{x}{y}{+
  or -}{colorname}{radius}` is the general form if you need a color
  other than red/blue.
- `answerkey` environment — put the answer key inside this; it starts a
  fresh page and rotates 180° so it has to be flipped to read. Use
  `\akpart{Part A — ...}` for a part header and `\akitem{5}{answer
  text}` per problem; wrap in `multicols{2}` if there are more than
  ~8 items.

## Conventions carried over from the first worksheet

- Mix distance units across problems (cm, mm, m, scientific notation)
  and charge units (µC, nC) — don't let every problem use the same
  units.
- Give some problems a diagram, skip it on others, so students learn to
  work from coordinates alone too.
- Build difficulty within each Part: cleaner numbers/axis-aligned first,
  diagonal or scientific-notation hardest last.
- When a later Part reuses an earlier setup ("Same as Problem 5..."),
  restate the charge values and positions in the problem text rather
  than just citing the number — keeps each page self-contained for
  someone flipping through a printed packet.
- Verify every answer-key number with an actual script (Python, e.g.)
  before typing it into `\akitem` — don't hand-compute the key.
