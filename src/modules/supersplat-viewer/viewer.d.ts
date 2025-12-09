import { CameraFrame, type Entity } from 'playcanvas';
import { Annotations } from '../src/annotations';
import { CameraManager } from '../src/camera-manager';
import { InputController } from '../src/input-controller';
import type { ExperienceSettings } from '../src/settings';
import type { Global } from '../src/types';
declare class Viewer {
    global: Global;
    cameraFrame: CameraFrame;
    inputController: InputController;
    cameraManager: CameraManager;
    annotations: Annotations;
    forceRenderNextFrame: boolean;
    constructor(global: Global, gsplatLoad: Promise<Entity>, skyboxLoad: Promise<void>);
    configureCamera(settings: ExperienceSettings): void;
}
export { Viewer };
//# sourceMappingURL=viewer.d.ts.map