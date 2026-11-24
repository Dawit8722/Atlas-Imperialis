/**
 * Deterministic pseudo-random number generator (Mulberry32) and
 * coherent fractional Brownian motion (fBm) 2D noise generator.
 */

export class PRNG {
  private state: number;

  constructor(seedString: string) {
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
      hash = (Math.imul(31, hash) + seedString.charCodeAt(i)) | 0;
    }
    this.state = hash ^ 0xdeadbeef;
  }

  // Returns float in [0, 1)
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Returns integer in [min, max] inclusive
  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Pick random element from array
  pick<T>(array: T[]): T {
    return array[this.range(0, array.length - 1)];
  }
}

/**
 * 2D Gradient Noise Generator based on improved Perlin algorithm with permutation tables.
 */
export class Noise2D {
  private p: number[] = new Array(512);

  constructor(prng: PRNG) {
    const permutation: number[] = [];
    for (let i = 0; i < 256; i++) {
      permutation[i] = i;
    }
    // Fisher-Yates shuffle with PRNG
    for (let i = 255; i > 0; i--) {
      const j = prng.range(0, i);
      const temp = permutation[i];
      permutation[i] = permutation[j];
      permutation[j] = temp;
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = permutation[i & 255];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // Evaluates smooth noise at (x, y) normalized to approximately [0, 1]
  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.p[this.p[X] + Y];
    const ab = this.p[this.p[X] + Y + 1];
    const ba = this.p[this.p[X + 1] + Y];
    const bb = this.p[this.p[X + 1] + Y + 1];

    const g1 = this.grad(aa, xf, yf);
    const g2 = this.grad(ba, xf - 1, yf);
    const g3 = this.grad(ab, xf, yf - 1);
    const g4 = this.grad(bb, xf - 1, yf - 1);

    const res = this.lerp(v, this.lerp(u, g1, g2), this.lerp(u, g3, g4));
    return (res + 1) / 2; // Map from [-1, 1] to [0, 1]
  }

  // Multi-octave fractional Brownian motion (fBm)
  fBm(x: number, y: number, octaves = 5, persistence = 0.5, lacunarity = 2.0): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }

  // Domain Warping: Displaces coordinates through multi-octave noise for natural swirling coastlines
  domainWarp(x: number, y: number, strength = 0.45, octaves = 5): number {
    const qx = this.fBm(x + 1.2, y + 3.4, 4);
    const qy = this.fBm(x + 5.7, y + 8.1, 4);
    const rx = this.fBm(x + strength * (qx - 0.5) + 2.3, y + strength * (qy - 0.5) + 4.9, 4);
    const ry = this.fBm(x + strength * (qx - 0.5) + 7.1, y + strength * (qy - 0.5) + 1.8, 4);
    return this.fBm(x + strength * 1.2 * (rx - 0.5), y + strength * 1.2 * (ry - 0.5), octaves);
  }

  // Sharp Ridge Noise: Models tectonic mountain collision crests and spine ridges
  ridgeNoise(x: number, y: number, octaves = 4): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      const n = this.noise(x * frequency, y * frequency);
      const ridge = 1.0 - Math.abs(n * 2.0 - 1.0); // sharp V-shaped peak
      total += ridge * ridge * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return total / maxValue;
  }

  // Cellular / Worley Noise: Returns distance to closest (F1) and second-closest (F2) feature points
  worley(x: number, y: number): { f1: number; f2: number } {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let f1 = 999.0;
    let f2 = 999.0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const h = this.p[(this.p[cx & 255] + cy) & 255];
        const h2 = this.p[(h + 17) & 255];
        const px = cx + (h / 256.0);
        const py = cy + (h2 / 256.0);

        const dist = Math.hypot(x - px, y - py);
        if (dist < f1) {
          f2 = f1;
          f1 = dist;
        } else if (dist < f2) {
          f2 = dist;
        }
      }
    }
    return { f1: Math.min(1, f1), f2: Math.min(1, f2) };
  }

  // Multi-Scale Fractal Turbulence for Serrated Fractal Coastlines
  fractalTurbulence(x: number, y: number, octaves = 5): number {
    let t = 0;
    let f = 1;
    let a = 1;
    let m = 0;
    for (let i = 0; i < octaves; i++) {
      t += Math.abs(this.noise(x * f, y * f) * 2 - 1) * a;
      m += a;
      a *= 0.5;
      f *= 2.15;
    }
    return t / m;
  }
}
