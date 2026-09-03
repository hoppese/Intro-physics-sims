# Intro Physics Sims

A collection of 44 interactive simulations for introductory (algebra/calculus) physics,
spanning mechanics, waves, thermal physics, electromagnetism, and optics. Each sim is a
single self-contained HTML page — React and KaTeX are vendored inline, nothing is fetched
at runtime, and every page works offline. They are designed to be embedded in a Moodle
course via `<iframe>`; adding `?big=1` to the URL (or clicking the sim's title) pops it
out to fill its own browser tab.

Most sims follow the same layout: **Inputs — given** on one side, **Results — you
compute** on the other, a collapsible **Worked example**, and short **What this shows** /
**How to use** notes.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | Entry point — a bundled build of the catalog page below |
| `Web App Catalog.dc.html` | Source for the catalog: a filterable grid of every sim, grouped by course unit, with build-status pills saved to the browser |
| `<sim-name>/index.html` | One bundled, deployable sim per directory (see the list below) |
| `support.js` | Shared `dc-runtime` — a small React-based template runtime (`<x-dc>`, `{{ }}` bindings, `<sc-for>` / `<sc-if>`) used by the `.dc.html` sources |
| `course-map/course-map-fall-26.html` | Day-by-day schedule — reading, pre-class video, sim per class (embedded in Moodle) |
| `assessments/equation-sheets/` | LaTeX + rendered-PDF reference sheets handed to students |
| `assessments/in-class-practice/` | Practice problem sets (PDF) |
| `data/topics.json` | Source of truth for topic → reading / pre-class video / sims |
| `tools/apply-learn-more.py` | Regenerates each sim's "Learn more" panel from `data/topics.json` |
| `tools/build-course-map.py` | Syncs the course map's per-topic video + sim name from `data/topics.json` |
| `bug-worker/` | Cloudflare Worker behind the "Submit bug" menu item — commits reports to `<sim>/bugs/` |
| `screenshots/` | Reference / QA screenshots of the sims |

This repo holds everything students see. The Moodle question banks (with answer
keys), the local-Moodle tooling, and the roadmap live in a **private** repo,
[`intro-physics-ii`](https://github.com/hoppese/intro-physics-ii).

The `<sim>/index.html` files are self-contained bundles (~1.4 MB each): the page unpacks an
embedded, compressed manifest of its own JS, CSS, and fonts on load. There is no build or
serve step needed to run one — open the file, or serve the folder statically.

## The simulations

### Mechanics & motion
| Sim | What it shows |
|---|---|
| [Motion Diagram — x, v, a](motion-diagram/) | Position, velocity, and acceleration graphs, and how each is the slope of the one before. |
| [Drop & Toss — Free Fall](drop-and-toss/) | Free fall under gravity alone: 9.8 m/s of downward speed gained each second, however the object is launched. |
| [Relative Velocity — Boat & River](relative-velocity/) | Velocities add as vectors; a boat's heading combines with the current to set its path over ground. |
| [Center of Mass](center-of-mass/) | The mass-weighted average position, and how heavier objects pull it toward themselves. |

### Gravitation & orbits
| Sim | What it shows |
|---|---|
| [Universal Gravitation](universal-gravitation/) | F = Gm₁m₂/r² between every pair of masses — quadrupling when the distance halves. |
| [Kepler's Laws](keplers-laws/) | Elliptical orbits, equal areas in equal times, and T² ∝ a³. |

### Thermal physics
| Sim | What it shows |
|---|---|
| [Kinetic Theory — Molecular Speeds](kinetic-theory-speeds/) | Temperature as molecular motion; the Maxwell–Boltzmann speed distribution shifts with mass and temperature. |

### Oscillations & waves
| Sim | What it shows |
|---|---|
| [Oscillation Explorer](oscillation-explorer/) | A mass on a spring in SHM: position, velocity, and acceleration as sinusoids, velocity leading position by a quarter cycle. |
| [Energy in SHM — Mass on a Spring](energy-in-shm/) | Total energy E = ½kA² stays fixed while it shifts between kinetic and potential. |
| [Simple Pendulum](pendulum/) | For small swings the period depends only on length and g — not on mass or amplitude. |
| [Wave Explorer](wave-explorer/) | The space picture of a traveling wave y = A sin(kx − ωt): amplitude, wavelength, wave number. |
| [Interference Explorer — Two Traveling Waves](interference-explorer/) | Two waves superposing — crests reinforcing into bright bands, crests meeting troughs canceling. |
| [Standing Waves — Strings & Pipes](standing-waves/) | Reflections interfering into fixed nodes and antinodes. A stretched string (v = √(T/μ), fixed–fixed or fixed–free) or a column of air (open or closed pipe), with harmonics fₙ = n·v/2L (or n·v/4L, n odd). |
| [Two-Source Interference](two-source-interference/) | Two in-phase sources produce fringes: bright where the path difference is a whole wavelength (d·sinθ = mλ), dark at half-wavelengths. |

### Electrostatics
| Sim | What it shows |
|---|---|
| [Electroscope & Charged Rod](electroscope/) | Charging by contact and by induction; like charge spreads onto the leaves and makes them diverge. |
| [Electrostatics Explorer](electrostatics-explorer/) | The force and field of point charges by Coulomb's law F = k|qQ|/r², in 3D. |
| [Field Superposition Explorer](field-superposition-explorer/) | The total field at a point as the vector sum of every charge's field. |
| [E-Fields in Conductors & Insulators](e-fields-conductors-and-insulators/) | E = 0 inside a conductor with all excess charge on its surface; an insulator holds charge throughout its volume. |
| [Moving Charge Field](moving-charge-field/) | The field pattern of a point charge and how it distorts when the charge moves quickly. |
| [Potential Energy vs Separation](pe-vs-separation/) | U = kq₁q₂/r — positive for like charges, negative for unlike — converting to kinetic energy on release. |
| [Equipotential Explorer](equipotential-explorer/) | The potential map V = Σ kqᵢ/rᵢ, and field lines crossing the equipotential contours at right angles (E = −∇V). |
| [Counting Field Lines — Density Is Field Strength](field-line-density-3d/) | 3D field lines from point, line, and plane charges; the line density through a detector surface tracks E and falls off differently for each geometry. |
| [Building a Distribution from Point Charges](discrete-charge-builder-3d/) | A smooth line, ring, or disk assembled from N point charges and summed on the axis in 3D; push N and the size toward the continuous and infinite-plane limits. |
| [Gauss's Law — Flux Through a Closed Surface](gauss-flux/) | Flux through a closed surface depends only on the charge enclosed, not where it sits; 2D cross-section or an orbitable 3D surface. |

### Circuits
| Sim | What it shows |
|---|---|
| [Circuit Builder](circuit-builder/) | How resistors combine and how current and voltage divide in series and parallel networks under Ohm's law. |
| [Circuit Lab](circuit-lab/) | Wire any network of batteries, resistors, capacitors, and inductors; full nodal analysis solves any topology, with capacitors and inductors stepped through time so you see charging, ramping, and oscillation. |
| [RC Charging](rc-charging/) | A capacitor charging and discharging exponentially with time constant τ = RC. |

### Magnetism
| Sim | What it shows |
|---|---|
| [Magnetic Field of Currents](magnetic-field-of-currents/) | B circling a straight wire (B = μ₀I/2πr), and the fields of several wires adding as vectors. |
| [Building a Field from Current Elements](discrete-current-builder-3d/) | A continuous current assembled from Biot–Savart elements (wire, loop, solenoid) in 3D, pushed to the infinite-wire, ideal-loop, and infinite-solenoid limits. |
| [Ampère's Law — Loop Circulation](ampere-loop/) | The field circulating around any closed loop equals μ₀ times the current threading through it. |
| [Dipole in a Field — Torque & Energy](dipole-field-and-torque/) | Torque τ = pE·sinθ aligning a dipole, with energy U = −pE·cosθ lowest when aligned. |
| [Lorentz Force — Charge in E & B](lorentz-force/) | F = qv×B curving a moving charge into circles and helices; velocity selector and cyclotron radius. |
| [Current Loop & DC Motor](current-loop-motor/) | Torque τ = NIAB·sinθ that spins a current loop — the principle behind every electric motor. |

### Electromagnetic induction
| Sim | What it shows |
|---|---|
| [Faraday's Law — Watch the Flux Change](faraday-flux-explorer/) | Flux Φ = B·A·cosθ as a count of the field lines through a loop — largest face-on, zero edge-on. |
| [Faraday's Law — Induced EMF](faraday-induction/) | A changing flux induces an EMF (ℰ = −N·dΦ/dt); Lenz's law makes the induced current oppose the change. Graph and eddy-brake modes. |
| [Sliding Bar on Rails — Motional EMF](rail-flux-bar/) | A bar sliding on rails drives ε = BLv; the induced current feels F = BIL pointing opposite the motion, by Lenz's law. |

### Electromagnetic radiation
| Sim | What it shows |
|---|---|
| [Radiation — A Wiggling Charge Kinks Its Field](radiation-wiggling-charge/) | Acceleration puts a kink in every field line that races outward at c; steady wiggling radiates a continuous transverse electromagnetic wave. |

### Optics
| Sim | What it shows |
|---|---|
| [Refraction, TIR & Dispersion](ray-optics/) | Reflection and refraction at a boundary (Snell's law n₁sinθ₁ = n₂sinθ₂), total internal reflection, and a prism dispersion mode. |
| [Thin-Lens Ray Tracer](lens-ray-tracer/) | Principal rays and 1/f = 1/dₒ + 1/dᵢ forming images through converging and diverging lenses. |
| [Curved-Mirror Ray Tracer](mirror-ray-tracer/) | Principal-ray construction of images in concave and convex mirrors. |
| [Diffraction & Interference Pattern](diffraction-pattern/) | Single-, double-, and many-slit intensity patterns; narrower slits and longer wavelengths spread it wider (a·sinθ = mλ). |
| [Thin-Film Interference & Iridescence](thin-film-interference/) | Front- and back-surface reflections interfering; the optical path difference (OPD = 2n₂t) decides which colors reflect strongly. |
| [Polarization — Malus's Law](polarization-malus/) | Stacked rotatable polarizers with live transmitted intensity I = I₀·cos²θ, zero when crossed. |

## Editing

The runnable sims are generated bundles. `support.js` is likewise generated — its header
points to the `dc-runtime` source (`cd dc-runtime && bun run build`), which lives outside
this repo. Treat the `<sim>/index.html` files and `support.js` as build artifacts.
