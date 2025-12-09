import { InputFrame } from 'playcanvas';
import type { Global } from '../src/types';
declare class InputController {
    private _state;
    private _desktopInput;
    private _orbitInput;
    private _flyInput;
    private _gamepadInput;
    global: Global;
    frame: InputFrame<{
        move: number[];
        rotate: number[];
    }>;
    joystick: {
        base: [number, number] | null;
        stick: [number, number] | null;
    };
    moveSpeed: number;
    orbitSpeed: number;
    pinchSpeed: number;
    wheelSpeed: number;
    constructor(global: Global);
    /**
     * @param dt - delta time in seconds
     * @param state - the current state of the app
     * @param state.cameraMode - the current camera mode
     * @param distance - the distance to the camera target
     */
    update(dt: number, distance: number): void;
}
export { InputController };
//# sourceMappingURL=input-controller.d.ts.map