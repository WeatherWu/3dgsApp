import { type BoundingBox } from 'playcanvas';
import { Camera, type CameraFrame } from '../src/cameras/camera';
import { Global } from '../src/types';
declare class CameraManager {
    update: (deltaTime: number, cameraFrame: CameraFrame) => void;
    camera: Camera;
    constructor(global: Global, bbox: BoundingBox);
}
export { CameraManager };
//# sourceMappingURL=camera-manager.d.ts.map