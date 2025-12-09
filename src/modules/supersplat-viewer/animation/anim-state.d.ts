import { Vec3 } from 'playcanvas';
import { CubicSpline } from '../../src/core/spline';
import { AnimTrack } from '../../src/settings';
import { AnimCursor } from '../../src/animation/anim-cursor';
declare class AnimState {
    spline: CubicSpline;
    cursor: AnimCursor;
    frameRate: number;
    result: number[];
    position: Vec3;
    target: Vec3;
    constructor(spline: CubicSpline, duration: number, loopMode: 'none' | 'repeat' | 'pingpong', frameRate: number);
    update(dt: number): void;
    static fromTrack(track: AnimTrack): AnimState;
}
export { AnimState };
//# sourceMappingURL=anim-state.d.ts.map