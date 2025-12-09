import { Vec3 } from 'playcanvas';
import { AnimTrack } from '../../src/settings';
/**
 * Creates a rotation animation track
 *
 * @param position - Starting location of the camera.
 * @param target - Target point around which to rotate
 * @param fov - The camera field of view.
 * @param keys - The number of keys in the animation.
 * @param duration - The duration of the animation in seconds.
 * @returns - The animation track object containing position and target keyframes.
 */
declare const createRotateTrack: (position: Vec3, target: Vec3, fov: number, keys?: number, duration?: number) => AnimTrack;
export { createRotateTrack };
//# sourceMappingURL=create-rotate-track.d.ts.map