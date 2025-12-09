import type { Camera, CameraFrame } from '../../src/cameras/camera';
import { CameraController } from '../../src/cameras/camera';
import { AnimState } from '../../src/animation/anim-state';
import { AnimTrack } from '../../src/settings';
declare class AnimController implements CameraController {
    animState: AnimState;
    constructor(animTrack: AnimTrack);
    onEnter(camera: Camera): void;
    update(deltaTime: number, inputFrame: CameraFrame, camera: Camera): void;
    onExit(camera: Camera): void;
}
export { AnimController };
//# sourceMappingURL=anim-controller.d.ts.map