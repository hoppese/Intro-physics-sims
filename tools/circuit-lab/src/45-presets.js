// =====================================================================
// Presets -- ready-made circuits, written in the same form as a share link
// (see Element.encode). Each is laid out compactly enough to open at 100%.
// The DC and RC circuits use kΩ resistors, so their currents are the mA of a real bench
// rather than amps; `single` (the internal-resistance example) is a battery under a heavy load.
// =====================================================================
const PRESETS = {
  list: [['series', 'Series'], ['parallel', 'Parallel'], ['bridge', 'Bridge'], ['rc', 'RC'], ['rl', 'RL'], ['rlc', 'RLC']],
  nets: {
    blank: 'g20.12-20.14',
    single: 'b12.9-12.13@6 w12.8-12.9 w12.13-12.14 g12.14-12.16 w12.8-17.8 r17.8-21.8@10 w21.8-26.8 w26.8-26.14 w26.14-12.14 w9.8-12.8 w9.8-9.9 v9.9-9.13 w9.13-9.14 w9.14-12.14',
    series: 'b12.9-12.13@6 w12.8-12.9 w12.13-12.14 g12.14-12.16 w12.8-14.8 r14.8-18.8@1200 w18.8-20.8 r20.8-24.8@1800 w24.8-26.8 w26.8-26.14 w26.14-12.14',
    parallel: 'b12.9-12.13@6 w12.8-12.9 w12.13-12.14 g12.14-12.16 w12.8-24.8 w12.14-24.14 w18.8-18.9 r18.9-18.13@1200 w18.13-18.14 w24.8-24.9 r24.9-24.13@3000 w24.13-24.14',
    // R1, R2 on top, R4, R5 below, R3 bridging the two midpoints. Deliberately unbalanced
    // (1 kΩ / 2 kΩ against 3 kΩ / 1.5 kΩ), so the 2.5 kΩ bridge resistor carries a current: 0.48 mA
    bridge: 'b12.10-12.14@6 w12.8-12.10 w12.14-12.16 g12.16-12.18 w12.8-26.8 w12.16-26.16 r16.8-16.12@1000 r26.8-26.12@3000 r19.12-23.12@2500 r16.12-16.16@2000 r26.12-26.16@1500 w16.12-19.12 w23.12-26.12',
    // position 1 charges the capacitor through R, position 2 discharges it; 4.7 kΩ x 470 µF: tau = RC = 2.2 s
    rc: 'b10.11-10.15@6 w10.9-10.11 w10.9-12.9 w10.15-10.16 g10.16-10.18 x15.10-12.9-12.11@0 r15.10-19.10@4700 a19.10-23.10 w23.10-24.10 w24.10-24.11 c24.11-24.15@0.47 w24.15-24.16 w10.16-27.16 w12.11-12.16 w24.10-27.10 w27.10-27.11 v27.11-27.15 w27.15-27.16',
    // RL and RLC keep resistors of a few ohms: with L in henries nothing else gives a time constant
    // slow enough to watch. tau = L/R = 1.5 s
    rl: 'b10.11-10.15@6 w10.10-10.11 s10.10-14.10@0 w14.10-15.10 r15.10-19.10@10 a19.10-23.10 w23.10-24.10 w24.10-24.11 l24.11-24.15@15 w24.15-24.16 w10.15-10.16 g10.16-10.18 w10.16-27.16 w24.10-27.10 w27.10-27.11 v27.11-27.15 w27.15-27.16',
    rlc: 'b10.11-10.15@6 w10.10-10.11 w10.10-11.10 s11.10-15.10@0 w15.10-16.10 a16.10-20.10 w20.10-21.10 r21.10-25.10@3 w25.10-26.10 w26.10-26.11 l26.11-26.15@1 w26.15-26.16 w26.16-20.16 c20.16-16.16@10 w16.16-10.16 w10.15-10.16 g10.16-10.18 w20.16-20.18 v20.18-16.18 w16.16-16.18',
  },
  has(name) { return Object.prototype.hasOwnProperty.call(PRESETS.nets, name); },
  build(name, nc, nr) { return Circuit.decode(PRESETS.nets[name].replace(/ /g, '_'), nc, nr); },
};
