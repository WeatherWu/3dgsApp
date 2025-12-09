declare class CubicSpline {
    times: number[];
    knots: number[];
    dim: number;
    constructor(times: number[], knots: number[]);
    evaluate(time: number, result: number[]): void;
    getKnot(index: number, result: number[]): void;
    evaluateSegment(segment: number, t: number, result: number[]): void;
    static calcKnots(times: number[], points: number[], smoothness: number): number[];
    static fromPoints(times: number[], points: number[], smoothness?: number): CubicSpline;
    static fromPointsLooping(length: number, times: number[], points: number[], smoothness?: number): CubicSpline;
}
export { CubicSpline };
//# sourceMappingURL=spline.d.ts.map