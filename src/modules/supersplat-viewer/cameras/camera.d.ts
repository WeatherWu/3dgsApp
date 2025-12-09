import { Vec3 } from 'playcanvas';
import type { InputFrame } from 'playcanvas';
type CameraFrame = InputFrame<{
    move: [number, number, number];
    rotate: [number, number, number];
}>;
declare class Camera {
    position: Vec3;
    angles: Vec3;
    distance: number;
    fov: number;
    constructor(other?: Camera);
    copy(source: Camera): void;
    lerp(a: Camera, b: Camera, t: number): void;
    look(from: Vec3, to: Vec3): void;
    calcFocusPoint(result: Vec3): void;
}
interface CameraController {
    onEnter(camera: Camera): void;
    update(deltaTime: number, inputFrame: CameraFrame, camera: Camera): void;
    onExit(camera: Camera): void;
}
export type { CameraFrame, CameraController };
export { Camera };
//# sourceMappingURL=camera.d.ts.map