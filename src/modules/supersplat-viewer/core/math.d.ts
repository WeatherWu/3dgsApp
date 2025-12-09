import type { Vec3 } from 'playcanvas';
/**
 * Damping function to smooth out transitions.
 *
 * @param damping - Damping factor (0 < damping < 1).
 * @param dt - Delta time in seconds.
 * @returns - Damping factor adjusted for the delta time.
 */
declare const damp: (damping: number, dt: number) => number;
/**
 * Easing function for smooth transitions.
 *
 * @param x - Input value in the range [0, 1].
 * @returns - Output value in the range [0, 1].
 */
declare const easeOut: (x: number) => number;
/**
 * Modulus function that handles negative values correctly.
 *
 * @param n - The number to be modulated.
 * @param m - The modulus value.
 * @returns - The result of n mod m, adjusted to be non-negative.
 */
declare const mod: (n: number, m: number) => number;
declare const nearlyEquals: (a: Float32Array<ArrayBufferLike>, b: Float32Array<ArrayBufferLike>, epsilon?: number) => boolean;
declare const vecToAngles: (result: Vec3, vec: Vec3) => Vec3;
export { damp, easeOut, mod, nearlyEquals, vecToAngles };
//# sourceMappingURL=math.d.ts.map