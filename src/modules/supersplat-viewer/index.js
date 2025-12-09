import '@playcanvas/web-components';
import { Vec3, Script, Color, Mesh, PlaneGeometry, Texture, FILTER_LINEAR, PIXELFORMAT_RGBA8, StandardMaterial, BlendState, BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA, BLENDMODE_ONE, CULLFACE_NONE, Entity, MeshInstance, Layer, Mat4, Quat, math, Pose, FlyController as FlyController$1, Vec2, OrbitController as OrbitController$1, Vec4, Picker as Picker$1, KeyboardMouseSource, MultiTouchSource, DualGestureSource, GamepadSource, InputFrame, PROJECTION_PERSPECTIVE, ShaderChunks, MiniStats, BoundingBox, CameraFrame, TONEMAP_NEUTRAL, TONEMAP_ACES2, TONEMAP_ACES, TONEMAP_HEJL, TONEMAP_FILMIC, TONEMAP_LINEAR, TONEMAP_NONE, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F, RenderTarget, platform, version as version$1, revision, EventHandler, Asset } from 'playcanvas';

// creates an observer proxy object to wrap some target object. fires events when properties change.
const observe = (events, target) => {
    const members = new Set(Object.keys(target));
    return new Proxy(target, {
        set(target, property, value, receiver) {
            // prevent setting symbol properties
            if (typeof property === 'symbol') {
                console.error('Cannot set symbol property on target');
                return false;
            }
            // not allowed to set a new value on target
            if (!members.has(property)) {
                console.error('Cannot set new property on target');
                return false;
            }
            // set and fire event if value changed
            if (target[property] !== value) {
                const prev = target[property];
                target[property] = value;
                events.fire(`${property}:changed`, value, prev);
            }
            return true;
        }
    });
};

const migrateV1 = (settings) => {
    if (settings.animTracks) {
        settings.animTracks?.forEach((track) => {
            // some early settings did not have frameRate set on anim tracks
            if (!track.frameRate) {
                const defaultFrameRate = 30;
                track.frameRate = defaultFrameRate;
                const times = track.keyframes.times;
                for (let i = 0; i < times.length; i++) {
                    times[i] *= defaultFrameRate;
                }
            }
            // smoothness property added in v1.4.0
            if (!track.hasOwnProperty('smoothness')) {
                track.smoothness = 0;
            }
        });
    }
    else {
        // some scenes were published without animTracks
        settings.animTracks = [];
    }
    return settings;
};
const migrateAnimTrackV2 = (animTrackV1, fov) => {
    return {
        name: animTrackV1.name,
        duration: animTrackV1.duration,
        frameRate: animTrackV1.frameRate,
        loopMode: animTrackV1.loopMode,
        interpolation: animTrackV1.interpolation,
        smoothness: animTrackV1.smoothness,
        keyframes: {
            times: animTrackV1.keyframes.times,
            values: {
                position: animTrackV1.keyframes.values.position,
                target: animTrackV1.keyframes.values.target,
                fov: new Array(animTrackV1.keyframes.times.length).fill(fov)
            }
        }
    };
};
const migrateV2 = (v1) => {
    return {
        version: 2,
        tonemapping: 'none',
        highPrecisionRendering: false,
        background: {
            color: v1.background.color || [0, 0, 0]
        },
        postEffectSettings: {
            sharpness: {
                enabled: false,
                amount: 0
            },
            bloom: {
                enabled: false,
                intensity: 1,
                blurLevel: 2
            },
            grading: {
                enabled: false,
                brightness: 0,
                contrast: 1,
                saturation: 1,
                tint: [1, 1, 1]
            },
            vignette: {
                enabled: false,
                intensity: 0.5,
                inner: 0.3,
                outer: 0.75,
                curvature: 1
            },
            fringing: {
                enabled: false,
                intensity: 0.5
            }
        },
        animTracks: v1.animTracks.map((animTrackV1) => {
            return migrateAnimTrackV2(animTrackV1, v1.camera.fov || 60);
        }),
        cameras: [{
                initial: {
                    position: (v1.camera.position || [0, 0, 5]),
                    target: (v1.camera.target || [0, 0, 0]),
                    fov: v1.camera.fov || 65
                }
            }],
        annotations: [],
        startMode: v1.camera.startAnim === 'animTrack' ? 'animTrack' : 'default',
        hasStartPose: !!(v1.camera.position && v1.camera.target)
    };
};
// import a json object to conform to the latest settings schema. settings is assumed to be one of the well-formed schemas
const importSettings = (settings) => {
    let result;
    const version = settings.version;
    if (version === undefined) {
        // v1 -> v2
        result = migrateV2(migrateV1(settings));
    }
    else if (version === 2) {
        // already v2
        result = settings;
    }
    else {
        throw new Error(`Unsupported experience settings version: ${version}`);
    }
    return result;
};

class Tooltip {
    register;
    unregister;
    destroy;
    constructor(dom) {
        const { style } = dom;
        style.display = 'none';
        const targets = new Map();
        let timer = 0;
        this.register = (target, textString, direction = 'bottom') => {
            const activate = () => {
                const rect = target.getBoundingClientRect();
                const midx = Math.floor((rect.left + rect.right) * 0.5);
                const midy = Math.floor((rect.top + rect.bottom) * 0.5);
                switch (direction) {
                    case 'left':
                        style.left = `${rect.left}px`;
                        style.top = `${midy}px`;
                        style.transform = 'translate(calc(-100% - 10px), -50%)';
                        break;
                    case 'right':
                        style.left = `${rect.right}px`;
                        style.top = `${midy}px`;
                        style.transform = 'translate(10px, -50%)';
                        break;
                    case 'top':
                        style.left = `${midx}px`;
                        style.top = `${rect.top}px`;
                        style.transform = 'translate(-50%, calc(-100% - 10px))';
                        break;
                    case 'bottom':
                        style.left = `${midx}px`;
                        style.top = `${rect.bottom}px`;
                        style.transform = 'translate(-50%, 10px)';
                        break;
                }
                dom.textContent = textString;
                style.display = 'inline';
            };
            const startTimer = (fn) => {
                timer = window.setTimeout(() => {
                    fn();
                    timer = -1;
                }, 250);
            };
            const cancelTimer = () => {
                if (timer >= 0) {
                    clearTimeout(timer);
                    timer = -1;
                }
            };
            const enter = () => {
                cancelTimer();
                if (style.display === 'inline') {
                    activate();
                }
                else {
                    startTimer(() => activate());
                }
            };
            const leave = () => {
                cancelTimer();
                if (style.display === 'inline') {
                    startTimer(() => {
                        style.display = 'none';
                    });
                }
            };
            target.addEventListener('pointerenter', enter);
            target.addEventListener('pointerleave', leave);
            targets.set(target, { enter, leave });
        };
        this.unregister = (target) => {
            const value = targets.get(target);
            if (value) {
                target.removeEventListener('pointerenter', value.enter);
                target.removeEventListener('pointerleave', value.leave);
                targets.delete(target);
            }
        };
        this.destroy = () => {
            for (const target of targets.keys()) {
                this.unregister(target);
            }
        };
    }
}

