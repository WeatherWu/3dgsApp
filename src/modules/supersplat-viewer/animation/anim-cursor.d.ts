declare class AnimCursor {
    duration: number;
    loopMode: 'none' | 'repeat' | 'pingpong';
    timer: number;
    cursor: number;
    constructor(duration: number, loopMode: 'none' | 'repeat' | 'pingpong');
    update(deltaTime: number): void;
    reset(duration: number, loopMode: 'none' | 'repeat' | 'pingpong'): void;
    set value(value: number);
    get value(): number;
}
export { AnimCursor };
//# sourceMappingURL=anim-cursor.d.ts.map