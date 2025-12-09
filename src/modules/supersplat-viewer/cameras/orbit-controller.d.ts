import { OrbitController as OrbitControllerPC } from 'playcanvas';
import type { Camera, CameraFrame, CameraController } from '../../src/cameras/camera';
declare class OrbitController implements CameraController {
    controller: OrbitControllerPC;
    constructor();
    onEnter(camera: Camera): void;
    update(deltaTime: number, inputFrame: CameraFrame, camera: Camera): void;
    onExit(camera: Camera): void;
    goto(camera: Camera): void;
}
export { OrbitController };
//# sourceMappingURL=orbit-controller.d.ts.map