const v = new Vec3();
// update the poster image to start blurry and then resolve to sharp during loading
const initPoster = (events) => {
    const poster = document.getElementById('poster');
    events.on('firstFrame', () => {
        poster.style.display = 'none';
        document.documentElement.style.setProperty('--canvas-opacity', '1');
    });
    const blur = (progress) => {
        poster.style.filter = `blur(${Math.floor((100 - progress) * 0.4)}px)`;
    };
    events.on('progress:changed', blur);
};
const initUI = (global) => {
    const { config, events, state } = global;
    // Acquire Elements
    const docRoot = document.documentElement;
    const dom = [
        'ui',
        'controlsWrap',
        'arMode', 'vrMode',
        'enterFullscreen', 'exitFullscreen',
        'info', 'infoPanel', 'desktopTab', 'touchTab', 'desktopInfoPanel', 'touchInfoPanel',
        'timelineContainer', 'handle', 'time',
        'buttonContainer',
        'play', 'pause',
        'settings', 'settingsPanel',
        'orbitCamera', 'flyCamera',
        'hqCheck', 'hqOption', 'lqCheck', 'lqOption',
        'reset', 'frame',
        'loadingText', 'loadingBar',
        'joystickBase', 'joystick',
        'tooltip'
    ].reduce((acc, id) => {
        acc[id] = document.getElementById(id);
        return acc;
    }, {});
    // Handle loading progress updates
    events.on('progress:changed', (progress) => {
        dom.loadingText.textContent = `${progress}%`;
        if (progress < 100) {
            dom.loadingBar.style.backgroundImage = `linear-gradient(90deg, #F60 0%, #F60 ${progress}%, white ${progress}%, white 100%)`;
        }
        else {
            dom.loadingBar.style.backgroundImage = 'linear-gradient(90deg, #F60 0%, #F60 100%)';
        }
    });
    // Hide loading bar once first frame is rendered
    events.on('firstFrame', () => {
        document.getElementById('loadingWrap').classList.add('hidden');
    });
    // Fullscreen support
    const hasFullscreenAPI = docRoot.requestFullscreen && document.exitFullscreen;
    const requestFullscreen = () => {
        if (hasFullscreenAPI) {
            docRoot.requestFullscreen();
        }
        else {
            window.parent.postMessage('requestFullscreen', '*');
            state.isFullscreen = true;
        }
    };
    const exitFullscreen = () => {
        if (hasFullscreenAPI) {
            document.exitFullscreen();
        }
        else {
            window.parent.postMessage('exitFullscreen', '*');
            state.isFullscreen = false;
        }
    };
    if (hasFullscreenAPI) {
        document.addEventListener('fullscreenchange', () => {
            state.isFullscreen = !!document.fullscreenElement;
        });
    }
    dom.enterFullscreen.addEventListener('click', requestFullscreen);
    dom.exitFullscreen.addEventListener('click', exitFullscreen);
    // toggle fullscreen when user switches between landscape portrait
    // orientation
    screen?.orientation?.addEventListener('change', (event) => {
        if (['landscape-primary', 'landscape-secondary'].includes(screen.orientation.type)) {
            requestFullscreen();
        }
        else {
            exitFullscreen();
        }
    });
    // update UI when fullscreen state changes
    events.on('isFullscreen:changed', (value) => {
        dom.enterFullscreen.classList[value ? 'add' : 'remove']('hidden');
        dom.exitFullscreen.classList[value ? 'remove' : 'add']('hidden');
    });
    // HQ mode
    dom.hqOption.addEventListener('click', () => {
        state.hqMode = true;
    });
    dom.lqOption.addEventListener('click', () => {
        state.hqMode = false;
    });
    const updateHQ = () => {
        dom.hqCheck.classList[state.hqMode ? 'add' : 'remove']('active');
        dom.lqCheck.classList[state.hqMode ? 'remove' : 'add']('active');
    };
    events.on('hqMode:changed', (value) => {
        updateHQ();
    });
    updateHQ();
    // AR/VR
    const arChanged = () => dom.arMode.classList[state.hasAR ? 'remove' : 'add']('hidden');
    const vrChanged = () => dom.vrMode.classList[state.hasVR ? 'remove' : 'add']('hidden');
    dom.arMode.addEventListener('click', () => events.fire('startAR'));
    dom.vrMode.addEventListener('click', () => events.fire('startVR'));
    events.on('hasAR:changed', arChanged);
    events.on('hasVR:changed', vrChanged);
    arChanged();
    vrChanged();
    // Info panel
    const updateInfoTab = (tab) => {
        if (tab === 'desktop') {
            dom.desktopTab.classList.add('active');
            dom.touchTab.classList.remove('active');
            dom.desktopInfoPanel.classList.remove('hidden');
            dom.touchInfoPanel.classList.add('hidden');
        }
        else {
            dom.desktopTab.classList.remove('active');
            dom.touchTab.classList.add('active');
            dom.desktopInfoPanel.classList.add('hidden');
            dom.touchInfoPanel.classList.remove('hidden');
        }
    };
    dom.desktopTab.addEventListener('click', () => {
        updateInfoTab('desktop');
    });
    dom.touchTab.addEventListener('click', () => {
        updateInfoTab('touch');
    });
    dom.info.addEventListener('click', () => {
        updateInfoTab(state.inputMode);
        dom.infoPanel.classList.toggle('hidden');
    });
    dom.infoPanel.addEventListener('pointerdown', () => {
        dom.infoPanel.classList.add('hidden');
    });
    events.on('inputEvent', (event) => {
        if (event === 'cancel') {
            // close info panel on cancel
            dom.infoPanel.classList.add('hidden');
            dom.settingsPanel.classList.add('hidden');
            // close fullscreen on cancel
            if (state.isFullscreen) {
                exitFullscreen();
            }
        }
        else if (event === 'interrupt') {
            dom.settingsPanel.classList.add('hidden');
        }
    });
    // fade ui controls after 5 seconds of inactivity
    events.on('controlsHidden:changed', (value) => {
        dom.controlsWrap.className = value ? 'faded-out' : 'faded-in';
    });
    // show the ui and start a timer to hide it again
    let uiTimeout = null;
    const showUI = () => {
        if (uiTimeout) {
            clearTimeout(uiTimeout);
        }
        state.controlsHidden = false;
        uiTimeout = setTimeout(() => {
            uiTimeout = null;
            state.controlsHidden = true;
        }, 4000);
    };
    showUI();
    events.on('inputEvent', showUI);
    // Animation controls
    events.on('hasAnimation:changed', (value, prev) => {
        // Start and Stop animation
        dom.play.addEventListener('click', () => {
            state.cameraMode = 'anim';
            state.animationPaused = false;
        });
        dom.pause.addEventListener('click', () => {
            state.cameraMode = 'anim';
            state.animationPaused = true;
        });
        const updatePlayPause = () => {
            if (state.cameraMode !== 'anim' || state.animationPaused) {
                dom.play.classList.remove('hidden');
                dom.pause.classList.add('hidden');
            }
            else {
                dom.play.classList.add('hidden');
                dom.pause.classList.remove('hidden');
            }
            if (state.cameraMode === 'anim') {
                dom.timelineContainer.classList.remove('hidden');
            }
            else {
                dom.timelineContainer.classList.add('hidden');
            }
        };
        // Update UI on animation changes
        events.on('cameraMode:changed', updatePlayPause);
        events.on('animationPaused:changed', updatePlayPause);
        const updateSlider = () => {
            dom.handle.style.left = `${state.animationTime / state.animationDuration * 100}%`;
            dom.time.style.left = `${state.animationTime / state.animationDuration * 100}%`;
            dom.time.innerText = `${state.animationTime.toFixed(1)}s`;
        };
        events.on('animationTime:changed', updateSlider);
        events.on('animationLength:changed', updateSlider);
        const handleScrub = (event) => {
            const rect = dom.timelineContainer.getBoundingClientRect();
            const t = Math.max(0, Math.min(rect.width - 1, event.clientX - rect.left)) / rect.width;
            events.fire('scrubAnim', state.animationDuration * t);
            showUI();
        };
        let paused = false;
        let captured = false;
        dom.timelineContainer.addEventListener('pointerdown', (event) => {
            if (!captured) {
                handleScrub(event);
                dom.timelineContainer.setPointerCapture(event.pointerId);
                dom.time.classList.remove('hidden');
                paused = state.animationPaused;
                state.animationPaused = true;
                captured = true;
            }
        });
        dom.timelineContainer.addEventListener('pointermove', (event) => {
            if (captured) {
                handleScrub(event);
            }
        });
        dom.timelineContainer.addEventListener('pointerup', (event) => {
            if (captured) {
                dom.timelineContainer.releasePointerCapture(event.pointerId);
                dom.time.classList.add('hidden');
                state.animationPaused = paused;
                captured = false;
            }
        });
    });
    // Camera mode UI
    events.on('cameraMode:changed', () => {
        dom.orbitCamera.classList[state.cameraMode === 'orbit' ? 'add' : 'remove']('active');
        dom.flyCamera.classList[state.cameraMode === 'fly' ? 'add' : 'remove']('active');
    });
    dom.settings.addEventListener('click', () => {
        dom.settingsPanel.classList.toggle('hidden');
    });
    dom.orbitCamera.addEventListener('click', () => {
        state.cameraMode = 'orbit';
    });
    dom.flyCamera.addEventListener('click', () => {
        state.cameraMode = 'fly';
    });
    dom.reset.addEventListener('click', (event) => {
        events.fire('inputEvent', 'reset', event);
    });
    dom.frame.addEventListener('click', (event) => {
        events.fire('inputEvent', 'frame', event);
    });
    // update UI based on touch joystick updates
    events.on('touchJoystickUpdate', (base, stick) => {
        if (base === null) {
            dom.joystickBase.classList.add('hidden');
        }
        else {
            v.set(stick[0], stick[1], 0).mulScalar(1 / 48);
            if (v.length() > 1) {
                v.normalize();
            }
            v.mulScalar(48);
            dom.joystickBase.classList.remove('hidden');
            dom.joystickBase.style.left = `${base[0]}px`;
            dom.joystickBase.style.top = `${base[1]}px`;
            dom.joystick.style.left = `${48 + v.x}px`;
            dom.joystick.style.top = `${48 + v.y}px`;
        }
    });
    // Hide all UI (poster, loading bar, controls)
    if (config.noui) {
        dom.ui.classList.add('hidden');
    }
    // tooltips
    const tooltip = new Tooltip(dom.tooltip);
    tooltip.register(dom.play, 'Play', 'top');
    tooltip.register(dom.pause, 'Pause', 'top');
    tooltip.register(dom.orbitCamera, 'Orbit Camera', 'top');
    tooltip.register(dom.flyCamera, 'Fly Camera', 'top');
    tooltip.register(dom.reset, 'Reset Camera', 'bottom');
    tooltip.register(dom.frame, 'Frame Scene', 'bottom');
    tooltip.register(dom.settings, 'Settings', 'top');
    tooltip.register(dom.info, 'Help', 'top');
    tooltip.register(dom.arMode, 'Enter AR', 'top');
    tooltip.register(dom.vrMode, 'Enter VR', 'top');
    tooltip.register(dom.enterFullscreen, 'Fullscreen', 'top');
    tooltip.register(dom.exitFullscreen, 'Fullscreen', 'top');
};

// clamp the vertices of the hotspot so it is never clipped by the near or far plane
const depthClamp = `
    float f = gl_Position.z / gl_Position.w;
    if (f > 1.0) {
        gl_Position.z = gl_Position.w;
    } else if (f < -1.0) {
        gl_Position.z = -gl_Position.w;
    }
`;
const vec$1 = new Vec3();
/**
 * A script for creating interactive 3D annotations in a scene. Each annotation consists of:
 *
 * - A 3D hotspot that maintains constant screen-space size. The hotspot is rendered with muted
 * appearance when obstructed by geometry but is still clickable. The hotspot relies on an
 * invisible DOM element that matches the hotspot's size and position to detect clicks.
 * - An annotation panel that shows title and description text.
 */
