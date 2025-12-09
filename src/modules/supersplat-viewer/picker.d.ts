import { type AppBase, type Entity, Picker as Picker_, Vec3 } from 'playcanvas';
declare class Picker {
    app: AppBase;
    camera: Entity;
    picker: Picker_;
    constructor(app: AppBase, camera: Entity);
    pick(x: number, y: number): Promise<Vec3>;
}
export { Picker };
//# sourceMappingURL=picker.d.ts.map