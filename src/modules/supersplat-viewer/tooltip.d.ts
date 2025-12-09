type Direction = 'left' | 'right' | 'top' | 'bottom';
declare class Tooltip {
    register: (target: HTMLElement, text: string, direction?: Direction) => void;
    unregister: (target: HTMLElement) => void;
    destroy: () => void;
    constructor(dom: HTMLElement);
}
export { Tooltip };
//# sourceMappingURL=tooltip.d.ts.map