class Annotation extends Script {
    static scriptName = 'annotation';
    static hotspotSize = 25;
    static hotspotColor = new Color(0.8, 0.8, 0.8);
    static hoverColor = new Color(1.0, 0.4, 0.0);
    static parentDom = null;
    static styleSheet = null;
    static camera = null;
    static tooltipDom = null;
    static titleDom = null;
    static textDom = null;
    static layers = [];
    static mesh = null;
    static activeAnnotation = null;
    static hoverAnnotation = null;
    static opacity = 1.0;
    /**
     * @attribute
     */
    label;
    /**
     * @attribute
     */
    title;
    /**
     * @attribute
     */
    text;
    /**
     * @private
     */
    hotspotDom = null;
    /**
     * @private
     */
    texture = null;
    /**
     * @private
     */
    materials = [];
    /**
     * Injects required CSS styles into the document.
     * @param {number} size - The size of the hotspot in screen pixels.
     * @private
     */
    static _injectStyles(size) {
        const css = `
            .pc-annotation {
                display: block;
                position: absolute;
                background-color: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
                pointer-events: none;
                max-width: 200px;
                word-wrap: break-word;
                overflow-x: visible;
                white-space: normal;
                width: fit-content;
                opacity: 0;
                transition: opacity 0.2s ease-in-out;
                visibility: hidden;
                transform: translate(25px, -50%);
            }

            .pc-annotation-title {
                font-weight: bold;
                margin-bottom: 4px;
            }

            /* Add a little triangular arrow on the left edge of the tooltip */
            .pc-annotation::before {
                content: "";
                position: absolute;
                left: -8px;
                top: 50%;
                transform: translateY(-50%);
                width: 0;
                height: 0;
                border-top: 8px solid transparent;
                border-bottom: 8px solid transparent;
                border-right: 8px solid rgba(0, 0, 0, 0.8);
            }

            .pc-annotation-hotspot {
                display: none;
                position: absolute;
                width: ${size + 5}px;
                height: ${size + 5}px;
                opacity: 0;
                cursor: pointer;
                transform: translate(-50%, -50%);
            }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        Annotation.styleSheet = style;
    }
    /**
     * Initialize static resources.
     * @param {AppBase} app - The application instance
     * @private
     */
    static _initializeStatic(app) {
        if (Annotation.styleSheet) {
            return;
        }
        Annotation._injectStyles(Annotation.hotspotSize);
        if (Annotation.parentDom === null) {
            Annotation.parentDom = document.body;
        }
        const { layers } = app.scene;
        const worldLayer = layers.getLayerByName('World');
        const createLayer = (name, semitrans) => {
            const layer = new Layer({ name: name });
            const idx = semitrans ? layers.getTransparentIndex(worldLayer) : layers.getOpaqueIndex(worldLayer);
            layers.insert(layer, idx + 1);
            return layer;
        };
        Annotation.layers = [
            createLayer('HotspotBase', false),
            createLayer('HotspotOverlay', true)
        ];
        if (Annotation.camera === null) {
            Annotation.camera = app.root.findComponent('camera').entity;
        }
        Annotation.camera.camera.layers = [
            ...Annotation.camera.camera.layers,
            ...Annotation.layers.map(layer => layer.id)
        ];
        Annotation.mesh = Mesh.fromGeometry(app.graphicsDevice, new PlaneGeometry({
            widthSegments: 1,
            lengthSegments: 1
        }));
        // Initialize tooltip dom
        Annotation.tooltipDom = document.createElement('div');
        Annotation.tooltipDom.className = 'pc-annotation';
        Annotation.titleDom = document.createElement('div');
        Annotation.titleDom.className = 'pc-annotation-title';
        Annotation.tooltipDom.appendChild(Annotation.titleDom);
        Annotation.textDom = document.createElement('div');
        Annotation.textDom.className = 'pc-annotation-text';
        Annotation.tooltipDom.appendChild(Annotation.textDom);
        Annotation.parentDom.appendChild(Annotation.tooltipDom);
    }
    /**
     * Creates a circular hotspot texture.
     * @param {AppBase} app - The PlayCanvas AppBase
     * @param {string} label - Label text to draw on the hotspot
     * @param {number} [size] - The texture size (should be power of 2)
     * @param {number} [borderWidth] - The border width in pixels
     * @returns {Texture} The hotspot texture
     * @private
     */
    static _createHotspotTexture(app, label, size = 64, borderWidth = 6) {
        // Create canvas for hotspot texture
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // First clear with stroke color at zero alpha
        ctx.fillStyle = 'white';
        ctx.globalAlpha = 0;
        ctx.fillRect(0, 0, size, size);
        ctx.globalAlpha = 1.0;
        // Draw dark circle with light border
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = (size / 2) - 4; // Leave space for border
        // Draw main circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'black';
        ctx.fill();
        // Draw border
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = 'white';
        ctx.stroke();
        // Draw text
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.fillText(label, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2) + 1);
        // get pixel data
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        // set the color channel of semitransparent pixels to white so the blending at
        // the edges is correct
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 255) {
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
            }
        }
        const texture = new Texture(app.graphicsDevice, {
            width: size,
            height: size,
            format: PIXELFORMAT_RGBA8,
            magFilter: FILTER_LINEAR,
            minFilter: FILTER_LINEAR,
            mipmaps: false,
            levels: [new Uint8Array(data.buffer)]
        });
        return texture;
    }
    /**
     * Creates a material for hotspot rendering.
     * @param {Texture} texture - The texture to use for emissive and opacity
     * @param {object} [options] - Material options
     * @param {number} [options.opacity] - Base opacity multiplier
     * @param {boolean} [options.depthTest] - Whether to perform depth testing
     * @param {boolean} [options.depthWrite] - Whether to write to depth buffer
     * @returns {StandardMaterial} The configured material
     * @private
     */
    static _createHotspotMaterial(texture, { opacity = 1, depthTest = true, depthWrite = true } = {}) {
        const material = new StandardMaterial();
        // Base properties
        material.diffuse = Color.BLACK;
        material.emissive.copy(Annotation.hotspotColor);
        material.emissiveMap = texture;
        material.opacityMap = texture;
        // Alpha properties
        material.opacity = opacity;
        material.alphaTest = 0.01;
        material.blendState = new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA, BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE);
        // Depth properties
        material.depthTest = depthTest;
        material.depthWrite = depthWrite;
        // Rendering properties
        material.cull = CULLFACE_NONE;
        material.useLighting = false;
        material.shaderChunks.glsl.add({
            'litUserMainEndVS': depthClamp
        });
        material.update();
        return material;
    }
    initialize() {
        // Ensure static resources are initialized
        Annotation._initializeStatic(this.app);
        // Create texture
        this.texture = Annotation._createHotspotTexture(this.app, this.label);
        // Create material the base and overlay material
        this.materials = [
            Annotation._createHotspotMaterial(this.texture, {
                opacity: 1,
                depthTest: true,
                depthWrite: true
            }),
            Annotation._createHotspotMaterial(this.texture, {
                opacity: 0.25,
                depthTest: false,
                depthWrite: false
            })
        ];
        const base = new Entity('base');
        const baseMi = new MeshInstance(Annotation.mesh, this.materials[0]);
        baseMi.cull = false;
        base.addComponent('render', {
            layers: [Annotation.layers[0].id],
            meshInstances: [baseMi]
        });
        const overlay = new Entity('overlay');
        const overlayMi = new MeshInstance(Annotation.mesh, this.materials[1]);
        overlayMi.cull = false;
        overlay.addComponent('render', {
            layers: [Annotation.layers[1].id],
            meshInstances: [overlayMi]
        });
        this.entity.addChild(base);
        this.entity.addChild(overlay);
        // Create hotspot dom
        this.hotspotDom = document.createElement('div');
        this.hotspotDom.className = 'pc-annotation-hotspot';
        // Add click handlers
        this.hotspotDom.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showTooltip();
        });
        const leave = () => {
            if (Annotation.hoverAnnotation === this) {
                Annotation.hoverAnnotation = null;
                this.setHover(false);
            }
        };
        const enter = () => {
            if (Annotation.hoverAnnotation !== null) {
                Annotation.hoverAnnotation.setHover(false);
            }
            Annotation.hoverAnnotation = this;
            this.setHover(true);
        };
        this.hotspotDom.addEventListener('pointerenter', enter);
        this.hotspotDom.addEventListener('pointerleave', leave);
        document.addEventListener('click', () => {
            this.hideTooltip();
        });
        Annotation.parentDom.appendChild(this.hotspotDom);
        // Clean up on entity destruction
        this.on('destroy', () => {
            this.hotspotDom.remove();
            if (Annotation.activeAnnotation === this) {
                this.hideTooltip();
            }
            this.materials.forEach(mat => mat.destroy());
            this.materials = [];
            this.texture.destroy();
            this.texture = null;
        });
        this.app.on('prerender', () => {
            if (!Annotation.camera)
                return;
            const position = this.entity.getPosition();
            const screenPos = Annotation.camera.camera.worldToScreen(position);
            const { viewMatrix } = Annotation.camera.camera;
            viewMatrix.transformPoint(position, vec$1);
            if (vec$1.z >= 0) {
                this._hideElements();
                return;
            }
            this._updatePositions(screenPos);
            this._updateRotationAndScale();
            // update material opacity and also directly on the uniform so we
            // can avoid a full material update
            this.materials[0].opacity = Annotation.opacity;
            this.materials[1].opacity = 0.25 * Annotation.opacity;
            this.materials[0].setParameter('material_opacity', Annotation.opacity);
            this.materials[1].setParameter('material_opacity', 0.25 * Annotation.opacity);
        });
    }
    /**
     * Set the hover state of the annotation.
     * @param hover - Whether the annotation is hovered
     * @private
     */
    setHover(hover) {
        this.materials.forEach((material) => {
            material.emissive.copy(hover ? Annotation.hoverColor : Annotation.hotspotColor);
            material.update();
        });
        this.fire('hover', hover);
    }
    /**
     * @private
     */
    showTooltip() {
        Annotation.activeAnnotation = this;
        Annotation.tooltipDom.style.visibility = 'visible';
        Annotation.tooltipDom.style.opacity = '1';
        Annotation.titleDom.textContent = this.title;
        Annotation.textDom.textContent = this.text;
        this.fire('show', this);
    }
    /**
     * @private
     */
    hideTooltip() {
        Annotation.activeAnnotation = null;
        Annotation.tooltipDom.style.opacity = '0';
        // Wait for fade out before hiding
        setTimeout(() => {
            if (Annotation.tooltipDom.style.opacity === '0') {
                Annotation.tooltipDom.style.visibility = 'hidden';
            }
            this.fire('hide');
        }, 200); // Match the transition duration
    }
    /**
     * Hide all elements when annotation is behind camera.
     * @private
     */
    _hideElements() {
        this.hotspotDom.style.display = 'none';
        if (Annotation.activeAnnotation === this) {
            if (Annotation.tooltipDom.style.visibility !== 'hidden') {
                this.hideTooltip();
            }
        }
    }
    /**
     * Update screen-space positions of HTML elements.
     * @param {Vec3} screenPos - Screen coordinate
     * @private
     */
    _updatePositions(screenPos) {
        // Show and position hotspot
        this.hotspotDom.style.display = 'block';
        this.hotspotDom.style.left = `${screenPos.x}px`;
        this.hotspotDom.style.top = `${screenPos.y}px`;
        // Position tooltip
        if (Annotation.activeAnnotation === this) {
            Annotation.tooltipDom.style.left = `${screenPos.x}px`;
            Annotation.tooltipDom.style.top = `${screenPos.y}px`;
        }
    }
    /**
     * Update 3D rotation and scale of hotspot planes.
     * @private
     */
    _updateRotationAndScale() {
        // Copy camera rotation to align with view plane
        const cameraRotation = Annotation.camera.getRotation();
        this._updateHotspotTransform(this.entity, cameraRotation);
        // Calculate scale based on distance to maintain constant screen size
        const scale = this._calculateScreenSpaceScale();
        this.entity.setLocalScale(scale, scale, scale);
    }
    /**
     * Update rotation of a single hotspot entity.
     * @param {Entity} hotspot - The hotspot entity to update
     * @param {Quat} cameraRotation - The camera's current rotation
     * @private
     */
    _updateHotspotTransform(hotspot, cameraRotation) {
        hotspot.setRotation(cameraRotation);
        hotspot.rotateLocal(90, 0, 0);
    }
    /**
     * Calculate scale factor to maintain constant screen-space size.
     * @returns {number} The scale to apply to hotspot entities
     * @private
     */
    _calculateScreenSpaceScale() {
        const cameraPos = Annotation.camera.getPosition();
        const toAnnotation = this.entity.getPosition().sub(cameraPos);
        const distance = toAnnotation.length();
        // Use the canvas's CSS/client height instead of graphics device height
        const canvas = this.app.graphicsDevice.canvas;
        const screenHeight = canvas.clientHeight;
        // Get the camera's projection matrix vertical scale factor
        const projMatrix = Annotation.camera.camera.projectionMatrix;
        const worldSize = (Annotation.hotspotSize / screenHeight) * (2 * distance / projMatrix.data[5]);
        return worldSize;
    }
}

class Annotations {
    annotations;
    parentDom;
    constructor(global, hasCameraFrame) {
        // create dom parent
        const parentDom = document.createElement('div');
        parentDom.id = 'annotations';
        Annotation.parentDom = parentDom;
        document.querySelector('#ui').appendChild(parentDom);
        global.events.on('controlsHidden:changed', (value) => {
            parentDom.style.display = value ? 'none' : 'block';
            Annotation.opacity = value ? 0.0 : 1.0;
            global.app.renderNextFrame = true;
        });
        this.annotations = global.settings.annotations;
        this.parentDom = parentDom;
        if (hasCameraFrame) {
            Annotation.hotspotColor.gamma();
            Annotation.hoverColor.gamma();
        }
        // create annotation entities
        const parent = global.app.root;
        for (let i = 0; i < this.annotations.length; i++) {
            const ann = this.annotations[i];
            const entity = new Entity();
            entity.addComponent('script');
            entity.script.create(Annotation);
            const script = entity.script;
            script.annotation.label = (i + 1).toString();
            script.annotation.title = ann.title;
            script.annotation.text = ann.text;
            entity.setPosition(ann.position[0], ann.position[1], ann.position[2]);
            parent.addChild(entity);
            // handle an annotation being activated/shown
            script.annotation.on('show', () => {
                global.events.fire('annotation.activate', ann);
            });
            // re-render if hover state changes
            script.annotation.on('hover', (hover) => {
                global.app.renderNextFrame = true;
            });
        }
    }
}

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
const createRotateTrack = (position, target, fov, keys = 12, duration = 20) => {
    const times = new Array(keys).fill(0).map((_, i) => i / keys * duration);
    const positions = [];
    const targets = [];
    const fovs = new Array(keys).fill(fov);
    const mat = new Mat4();
    const vec = new Vec3();
    const dif = new Vec3(position.x - target.x, position.y - target.y, position.z - target.z);
    for (let i = 0; i < keys; ++i) {
        mat.setFromEulerAngles(0, -i / keys * 360, 0);
        mat.transformPoint(dif, vec);
        positions.push(target.x + vec.x);
        positions.push(target.y + vec.y);
        positions.push(target.z + vec.z);
        targets.push(target.x);
        targets.push(target.y);
        targets.push(target.z);
    }
    return {
        name: 'rotate',
        duration,
        frameRate: 1,
        loopMode: 'repeat',
        interpolation: 'spline',
        smoothness: 1,
        keyframes: {
            times,
            values: {
                position: positions,
                target: targets,
                fov: fovs
            }
        }
    };
};

class CubicSpline {
    // control times
    times;
    // control data: in-tangent, point, out-tangent
    knots;
    // dimension of the knot points
    dim;
    constructor(times, knots) {
        this.times = times;
        this.knots = knots;
        this.dim = knots.length / times.length / 3;
    }
    evaluate(time, result) {
        const { times } = this;
        const last = times.length - 1;
        if (time <= times[0]) {
            this.getKnot(0, result);
        }
        else if (time >= times[last]) {
            this.getKnot(last, result);
        }
        else {
            let seg = 0;
            while (time >= times[seg + 1]) {
                seg++;
            }
            this.evaluateSegment(seg, (time - times[seg]) / (times[seg + 1] - times[seg]), result);
        }
    }
    getKnot(index, result) {
        const { knots, dim } = this;
        const idx = index * 3 * dim;
        for (let i = 0; i < dim; ++i) {
            result[i] = knots[idx + i * 3 + 1];
        }
    }
    // evaluate the spline segment at the given normalized time t
    evaluateSegment(segment, t, result) {
        const { knots, dim } = this;
        const t2 = t * t;
        const twot = t + t;
        const omt = 1 - t;
        const omt2 = omt * omt;
        let idx = segment * dim * 3; // each knot has 3 values: tangent in, value, tangent out
        for (let i = 0; i < dim; ++i) {
            const p0 = knots[idx + 1]; // p0
            const m0 = knots[idx + 2]; // outgoing tangent
            const m1 = knots[idx + dim * 3]; // incoming tangent
            const p1 = knots[idx + dim * 3 + 1]; // p1
            idx += 3;
            result[i] =
                p0 * ((1 + twot) * omt2) +
                    m0 * (t * omt2) +
                    p1 * (t2 * (3 - twot)) +
                    m1 * (t2 * (t - 1));
        }
    }
    // calculate cubic spline knots from points
    // times: time values for each control point
    // points: control point values to be interpolated (n dimensional)
    // smoothness: 0 = linear, 1 = smooth
    static calcKnots(times, points, smoothness) {
        const n = times.length;
        const dim = points.length / n;
        const knots = new Array(n * dim * 3);
        for (let i = 0; i < n; i++) {
            const t = times[i];
            for (let j = 0; j < dim; j++) {
                const idx = i * dim + j;
                const p = points[idx];
                let tangent;
                if (i === 0) {
                    tangent = (points[idx + dim] - p) / (times[i + 1] - t);
                }
                else if (i === n - 1) {
                    tangent = (p - points[idx - dim]) / (t - times[i - 1]);
                }
                else {
                    tangent = (points[idx + dim] - points[idx - dim]) / (times[i + 1] - times[i - 1]);
                }
                // convert to derivatives w.r.t normalized segment parameter
                const inScale = i > 0 ? (times[i] - times[i - 1]) : (times[1] - times[0]);
                const outScale = i < n - 1 ? (times[i + 1] - times[i]) : (times[i] - times[i - 1]);
                knots[idx * 3] = tangent * inScale * smoothness;
                knots[idx * 3 + 1] = p;
                knots[idx * 3 + 2] = tangent * outScale * smoothness;
            }
        }
        return knots;
    }
    static fromPoints(times, points, smoothness = 1) {
        return new CubicSpline(times, CubicSpline.calcKnots(times, points, smoothness));
    }
    // create a looping spline by duplicating animation points at the end and beginning
    static fromPointsLooping(length, times, points, smoothness = 1) {
        if (times.length < 2) {
            return CubicSpline.fromPoints(times, points);
        }
        const dim = points.length / times.length;
        const newTimes = times.slice();
        const newPoints = points.slice();
        // append first two points
        newTimes.push(length + times[0], length + times[1]);
        newPoints.push(...points.slice(0, dim * 2));
        // prepend last two points
        newTimes.splice(0, 0, times[times.length - 2] - length, times[times.length - 1] - length);
        newPoints.splice(0, 0, ...points.slice(points.length - dim * 2));
        return CubicSpline.fromPoints(newTimes, newPoints, smoothness);
    }
}

/**
 * Damping function to smooth out transitions.
 *
 * @param damping - Damping factor (0 < damping < 1).
 * @param dt - Delta time in seconds.
 * @returns - Damping factor adjusted for the delta time.
 */
/**
 * Easing function for smooth transitions.
 *
 * @param x - Input value in the range [0, 1].
 * @returns - Output value in the range [0, 1].
 */
const easeOut = (x) => (1 - (2 ** (-10 * x))) / (1 - (2 ** -10));
/**
 * Modulus function that handles negative values correctly.
 *
 * @param n - The number to be modulated.
 * @param m - The modulus value.
 * @returns - The result of n mod m, adjusted to be non-negative.
 */
const mod = (n, m) => ((n % m) + m) % m;
const nearlyEquals = (a, b, epsilon = 1e-4) => {
    return !a.some((v, i) => Math.abs(v - b[i]) >= epsilon);
};
const vecToAngles = (result, vec) => {
    const radToDeg = 180 / Math.PI;
    result.x = Math.asin(vec.y) * radToDeg;
    result.y = Math.atan2(-vec.x, -vec.z) * radToDeg;
    result.z = 0;
    return result;
};

// track an animation cursor with support for repeat and ping-pong loop modes
class AnimCursor {
    duration = 0;
    loopMode = 'none';
    timer = 0;
    cursor = 0;
    constructor(duration, loopMode) {
        this.reset(duration, loopMode);
    }
    update(deltaTime) {
        // update animation timer
        this.timer += deltaTime;
        // update the track cursor
        this.cursor += deltaTime;
        if (this.cursor >= this.duration) {
            switch (this.loopMode) {
                case 'none':
                    this.cursor = this.duration;
                    break;
                case 'repeat':
                    this.cursor %= this.duration;
                    break;
                case 'pingpong':
                    this.cursor %= (this.duration * 2);
                    break;
            }
        }
    }
    reset(duration, loopMode) {
        this.duration = duration;
        this.loopMode = loopMode;
        this.timer = 0;
        this.cursor = 0;
    }
    set value(value) {
        this.cursor = mod(value, this.duration);
    }
    get value() {
        return this.cursor > this.duration ? this.duration - this.cursor : this.cursor;
    }
}

// manage the state of a camera animation track
class AnimState {
    spline;
    cursor = new AnimCursor(0, 'none');
    frameRate;
    result = [];
    position = new Vec3();
    target = new Vec3();
    constructor(spline, duration, loopMode, frameRate) {
        this.spline = spline;
        this.cursor.reset(duration, loopMode);
        this.frameRate = frameRate;
    }
    // update given delta time
    update(dt) {
        const { cursor, result, spline, frameRate, position, target } = this;
        // update the animation cursor
        cursor.update(dt);
        // evaluate the spline
        spline.evaluate(cursor.value * frameRate, result);
        if (result.every(isFinite)) {
            position.set(result[0], result[1], result[2]);
            target.set(result[3], result[4], result[5]);
        }
    }
    // construct an animation from a settings track
    static fromTrack(track) {
        const { keyframes, duration, frameRate, loopMode, smoothness } = track;
        const { times, values } = keyframes;
        const { position, target } = values;
        // construct the points array containing position and target
        const points = [];
        for (let i = 0; i < times.length; i++) {
            points.push(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
            points.push(target[i * 3], target[i * 3 + 1], target[i * 3 + 2]);
        }
        const extra = (duration === times[times.length - 1] / frameRate) ? 1 : 0;
        const spline = CubicSpline.fromPointsLooping((duration + extra) * frameRate, times, points, smoothness);
        return new AnimState(spline, duration, loopMode, frameRate);
    }
}

class AnimController {
    animState;
    constructor(animTrack) {
        this.animState = AnimState.fromTrack(animTrack);
        this.animState.update(0);
    }
    onEnter(camera) {
        // snap camera to start position
        camera.look(this.animState.position, this.animState.target);
    }
    update(deltaTime, inputFrame, camera) {
        this.animState.update(deltaTime);
        // update camera pose
        camera.look(this.animState.position, this.animState.target);
        // ignore input
        inputFrame.read();
    }
    onExit(camera) {
    }
}

const rotation = new Quat();
const avec = new Vec3();
const bvec = new Vec3();
class Camera {
    position = new Vec3();
    angles = new Vec3();
    distance = 1;
    fov = 65;
    constructor(other) {
        if (other) {
            this.copy(other);
        }
    }
    copy(source) {
        this.position.copy(source.position);
        this.angles.copy(source.angles);
        this.distance = source.distance;
        this.fov = source.fov;
    }
    lerp(a, b, t) {
        a.calcFocusPoint(avec);
        b.calcFocusPoint(bvec);
        this.position.lerp(a.position, b.position, t);
        avec.lerp(avec, bvec, t).sub(this.position);
        this.distance = avec.length();
        vecToAngles(this.angles, avec.mulScalar(1.0 / this.distance));
        this.fov = math.lerp(a.fov, b.fov, t);
    }
    look(from, to) {
        this.position.copy(from);
        this.distance = from.distance(to);
        const dir = avec.sub2(to, from).normalize();
        vecToAngles(this.angles, dir);
    }
    calcFocusPoint(result) {
        rotation.setFromEulerAngles(this.angles)
            .transformVector(Vec3.FORWARD, result)
            .mulScalar(this.distance)
            .add(this.position);
    }
}

const p$1 = new Pose();
class FlyController {
    controller;
    constructor() {
        this.controller = new FlyController$1();
        this.controller.pitchRange = new Vec2(-90, 90);
        this.controller.rotateDamping = 0.97;
        this.controller.moveDamping = 0.97;
    }
    onEnter(camera) {
        p$1.position.copy(camera.position);
        p$1.angles.copy(camera.angles);
        p$1.distance = camera.distance;
        this.controller.attach(p$1, false);
    }
    update(deltaTime, inputFrame, camera) {
        const pose = this.controller.update(inputFrame, deltaTime);
        camera.position.copy(pose.position);
        camera.angles.copy(pose.angles);
        camera.distance = pose.distance;
    }
    onExit(camera) {
    }
    goto(pose) {
        this.controller.attach(pose, true);
    }
}

const p = new Pose();
class OrbitController {
    controller;
    constructor() {
        this.controller = new OrbitController$1();
        this.controller.zoomRange = new Vec2(0.01, Infinity);
        this.controller.pitchRange = new Vec2(-90, 90);
        this.controller.rotateDamping = 0.97;
        this.controller.moveDamping = 0.97;
        this.controller.zoomDamping = 0.97;
    }
    onEnter(camera) {
        p.position.copy(camera.position);
        p.angles.copy(camera.angles);
        p.distance = camera.distance;
        this.controller.attach(p, false);
    }
    update(deltaTime, inputFrame, camera) {
        const pose = this.controller.update(inputFrame, deltaTime);
        camera.position.copy(pose.position);
        camera.angles.copy(pose.angles);
        camera.distance = pose.distance;
    }
    onExit(camera) {
    }
    goto(camera) {
        p.position.copy(camera.position);
        p.angles.copy(camera.angles);
        p.distance = camera.distance;
        this.controller.attach(p, true);
    }
}

const tmpCamera = new Camera();
const tmpv = new Vec3();
const createCamera = (position, target, fov) => {
    const result = new Camera();
    result.look(position, target);
    result.fov = fov;
    return result;
};
const createFrameCamera = (bbox, fov) => {
    const sceneSize = bbox.halfExtents.length();
    const distance = sceneSize / Math.sin(fov / 180 * Math.PI * 0.5);
    return createCamera(new Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center), bbox.center, fov);
};
class CameraManager {
    update;
    // holds the camera state
    camera = new Camera();
    constructor(global, bbox) {
        const { events, settings, state } = global;
        const camera0 = settings.cameras[0].initial;
        const frameCamera = createFrameCamera(bbox, camera0.fov);
        const resetCamera = createCamera(new Vec3(camera0.position), new Vec3(camera0.target), camera0.fov);
        const getAnimTrack = (initial, isObjectExperience) => {
            const { animTracks } = settings;
            // extract the camera animation track from settings
            if (animTracks?.length > 0 && settings.startMode === 'animTrack') {
                // use the first animTrack
                return animTracks[0];
            }
            else if (isObjectExperience) {
                // create basic rotation animation if no anim track is specified
                initial.calcFocusPoint(tmpv);
                return createRotateTrack(initial.position, tmpv, initial.fov);
            }
            return null;
        };
        // object experience starts outside the bounding box
        const isObjectExperience = !bbox.containsPoint(resetCamera.position);
        const animTrack = getAnimTrack(settings.hasStartPose ? resetCamera : frameCamera, isObjectExperience);
        const controllers = {
            orbit: new OrbitController(),
            fly: new FlyController(),
            anim: animTrack ? new AnimController(animTrack) : null
        };
        const getController = (cameraMode) => {
            return controllers[cameraMode];
        };
        // set the global animation flag
        state.hasAnimation = !!controllers.anim;
        state.animationDuration = controllers.anim ? controllers.anim.animState.cursor.duration : 0;
        // initialize camera mode and initial camera position
        state.cameraMode = state.hasAnimation ? 'anim' : (isObjectExperience ? 'orbit' : 'fly');
        this.camera.copy(resetCamera);
        const target = new Camera(this.camera); // the active controller updates this
        const from = new Camera(this.camera); // stores the previous camera state during transition
        let fromMode = isObjectExperience ? 'orbit' : 'fly';
        // enter the initial controller
        getController(state.cameraMode).onEnter(this.camera);
        // transition time between cameras
        const transitionSpeed = 2.0;
        let transitionTimer = 1;
        // application update
        this.update = (deltaTime, frame) => {
            // use dt of 0 if animation is paused
            const dt = state.cameraMode === 'anim' && state.animationPaused ? 0 : deltaTime;
            // update transition timer
            transitionTimer = Math.min(1, transitionTimer + deltaTime * transitionSpeed);
            const controller = getController(state.cameraMode);
            controller.update(dt, frame, target);
            if (transitionTimer < 1) {
                // lerp away from previous camera during transition
                this.camera.lerp(from, target, easeOut(transitionTimer));
            }
            else {
                this.camera.copy(target);
            }
            // update animation timeline
            if (state.cameraMode === 'anim') {
                state.animationTime = controllers.anim.animState.cursor.value;
            }
        };
        // handle input events
        events.on('inputEvent', (eventName, event) => {
            switch (eventName) {
                case 'frame':
                    state.cameraMode = 'orbit';
                    controllers.orbit.goto(frameCamera);
                    break;
                case 'reset':
                    state.cameraMode = 'orbit';
                    controllers.orbit.goto(resetCamera);
                    break;
                case 'playPause':
                    if (state.hasAnimation) {
                        if (state.cameraMode === 'anim') {
                            state.animationPaused = !state.animationPaused;
                        }
                        else {
                            state.cameraMode = 'anim';
                            state.animationPaused = false;
                        }
                    }
                    break;
                case 'cancel':
                case 'interrupt':
                    if (state.cameraMode === 'anim') {
                        state.cameraMode = fromMode;
                    }
                    break;
            }
        });
        // handle camera mode switching
        events.on('cameraMode:changed', (value, prev) => {
            // store previous camera mode and pose
            target.copy(this.camera);
            from.copy(this.camera);
            fromMode = prev;
            // exit the old controller
            const prevController = getController(prev);
            prevController.onExit(this.camera);
            // enter new controller
            const newController = getController(value);
            newController.onEnter(this.camera);
            // reset camera transition timer
            transitionTimer = 0;
        });
        // handle user scrubbing the animation timeline
        events.on('scrubAnim', (time) => {
            // switch to animation camera if we're not already there
            state.cameraMode = 'anim';
            // set time
            controllers.anim.animState.cursor.value = time;
        });
        // handle user picking in the scene
        events.on('pick', (position) => {
            // switch to orbit camera on pick
            state.cameraMode = 'orbit';
            // construct camera
            tmpCamera.copy(this.camera);
            tmpCamera.look(this.camera.position, position);
            controllers.orbit.goto(tmpCamera);
        });
        events.on('annotation.activate', (annotation) => {
            // switch to orbit camera on pick
            state.cameraMode = 'orbit';
            const { initial } = annotation.camera;
            // construct camera
            tmpCamera.fov = initial.fov;
            tmpCamera.look(new Vec3(initial.position), new Vec3(initial.target));
            controllers.orbit.goto(tmpCamera);
        });
    }
}

const float32 = new Float32Array(1);
const uint8 = new Uint8Array(float32.buffer);
const two = new Vec4(2, 2, 2, 1);
const one = new Vec4(1, 1, 1, 0);
class Picker {
    app;
    camera;
    picker;
    constructor(app, camera) {
        this.app = app;
        this.camera = camera;
        this.picker = null;
    }
    async pick(x, y) {
        const { app, camera } = this;
        const { graphicsDevice } = app;
        const { canvas } = graphicsDevice;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        y = graphicsDevice.isWebGL2 ? height - y - 1 : y;
        // construct picker on demand
        if (!this.picker) {
            this.picker = new Picker$1(app, width, height);
        }
        // render scene, read depth
        const { picker } = this;
        picker.resize(width, height);
        picker.prepare(camera.camera, app.scene, [app.scene.layers.getLayerByName('World')]);
        const pixels = await picker.renderTarget.colorBuffer.read(x, y, 1, 1, {
            renderTarget: picker.renderTarget
        });
        for (let i = 0; i < 4; ++i) {
            uint8[i] = pixels[i];
        }
        const depth = float32[0];
        // 255, 255, 255, 255 === NaN
        if (!isFinite(depth)) {
            return null;
        }
        // clip space
        const pos = new Vec4(x / width, y / height, depth, 1).mul(two).sub(one);
        if (!graphicsDevice.isWebGL2) {
            pos.y *= -1;
        }
        // homogeneous view space
        camera.camera.projectionMatrix.clone().invert().transformVec4(pos, pos);
        // perform perspective divide
        pos.mulScalar(1.0 / pos.w);
        // view to world space
        const pos3 = new Vec3(pos.x, pos.y, pos.z);
        camera.getWorldTransform().transformPoint(pos3, pos3);
        return pos3;
    }
}

/* Vec initialisation to avoid recurrent memory allocation */
const tmpV1 = new Vec3();
const tmpV2 = new Vec3();
const mouseRotate = new Vec3();
const flyMove = new Vec3();
const pinchMove = new Vec3();
const orbitRotate = new Vec3();
const flyRotate = new Vec3();
const stickMove = new Vec3();
const stickRotate = new Vec3();
/**
 * Converts screen space mouse deltas to world space pan vector.
 *
 * @param camera - The camera component.
 * @param dx - The mouse delta x value.
 * @param dy - The mouse delta y value.
 * @param dz - The world space zoom delta value.
 * @param out - The output vector to store the pan result.
 * @returns - The pan vector in world space.
 * @private
 */
const screenToWorld = (camera, dx, dy, dz, out = new Vec3()) => {
    const { system, fov, aspectRatio, horizontalFov, projection, orthoHeight } = camera;
    const { width, height } = system.app.graphicsDevice.clientRect;
    // normalize deltas to device coord space
    out.set(-(dx / width) * 2, (dy / height) * 2, 0);
    // calculate half size of the view frustum at the current distance
    const halfSize = tmpV2.set(0, 0, 0);
    if (projection === PROJECTION_PERSPECTIVE) {
        const halfSlice = dz * Math.tan(0.5 * fov * math.DEG_TO_RAD);
        if (horizontalFov) {
            halfSize.set(halfSlice, halfSlice / aspectRatio, 0);
        }
        else {
            halfSize.set(halfSlice * aspectRatio, halfSlice, 0);
        }
    }
    else {
        halfSize.set(orthoHeight * aspectRatio, orthoHeight, 0);
    }
    // scale by device coord space
    out.mul(halfSize);
    return out;
};
class InputController {
    _state = {
        axis: new Vec3(),
        mouse: [0, 0, 0],
        shift: 0,
        ctrl: 0,
        touches: 0
    };
    _desktopInput = new KeyboardMouseSource();
    _orbitInput = new MultiTouchSource();
    _flyInput = new DualGestureSource();
    _gamepadInput = new GamepadSource();
    global;
    frame = new InputFrame({
        move: [0, 0, 0],
        rotate: [0, 0, 0]
    });
    joystick = { base: null, stick: null };
    // this gets overridden by the viewer based on scene size
    moveSpeed = 4;
    orbitSpeed = 18;
    pinchSpeed = 0.4;
    wheelSpeed = 0.06;
    constructor(global) {
        const { app, camera, events, state } = global;
        const canvas = app.graphicsDevice.canvas;
        this._desktopInput.attach(canvas);
        this._orbitInput.attach(canvas);
        this._flyInput.attach(canvas);
        // convert events to joystick state
        this._flyInput.on('joystick:position:left', ([bx, by, sx, sy]) => {
            if (bx < 0 || by < 0 || sx < 0 || sy < 0) {
                this.joystick.base = null;
                this.joystick.stick = null;
                return;
            }
            this.joystick.base = [bx, by];
            this.joystick.stick = [sx - bx, sy - by];
        });
        this.global = global;
        // Generate input events
        ['wheel', 'pointerdown', 'contextmenu', 'keydown'].forEach((eventName) => {
            canvas.addEventListener(eventName, (event) => {
                events.fire('inputEvent', 'interrupt', event);
            });
        });
        canvas.addEventListener('pointermove', (event) => {
            events.fire('inputEvent', 'interact', event);
        });
        // Detect double taps manually because iOS doesn't send dblclick events
        const lastTap = { time: 0, x: 0, y: 0 };
        canvas.addEventListener('pointerdown', (event) => {
            const now = Date.now();
            const delay = Math.max(0, now - lastTap.time);
            if (delay < 300 &&
                Math.abs(event.clientX - lastTap.x) < 8 &&
                Math.abs(event.clientY - lastTap.y) < 8) {
                events.fire('inputEvent', 'dblclick', event);
                lastTap.time = 0;
            }
            else {
                lastTap.time = now;
                lastTap.x = event.clientX;
                lastTap.y = event.clientY;
            }
        });
        // Calculate pick location on double click
        let picker = null;
        events.on('inputEvent', async (eventName, event) => {
            switch (eventName) {
                case 'dblclick': {
                    if (!picker) {
                        picker = new Picker(app, camera);
                    }
                    const result = await picker.pick(event.offsetX, event.offsetY);
                    if (result) {
                        events.fire('pick', result);
                    }
                    break;
                }
            }
        });
        // update input mode based on pointer event
        ['pointerdown', 'pointermove'].forEach((eventName) => {
            window.addEventListener(eventName, (event) => {
                state.inputMode = event.pointerType === 'touch' ? 'touch' : 'desktop';
            });
        });
        // handle keyboard events
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                events.fire('inputEvent', 'cancel', event);
            }
            else if (!event.ctrlKey && !event.altKey && !event.metaKey) {
                switch (event.key) {
                    case 'f':
                        events.fire('inputEvent', 'frame', event);
                        break;
                    case 'r':
                        events.fire('inputEvent', 'reset', event);
                        break;
                    case ' ':
                        events.fire('inputEvent', 'playPause', event);
                        break;
                }
            }
        });
    }
    /**
     * @param dt - delta time in seconds
     * @param state - the current state of the app
     * @param state.cameraMode - the current camera mode
     * @param distance - the distance to the camera target
     */
    update(dt, distance) {
        const { keyCode } = KeyboardMouseSource;
        const { key, button, mouse, wheel } = this._desktopInput.read();
        const { touch, pinch, count } = this._orbitInput.read();
        const { leftInput, rightInput } = this._flyInput.read();
        const { leftStick, rightStick } = this._gamepadInput.read();
        const { events, state } = this.global;
        const { camera } = this.global.camera;
        // update state
        this._state.axis.add(tmpV1.set((key[keyCode.D] - key[keyCode.A]) + (key[keyCode.RIGHT] - key[keyCode.LEFT]), (key[keyCode.E] - key[keyCode.Q]), (key[keyCode.W] - key[keyCode.S]) + (key[keyCode.UP] - key[keyCode.DOWN])));
        this._state.touches += count[0];
        for (let i = 0; i < button.length; i++) {
            this._state.mouse[i] += button[i];
        }
        this._state.shift += key[keyCode.SHIFT];
        this._state.ctrl += key[keyCode.CTRL];
        if (state.cameraMode !== 'fly' && this._state.axis.length() > 0) {
            state.cameraMode = 'fly';
        }
        const orbit = +(state.cameraMode === 'orbit');
        const fly = +(state.cameraMode === 'fly');
        const double = +(this._state.touches > 1);
        const pan = this._state.mouse[2] || +(button[2] === -1) || double;
        const orbitFactor = fly ? camera.fov / 120 : 1;
        const { deltas } = this.frame;
        // desktop move
        const v = tmpV1.set(0, 0, 0);
        const keyMove = this._state.axis.clone().normalize();
        v.add(keyMove.mulScalar(fly * this.moveSpeed * (this._state.shift ? 4 : this._state.ctrl ? 0.25 : 1) * dt));
        const panMove = screenToWorld(camera, mouse[0], mouse[1], distance);
        v.add(panMove.mulScalar(pan));
        const wheelMove = new Vec3(0, 0, -wheel[0]);
        v.add(wheelMove.mulScalar(this.wheelSpeed * dt));
        // FIXME: need to flip z axis for orbit camera
        deltas.move.append([v.x, v.y, orbit ? -v.z : v.z]);
        // desktop rotate
        v.set(0, 0, 0);
        mouseRotate.set(mouse[0], mouse[1], 0);
        v.add(mouseRotate.mulScalar((1 - pan) * this.orbitSpeed * orbitFactor * dt));
        deltas.rotate.append([v.x, v.y, v.z]);
        // mobile move
        v.set(0, 0, 0);
        const orbitMove = screenToWorld(camera, touch[0], touch[1], distance);
        v.add(orbitMove.mulScalar(orbit * pan));
        flyMove.set(leftInput[0], 0, -leftInput[1]);
        v.add(flyMove.mulScalar(fly * this.moveSpeed * dt));
        pinchMove.set(0, 0, pinch[0]);
        v.add(pinchMove.mulScalar(orbit * double * this.pinchSpeed * dt));
        deltas.move.append([v.x, v.y, v.z]);
        // mobile rotate
        v.set(0, 0, 0);
        orbitRotate.set(touch[0], touch[1], 0);
        v.add(orbitRotate.mulScalar(orbit * (1 - pan) * this.orbitSpeed * dt));
        flyRotate.set(rightInput[0], rightInput[1], 0);
        v.add(flyRotate.mulScalar(fly * this.orbitSpeed * orbitFactor * dt));
        deltas.rotate.append([v.x, v.y, v.z]);
        // gamepad move
        v.set(0, 0, 0);
        stickMove.set(leftStick[0], 0, -leftStick[1]);
        v.add(stickMove.mulScalar(this.moveSpeed * dt));
        deltas.move.append([v.x, v.y, v.z]);
        // gamepad rotate
        v.set(0, 0, 0);
        stickRotate.set(rightStick[0], rightStick[1], 0);
        v.add(stickRotate.mulScalar(this.orbitSpeed * orbitFactor * dt));
        deltas.rotate.append([v.x, v.y, v.z]);
        // update touch joystick UI
        if (state.cameraMode === 'fly') {
            events.fire('touchJoystickUpdate', this.joystick.base, this.joystick.stick);
        }
    }
}

// override global pick to pack depth instead of meshInstance id
const pickDepthGlsl = /* glsl */ `
vec4 packFloat(float depth) {
    uvec4 u = (uvec4(floatBitsToUint(depth)) >> uvec4(0u, 8u, 16u, 24u)) & 0xffu;
    return vec4(u) / 255.0;
}
vec4 getPickOutput() {
    return packFloat(gl_FragCoord.z);
}
`;
const gammaChunk = `
vec3 prepareOutputFromGamma(vec3 gammaColor) {
    return gammaColor;
}
`;
const pickDepthWgsl = /* wgsl */ `
    fn packFloat(depth: f32) -> vec4f {
        let u: vec4<u32> = (vec4<u32>(bitcast<u32>(depth)) >> vec4<u32>(0u, 8u, 16u, 24u)) & vec4<u32>(0xffu);
        return vec4f(u) / 255.0;
    }

    fn getPickOutput() -> vec4f {
        return packFloat(pcPosition.z);
    }
`;
const tonemapTable = {
    none: TONEMAP_NONE,
    linear: TONEMAP_LINEAR,
    filmic: TONEMAP_FILMIC,
    hejl: TONEMAP_HEJL,
    aces: TONEMAP_ACES,
    aces2: TONEMAP_ACES2,
    neutral: TONEMAP_NEUTRAL
};
const applyPostEffectSettings = (cameraFrame, settings) => {
    if (settings.sharpness.enabled) {
        cameraFrame.rendering.sharpness = settings.sharpness.amount;
    }
    else {
        cameraFrame.rendering.sharpness = 0;
    }
    const { bloom } = cameraFrame;
    if (settings.bloom.enabled) {
        bloom.intensity = settings.bloom.intensity;
        bloom.blurLevel = settings.bloom.blurLevel;
    }
    else {
        bloom.intensity = 0;
    }
    const { grading } = cameraFrame;
    if (settings.grading.enabled) {
        grading.enabled = true;
        grading.brightness = settings.grading.brightness;
        grading.contrast = settings.grading.contrast;
        grading.saturation = settings.grading.saturation;
        grading.tint = new Color().fromArray(settings.grading.tint);
    }
    else {
        grading.enabled = false;
    }
    const { vignette } = cameraFrame;
    if (settings.vignette.enabled) {
        vignette.intensity = settings.vignette.intensity;
        vignette.inner = settings.vignette.inner;
        vignette.outer = settings.vignette.outer;
        vignette.curvature = settings.vignette.curvature;
    }
    else {
        vignette.intensity = 0;
    }
    const { fringing } = cameraFrame;
    if (settings.fringing.enabled) {
        fringing.intensity = settings.fringing.intensity;
    }
    else {
        fringing.intensity = 0;
    }
};
const anyPostEffectEnabled = (settings) => {
    return (settings.sharpness.enabled && settings.sharpness.amount > 0) ||
        (settings.bloom.enabled && settings.bloom.intensity > 0) ||
        (settings.grading.enabled) ||
        (settings.vignette.enabled && settings.vignette.intensity > 0) ||
        (settings.fringing.enabled && settings.fringing.intensity > 0);
};
const vec = new Vec3();
class Viewer {
    global;
    cameraFrame;
    inputController;
    cameraManager;
    annotations;
    forceRenderNextFrame = false;
    constructor(global, gsplatLoad, skyboxLoad) {
        this.global = global;
        const { app, settings, config, events, state, camera } = global;
        const { graphicsDevice } = app;
        // enable anonymous CORS for image loading in safari
        app.loader.getHandler('texture').imgParser.crossOrigin = 'anonymous';
        // render skybox as plain equirect
        const glsl = ShaderChunks.get(graphicsDevice, 'glsl');
        glsl.set('skyboxPS', glsl.get('skyboxPS').replace('mapRoughnessUv(uv, mipLevel)', 'uv'));
        glsl.set('pickPS', pickDepthGlsl);
        const wgsl = ShaderChunks.get(graphicsDevice, 'wgsl');
        wgsl.set('skyboxPS', wgsl.get('skyboxPS').replace('mapRoughnessUv(uv, uniform.mipLevel)', 'uv'));
        wgsl.set('pickPS', pickDepthWgsl);
        // disable auto render, we'll render only when camera changes
        app.autoRender = false;
        // apply camera animation settings
        camera.camera.aspectRatio = graphicsDevice.width / graphicsDevice.height;
        // configure the camera
        this.configureCamera(settings);
        // reconfigure camera when entering/exiting XR
        app.xr.on('start', () => this.configureCamera(settings));
        app.xr.on('end', () => this.configureCamera(settings));
        // handle horizontal fov on canvas resize
        const updateHorizontalFov = () => {
            camera.camera.horizontalFov = graphicsDevice.width > graphicsDevice.height;
            app.renderNextFrame = true;
        };
        graphicsDevice.on('resizecanvas', updateHorizontalFov);
        updateHorizontalFov();
        // handle HQ mode changes
        const updateHqMode = () => {
            graphicsDevice.maxPixelRatio = state.hqMode ? window.devicePixelRatio : 1;
            app.renderNextFrame = true;
        };
        events.on('hqMode:changed', updateHqMode);
        updateHqMode();
        // construct debug ministats
        if (config.ministats) {
            const options = MiniStats.getDefaultOptions();
            options.cpu.enabled = false;
            options.stats = options.stats.filter((s) => s.name !== 'DrawCalls');
            options.stats.push({
                name: 'VRAM',
                stats: ['vram.tex'],
                decimalPlaces: 1,
                multiplier: 1 / (1024 * 1024),
                unitsName: 'MB',
                watermark: 1024
            }, {
                name: 'Splats',
                stats: ['frame.gsplats'],
                decimalPlaces: 3,
                multiplier: 1 / 1000000,
                unitsName: 'M',
                watermark: 5
            });
            // eslint-disable-next-line no-new
            new MiniStats(app, options);
        }
        const prevProj = new Mat4();
        const prevWorld = new Mat4();
        const sceneBound = new BoundingBox();
        // track the camera state and trigger a render when it changes
        app.on('framerender', () => {
            const world = camera.getWorldTransform();
            const proj = camera.camera.projectionMatrix;
            if (!app.renderNextFrame) {
                if (config.ministats ||
                    !nearlyEquals(world.data, prevWorld.data) ||
                    !nearlyEquals(proj.data, prevProj.data)) {
                    app.renderNextFrame = true;
                }
            }
            // suppress rendering till we're ready
            if (!state.readyToRender) {
                app.renderNextFrame = false;
            }
            if (this.forceRenderNextFrame) {
                app.renderNextFrame = true;
            }
            if (app.renderNextFrame) {
                prevWorld.copy(world);
                prevProj.copy(proj);
            }
        });
        const applyCamera = (camera) => {
            const cameraEntity = global.camera;
            cameraEntity.setPosition(camera.position);
            cameraEntity.setEulerAngles(camera.angles);
            cameraEntity.camera.fov = camera.fov;
            // fit clipping planes to bounding box
            const boundRadius = sceneBound.halfExtents.length();
            // calculate the forward distance between the camera to the bound center
            vec.sub2(sceneBound.center, camera.position);
            const dist = vec.dot(cameraEntity.forward);
            const far = Math.max(dist + boundRadius, 1e-2);
            const near = Math.max(dist - boundRadius, far / (1024 * 16));
            cameraEntity.camera.farClip = far;
            cameraEntity.camera.nearClip = near;
        };
        // handle application update
        app.on('update', (deltaTime) => {
            // in xr mode we leave the camera alone
            if (app.xr.active) {
                return;
            }
            if (this.inputController && this.cameraManager) {
                // update inputs
                this.inputController.update(deltaTime, this.cameraManager.camera.distance);
                // update cameras
                this.cameraManager.update(deltaTime, this.inputController.frame);
                // apply to the camera entity
                applyCamera(this.cameraManager.camera);
            }
        });
        // unpause the animation on first frame
        events.on('firstFrame', () => {
            state.animationPaused = !!config.noanim;
        });
        // wait for the model to load
        Promise.all([gsplatLoad, skyboxLoad]).then((results) => {
            const gsplat = results[0].gsplat;
            // get scene bounding box
            const gsplatBbox = gsplat.customAabb;
            if (gsplatBbox) {
                sceneBound.setFromTransformedAabb(gsplatBbox, results[0].getWorldTransform());
            }
            if (!config.noui) {
                this.annotations = new Annotations(global, this.cameraFrame != null);
            }
            this.inputController = new InputController(global);
            this.cameraManager = new CameraManager(global, sceneBound);
            applyCamera(this.cameraManager.camera);
            const { instance } = gsplat;
            if (instance) {
                // kick off gsplat sorting immediately now that camera is in position
                instance.sort(camera);
                // listen for sorting updates to trigger first frame events
                instance.sorter?.on('updated', () => {
                    // request frame render when sorting changes
                    app.renderNextFrame = true;
                    if (!state.readyToRender) {
                        // we're ready to render once the first sort has completed
                        state.readyToRender = true;
                        // wait for the first valid frame to complete rendering
                        app.once('frameend', () => {
                            events.fire('firstFrame');
                            // emit first frame event on window
                            window.firstFrame?.();
                        });
                    }
                });
            }
            else {
                const { gsplat } = app.scene;
                // lod ranges
                const low = [2, 5];
                const high = [0, 2];
                // in unified mode, for now we hard-code LOD range on mobile vs desktop
                gsplat.lodRangeMin = low[0];
                gsplat.lodRangeMax = low[1];
                // these two allow LOD behind camera to drop, saves lots of splats
                gsplat.lodUpdateAngle = 90;
                gsplat.lodBehindPenalty = 5;
                // same performance, but rotating on slow devices does not give us unsorted splats on sides
                gsplat.radialSorting = true;
                const eventHandler = app.systems.gsplat;
                // force render empty frames otherwise unified rendering doesn't update
                this.forceRenderNextFrame = true;
                let current = 0;
                let watermark = 1;
                const readyHandler = (camera, layer, ready, loading) => {
                    if (ready && !loading) {
                        // scene is done loading
                        eventHandler.off('frame:ready', readyHandler);
                        this.forceRenderNextFrame = false;
                        state.readyToRender = true;
                        const range = platform.mobile ? low : high;
                        gsplat.lodRangeMin = range[0];
                        gsplat.lodRangeMax = range[1];
                        // wait for the first valid frame to complete rendering
                        app.once('frameend', () => {
                            events.fire('firstFrame');
                            // emit first frame event on window
                            window.firstFrame?.();
                        });
                    }
                    if (ready) {
                        app.renderNextFrame = true;
                    }
                    // update loading status
                    if (loading !== current) {
                        watermark = Math.max(watermark, loading);
                        current = watermark - loading;
                        state.progress = Math.trunc(current / watermark * 100);
                    }
                };
                eventHandler.on('frame:ready', readyHandler);
            }
        }).catch((error) => {
            console.error('Error loading 3D model or skybox:', error);
            // Handle the error appropriately, e.g., show an error message to the user
        });
    }
    // configure camera based on application mode and post process settings
    configureCamera(settings) {
        const { global } = this;
        const { app, camera } = global;
        const { postEffectSettings } = settings;
        const { background } = settings;
        const enableCameraFrame = !app.xr.active && (anyPostEffectEnabled(postEffectSettings) || settings.highPrecisionRendering);
        if (enableCameraFrame) {
            // create instance
            if (!this.cameraFrame) {
                this.cameraFrame = new CameraFrame(app, camera.camera);
            }
            const { cameraFrame } = this;
            cameraFrame.enabled = true;
            cameraFrame.rendering.toneMapping = tonemapTable[settings.tonemapping];
            cameraFrame.rendering.renderFormats = settings.highPrecisionRendering ? [PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F] : [];
            applyPostEffectSettings(cameraFrame, postEffectSettings);
            cameraFrame.update();
            // force gsplat shader to write gamma-space colors
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('gsplatOutputVS', gammaChunk);
            // ensure the final blit doesn't perform linear->gamma conversion
            RenderTarget.prototype.isColorBufferSrgb = function () {
                return true;
            };
            camera.camera.clearColor = new Color(background.color);
        }
        else {
            // no post effects needed, destroy camera frame if it exists
            if (this.cameraFrame) {
                this.cameraFrame.destroy();
                this.cameraFrame = null;
            }
            if (!app.xr.active) {
                camera.camera.toneMapping = tonemapTable[settings.tonemapping];
                camera.camera.clearColor = new Color(background.color);
            }
        }
    }
}

class XrControllers extends Script {
    static scriptName = 'xrControllers';

    /**
     * The base URL for fetching the WebXR input profiles.
     *
     * @attribute
     * @type {string}
     */
    basePath = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets/dist/profiles';

    controllers = new Map();

    initialize() {
        if (!this.app.xr) {
            console.error('XrControllers script requires XR to be enabled on the application');
            return;
        }

        this.app.xr.input.on('add', async (inputSource) => {
            if (!inputSource.profiles?.length) {
                console.warn('No profiles available for input source');
                return;
            }

            // Process all profiles concurrently
            const profilePromises = inputSource.profiles.map(async (profileId) => {
                const profileUrl = `${this.basePath}/${profileId}/profile.json`;

                try {
                    const response = await fetch(profileUrl);
                    if (!response.ok) {
                        return null;
                    }

                    const profile = await response.json();
                    const layoutPath = profile.layouts[inputSource.handedness]?.assetPath || '';
                    const assetPath = `${this.basePath}/${profile.profileId}/${inputSource.handedness}${layoutPath.replace(/^\/?(left|right)/, '')}`;

                    // Load the model
                    const asset = await new Promise((resolve, reject) => {
                        this.app.assets.loadFromUrl(assetPath, 'container', (err, asset) => {
                            if (err) reject(err);
                            else resolve(asset);
                        });
                    });

                    return { profileId, asset };
                } catch (error) {
                    console.warn(`Failed to process profile ${profileId}`);
                    return null;
                }
            });

            // Wait for all profile attempts to complete
            const results = await Promise.all(profilePromises);
            const successfulResult = results.find(result => result !== null);

            if (successfulResult) {
                const { asset } = successfulResult;
                const container = asset.resource;
                const entity = container.instantiateRenderEntity();
                this.app.root.addChild(entity);

                const jointMap = new Map();
                if (inputSource.hand) {
                    for (const joint of inputSource.hand.joints) {
                        const jointEntity = entity.findByName(joint.id);
                        if (jointEntity) {
                            jointMap.set(joint, jointEntity);
                        }
                    }
                }

                this.controllers.set(inputSource, { entity, jointMap });
            } else {
                console.warn('No compatible profiles found');
            }
        });

        this.app.xr.input.on('remove', (inputSource) => {
            const controller = this.controllers.get(inputSource);
            if (controller) {
                controller.entity.destroy();
                this.controllers.delete(inputSource);
            }
        });
    }

    update(dt) {
        if (this.app.xr?.active) {
            for (const [inputSource, { entity, jointMap }] of this.controllers) {
                if (inputSource.hand) {
                    for (const [joint, jointEntity] of jointMap) {
                        jointEntity.setPosition(joint.getPosition());
                        jointEntity.setRotation(joint.getRotation());
                    }
                } else {
                    entity.setPosition(inputSource.getPosition());
                    entity.setRotation(inputSource.getRotation());
                }
            }
        }
    }
}

/** @import { XrInputSource } from 'playcanvas' */

/**
 * Handles VR navigation with support for both teleportation and smooth locomotion.
 * Both methods can be enabled simultaneously, allowing users to choose their preferred
 * navigation method on the fly.
 *
 * Teleportation: Point and teleport using trigger/pinch gestures
 * Smooth Locomotion: Use left thumbstick for movement and right thumbstick for snap turning
 *
 * This script should be attached to a parent entity of the camera entity used for the XR
 * session. The entity hierarchy should be: XrNavigationEntity > CameraEntity for proper
 * locomotion handling. Use it in conjunction with the `XrControllers` script.
 */
class XrNavigation extends Script {
    static scriptName = 'xrNavigation';

    /**
     * Enable teleportation navigation using trigger/pinch gestures.
     * @attribute
     */
    enableTeleport = true;

    /**
     * Enable smooth locomotion using thumbsticks.
     * @attribute
     */
    enableMove = true;

    /**
     * Speed of smooth locomotion movement in meters per second.
     * @attribute
     * @range [0.1, 10]
     * @enabledif {enableMove}
     */
    movementSpeed = 1.5;

    /**
     * Angle in degrees for each snap turn.
     * @attribute
     * @range [15, 180]
     * @enabledif {enableMove}
     */
    rotateSpeed = 45;

    /**
     * Thumbstick deadzone threshold for movement.
     * @attribute
     * @range [0, 0.5]
     * @precision 0.01
     * @enabledif {enableMove}
     */
    movementThreshold = 0.1;

    /**
     * Thumbstick threshold to trigger snap turning.
     * @attribute
     * @range [0.1, 1]
     * @precision 0.01
     * @enabledif {enableMove}
     */
    rotateThreshold = 0.5;

    /**
     * Thumbstick threshold to reset snap turn state.
     * @attribute
     * @range [0.05, 0.5]
     * @precision 0.01
     * @enabledif {enableMove}
     */
    rotateResetThreshold = 0.25;

    /**
     * Maximum distance for teleportation in meters.
     * @attribute
     * @range [1, 50]
     * @enabledif {enableTeleport}
     */
    maxTeleportDistance = 10;

    /**
     * Radius of the teleport target indicator circle.
     * @attribute
     * @range [0.1, 2]
     * @precision 0.1
     * @enabledif {enableTeleport}
     */
    teleportIndicatorRadius = 0.2;

    /**
     * Number of segments for the teleport indicator circle.
     * @attribute
     * @range [8, 64]
     * @enabledif {enableTeleport}
     */
    teleportIndicatorSegments = 16;

    /**
     * Color for valid teleportation areas.
     * @attribute
     * @enabledif {enableTeleport}
     */
    validTeleportColor = new Color(0, 1, 0);

    /**
     * Color for invalid teleportation areas.
     * @attribute
     * @enabledif {enableTeleport}
     */
    invalidTeleportColor = new Color(1, 0, 0);

    /**
     * Color for controller rays.
     * @attribute
     * @enabledif {enableMove}
     */
    controllerRayColor = new Color(1, 1, 1);

    /** @type {Set<XrInputSource>} */
    inputSources = new Set();

    /** @type {Map<XrInputSource, boolean>} */
    activePointers = new Map();

    /** @type {Map<XrInputSource, { handleSelectStart: Function, handleSelectEnd: Function }>} */
    inputHandlers = new Map();

    // Rotation state for snap turning
    lastRotateValue = 0;

    // Pre-allocated objects for performance (object pooling)
    tmpVec2A = new Vec2();

    tmpVec2B = new Vec2();

    tmpVec3A = new Vec3();

    tmpVec3B = new Vec3();

    // Color objects
    validColor = new Color();

    invalidColor = new Color();

    rayColor = new Color();

    // Camera reference for movement calculations
    /** @type {import('playcanvas').Entity | null} */
    cameraEntity = null;

    initialize() {
        if (!this.app.xr) {
            console.error('XrNavigation script requires XR to be enabled on the application');
            return;
        }

        // Log enabled navigation methods
        const methods = [];
        if (this.enableTeleport) methods.push('teleportation');
        if (this.enableMove) methods.push('smooth movement');
        console.log(`XrNavigation: Enabled methods - ${methods.join(', ')}`);

        if (!this.enableTeleport && !this.enableMove) {
            console.warn('XrNavigation: Both teleportation and movement are disabled. Navigation will not work.');
        }

        // Initialize color objects from Color attributes
        this.validColor.copy(this.validTeleportColor);
        this.invalidColor.copy(this.invalidTeleportColor);
        this.rayColor.copy(this.controllerRayColor);

        // Find camera entity - should be a child of this entity
        const cameraComponent = this.entity.findComponent('camera');
        this.cameraEntity = cameraComponent ? cameraComponent.entity : null;

        if (!this.cameraEntity) {
            console.warn('XrNavigation: Camera entity not found. Looking for camera in children...');

            // First try to find by name - cast to Entity since we know it should be one
            const foundByName = this.entity.findByName('camera');
            this.cameraEntity = /** @type {import('playcanvas').Entity | null} */ (foundByName);

            // If not found, search children for entity with camera component
            if (!this.cameraEntity) {
                for (const child of this.entity.children) {
                    const childEntity = /** @type {import('playcanvas').Entity} */ (child);
                    if (childEntity.camera) {
                        this.cameraEntity = childEntity;
                        break;
                    }
                }
            }

            if (!this.cameraEntity) {
                console.error('XrNavigation: No camera entity found. Movement calculations may not work correctly.');
            }
        }

        this.app.xr.input.on('add', (inputSource) => {
            const handleSelectStart = () => {
                this.activePointers.set(inputSource, true);
            };

            const handleSelectEnd = () => {
                this.activePointers.set(inputSource, false);
                this.tryTeleport(inputSource);
            };

            // Attach the handlers
            inputSource.on('selectstart', handleSelectStart);
            inputSource.on('selectend', handleSelectEnd);

            // Store the handlers in the map
            this.inputHandlers.set(inputSource, { handleSelectStart, handleSelectEnd });
            this.inputSources.add(inputSource);
        });

        this.app.xr.input.on('remove', (inputSource) => {
            const handlers = this.inputHandlers.get(inputSource);
            if (handlers) {
                inputSource.off('selectstart', handlers.handleSelectStart);
                inputSource.off('selectend', handlers.handleSelectEnd);
                this.inputHandlers.delete(inputSource);
            }
            this.activePointers.delete(inputSource);
            this.inputSources.delete(inputSource);
        });
    }

    findPlaneIntersection(origin, direction) {
        // Find intersection with y=0 plane
        if (Math.abs(direction.y) < 0.00001) return null;  // Ray is parallel to plane

        const t = -origin.y / direction.y;
        if (t < 0) return null;  // Intersection is behind the ray

        return new Vec3(
            origin.x + direction.x * t,
            0,
            origin.z + direction.z * t
        );
    }

    tryTeleport(inputSource) {
        const origin = inputSource.getOrigin();
        const direction = inputSource.getDirection();

        const hitPoint = this.findPlaneIntersection(origin, direction);
        if (hitPoint) {
            const cameraY = this.entity.getPosition().y;
            hitPoint.y = cameraY;
            this.entity.setPosition(hitPoint);
        }
    }

    update(dt) {
        // Handle smooth locomotion and snap turning
        if (this.enableMove) {
            this.handleSmoothLocomotion(dt);
        }

        // Handle teleportation
        if (this.enableTeleport) {
            this.handleTeleportation();
        }

        // Always show controller rays for debugging/visualization
        this.renderControllerRays();
    }

    handleSmoothLocomotion(dt) {
        if (!this.cameraEntity) return;

        for (const inputSource of this.inputSources) {
            // Only process controllers with gamepads
            if (!inputSource.gamepad) continue;

            // Left controller - movement
            if (inputSource.handedness === 'left') {
                // Get thumbstick input (axes[2] = X, axes[3] = Y)
                this.tmpVec2A.set(inputSource.gamepad.axes[2], inputSource.gamepad.axes[3]);

                // Check if input exceeds deadzone
                if (this.tmpVec2A.length() > this.movementThreshold) {
                    this.tmpVec2A.normalize();

                    // Calculate camera-relative movement direction
                    const forward = this.cameraEntity.forward;
                    this.tmpVec2B.x = forward.x;
                    this.tmpVec2B.y = forward.z;
                    this.tmpVec2B.normalize();

                    // Calculate rotation angle based on camera yaw
                    const rad = Math.atan2(this.tmpVec2B.x, this.tmpVec2B.y) - Math.PI / 2;

                    // Apply rotation to movement vector
                    const t = this.tmpVec2A.x * Math.sin(rad) - this.tmpVec2A.y * Math.cos(rad);
                    this.tmpVec2A.y = this.tmpVec2A.y * Math.sin(rad) + this.tmpVec2A.x * Math.cos(rad);
                    this.tmpVec2A.x = t;

                    // Scale by movement speed and delta time
                    this.tmpVec2A.mulScalar(this.movementSpeed * dt);

                    // Apply movement to camera parent (this entity)
                    this.entity.translate(this.tmpVec2A.x, 0, this.tmpVec2A.y);
                }
            } else if (inputSource.handedness === 'right') { // Right controller - snap turning
                this.handleSnapTurning(inputSource);
            }
        }
    }

    handleSnapTurning(inputSource) {
        // Get rotation input from right thumbstick X-axis
        const rotate = -inputSource.gamepad.axes[2];

        // Hysteresis system to prevent multiple rotations from single gesture
        if (this.lastRotateValue > 0 && rotate < this.rotateResetThreshold) {
            this.lastRotateValue = 0;
        } else if (this.lastRotateValue < 0 && rotate > -this.rotateResetThreshold) {
            this.lastRotateValue = 0;
        }

        // Only rotate when thumbstick crosses threshold from neutral position
        if (this.lastRotateValue === 0 && Math.abs(rotate) > this.rotateThreshold) {
            this.lastRotateValue = Math.sign(rotate);

            if (this.cameraEntity) {
                // Rotate around camera position, not entity origin
                this.tmpVec3A.copy(this.cameraEntity.getLocalPosition());
                this.entity.translateLocal(this.tmpVec3A);
                this.entity.rotateLocal(0, Math.sign(rotate) * this.rotateSpeed, 0);
                this.entity.translateLocal(this.tmpVec3A.mulScalar(-1));
            }
        }
    }

    handleTeleportation() {
        for (const inputSource of this.inputSources) {
            // Only show teleportation ray when trigger/select is pressed
            if (!this.activePointers.get(inputSource)) continue;

            const start = inputSource.getOrigin();
            const direction = inputSource.getDirection();

            const hitPoint = this.findPlaneIntersection(start, direction);

            if (hitPoint && this.isValidTeleportDistance(hitPoint)) {
                // Draw line to intersection point
                this.app.drawLine(start, hitPoint, this.validColor);
                this.drawTeleportIndicator(hitPoint);
            } else {
                // Draw full length ray if no intersection or invalid distance
                this.tmpVec3B.copy(direction).mulScalar(this.maxTeleportDistance).add(start);
                this.app.drawLine(start, this.tmpVec3B, this.invalidColor);
            }
        }
    }

    renderControllerRays() {
        // Only render controller rays when smooth movement is enabled
        // (teleport rays are handled separately in handleTeleportation)
        if (!this.enableMove) return;

        for (const inputSource of this.inputSources) {
            // Skip if currently teleporting (handled by handleTeleportation)
            if (this.activePointers.get(inputSource)) continue;

            const start = inputSource.getOrigin();
            this.tmpVec3B.copy(inputSource.getDirection()).mulScalar(2).add(start);
            this.app.drawLine(start, this.tmpVec3B, this.rayColor);
        }
    }

    isValidTeleportDistance(hitPoint) {
        const distance = hitPoint.distance(this.entity.getPosition());
        return distance <= this.maxTeleportDistance;
    }

    drawTeleportIndicator(point) {
        // Draw a circle at the teleport point using configurable attributes
        const segments = this.teleportIndicatorSegments;
        const radius = this.teleportIndicatorRadius;

        for (let i = 0; i < segments; i++) {
            const angle1 = (i / segments) * Math.PI * 2;
            const angle2 = ((i + 1) / segments) * Math.PI * 2;

            const x1 = point.x + Math.cos(angle1) * radius;
            const z1 = point.z + Math.sin(angle1) * radius;
            const x2 = point.x + Math.cos(angle2) * radius;
            const z2 = point.z + Math.sin(angle2) * radius;

            // Use pre-allocated vectors to avoid garbage collection
            this.tmpVec3A.set(x1, 0.01, z1);  // Slightly above ground to avoid z-fighting
            this.tmpVec3B.set(x2, 0.01, z2);

            this.app.drawLine(this.tmpVec3A, this.tmpVec3B, this.validColor);
        }
    }
}

// On entering/exiting AR, we need to set the camera clear color to transparent black
const initXr = (global) => {
    const { app, events, state, camera } = global;
    state.hasAR = app.xr.isAvailable('immersive-ar');
    state.hasVR = app.xr.isAvailable('immersive-vr');
    // initialize ar/vr
    app.xr.on('available:immersive-ar', (available) => {
        state.hasAR = available;
    });
    app.xr.on('available:immersive-vr', (available) => {
        state.hasVR = available;
    });
    const parent = camera.parent;
    const clearColor = new Color();
    const parentPosition = new Vec3();
    const parentRotation = new Quat();
    const cameraPosition = new Vec3();
    const cameraRotation = new Quat();
    const angles = new Vec3();
    parent.addComponent('script');
    parent.script.create(XrControllers);
    parent.script.create(XrNavigation);
    app.xr.on('start', () => {
        app.autoRender = true;
        // cache original camera rig positions and rotations
        parentPosition.copy(parent.getPosition());
        parentRotation.copy(parent.getRotation());
        cameraPosition.copy(camera.getPosition());
        cameraRotation.copy(camera.getRotation());
        cameraRotation.getEulerAngles(angles);
        // copy transform to parent to XR/VR mode starts in the right place
        parent.setPosition(cameraPosition.x, 0, cameraPosition.z);
        parent.setEulerAngles(0, angles.y, 0);
        if (app.xr.type === 'immersive-ar') {
            clearColor.copy(camera.camera.clearColor);
            camera.camera.clearColor = new Color(0, 0, 0, 0);
        }
    });
    app.xr.on('end', () => {
        app.autoRender = false;
        // restore camera to pre-XR state
        parent.setPosition(parentPosition);
        parent.setRotation(parentRotation);
        camera.setPosition(cameraPosition);
        camera.setRotation(cameraRotation);
        if (app.xr.type === 'immersive-ar') {
            camera.camera.clearColor = clearColor;
        }
    });
    events.on('startAR', () => {
        app.xr.start(app.root.findComponent('camera'), 'immersive-ar', 'local-floor');
    });
    events.on('startVR', () => {
        app.xr.start(app.root.findComponent('camera'), 'immersive-vr', 'local-floor');
    });
    events.on('inputEvent', (event) => {
        if (event === 'cancel' && app.xr.active) {
            app.xr.end();
        }
    });
};

var version = "0.1.1";

const loadGsplat = async (app, config, progressCallback) => {
    const { contents, contentUrl, unified, aa } = config;
    const c = contents;
    const filename = new URL(contentUrl, location.href).pathname.split('/').pop();
    const data = filename.toLowerCase() === 'meta.json' ? await (await contents).json() : undefined;
    const asset = new Asset(filename, 'gsplat', { url: contentUrl, filename, contents: c }, data);
    return new Promise((resolve, reject) => {
        asset.on('load', () => {
            const entity = new Entity('gsplat');
            entity.setLocalEulerAngles(0, 0, 180);
            entity.addComponent('gsplat', {
                unified: unified || filename.toLowerCase().endsWith('lod-meta.json'),
                asset
            });
            // don't support AA in unified mode yet
            if (aa && !entity.gsplat.unified) {
                entity.gsplat.material.setDefine('GSPLAT_AA', true);
            }
            app.root.addChild(entity);
            resolve(entity);
        });
        let watermark = 0;
        asset.on('progress', (received, length) => {
            const progress = Math.min(1, received / length) * 100;
            if (progress > watermark) {
                watermark = progress;
                progressCallback(Math.trunc(watermark));
            }
        });
        asset.on('error', (err) => {
            console.log(err);
            reject(err);
        });
        app.assets.add(asset);
        app.assets.load(asset);
    });
};
const loadSkybox = (app, url) => {
    return new Promise((resolve, reject) => {
        const asset = new Asset('skybox', 'texture', {
            url
        }, {
            type: 'rgbp',
            mipmaps: false,
            addressu: 'repeat',
            addressv: 'clamp'
        });
        asset.on('load', () => {
            resolve(asset);
        });
        asset.on('error', (err) => {
            console.log(err);
            reject(err);
        });
        app.assets.add(asset);
        app.assets.load(asset);
    });
};
const main = (app, camera, settingsJson, config) => {
    const events = new EventHandler();
    const state = observe(events, {
        readyToRender: false,
        hqMode: true,
        progress: 0,
        inputMode: 'desktop',
        cameraMode: 'orbit',
        hasAnimation: false,
        animationDuration: 0,
        animationTime: 0,
        animationPaused: true,
        hasAR: false,
        hasVR: false,
        isFullscreen: false,
        controlsHidden: false
    });
    const global = {
        app,
        settings: importSettings(settingsJson),
        config,
        state,
        events,
        camera
    };
    // Initialize the load-time poster only if provided
    if (config.poster) {
        initPoster(events);
    }
    camera.addComponent('camera');
    // Initialize XR support
    initXr(global);
    // Initialize user interface only if not disabled
    if (!config.noui) {
        initUI(global);
    }
    // Load model
    const gsplatLoad = loadGsplat(app, config, (progress) => {
        state.progress = progress;
    });
    // Load skybox
    const skyboxLoad = config.skyboxUrl &&
        loadSkybox(app, config.skyboxUrl).then((asset) => {
            app.scene.envAtlas = asset.resource;
        });
    // Load and play sound
    if (global.settings.soundUrl) {
        const sound = new Audio(global.settings.soundUrl);
        sound.crossOrigin = 'anonymous';
        document.body.addEventListener('click', () => {
            if (sound) {
                sound.play();
            }
        }, {
            capture: true,
            once: true
        });
    }
    // Create the viewer
    return new Viewer(global, gsplatLoad, skyboxLoad);
};
console.log(`SuperSplat Viewer v${version} | Engine v${version$1} (${revision})`);

export { main };
//# sourceMappingURL=index.js.map
