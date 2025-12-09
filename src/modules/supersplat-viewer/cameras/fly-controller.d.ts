import { FlyController as FlyControllerPC, Pose } from 'playcanvas';
import type { CameraFrame, Camera, CameraController } from '../../src/cameras/camera';
declare class FlyController implements CameraController {
    controller: FlyControllerPC;
    constructor();
    onEnter(camera: Camera): void;
    update(deltaTime: number, inputFrame: CameraFrame, camera: Camera): void;
    onExit(camera: Camera): void;
    goto(pose: Pose): void;
}
export { FlyController };
//# sourceMappingURL=fly-controller.d.ts.map