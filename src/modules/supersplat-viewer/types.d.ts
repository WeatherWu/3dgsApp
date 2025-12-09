import type { Entity, EventHandler, AppBase } from 'playcanvas';
import type { ExperienceSettings } from '../src/settings';
type CameraMode = 'orbit' | 'anim' | 'fly';
type InputMode = 'desktop' | 'touch';
type Config = {
    poster?: HTMLImageElement;
    skyboxUrl?: string;
    contentUrl?: string;
    contents?: Promise<Response>;
    noui: boolean;
    noanim: boolean;
    ministats: boolean;
    unified: boolean;
    aa: boolean;
};
type State = {
    readyToRender: boolean;
    hqMode: boolean;
    progress: number;
    inputMode: InputMode;
    cameraMode: CameraMode;
    hasAnimation: boolean;
    animationDuration: number;
    animationTime: number;
    animationPaused: boolean;
    hasAR: boolean;
    hasVR: boolean;
    isFullscreen: boolean;
    controlsHidden: boolean;
};
type Global = {
    app: AppBase;
    settings: ExperienceSettings;
    config: Config;
    state: State;
    events: EventHandler;
    camera: Entity;
};
export { CameraMode, InputMode, Config, State, Global };
//# sourceMappingURL=types.d.ts.map