/** All positions and lengths are world-space metres unless explicitly documented. */
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
/** Unit quaternion. Right-handed coordinates: +Y up, camera forward -Z. */
export interface Quaternion { readonly x: number; readonly y: number; readonly z: number; readonly w: number }
export interface Pose { readonly position: Vec3; readonly rotation: Quaternion }
export interface Bounds3 { readonly min: Vec3; readonly max: Vec3 }
/** Radians. Positive yaw turns left about +Y; positive pitch looks up. */
export interface ViewRotation { readonly yaw: number; readonly pitch: number }
export interface SpawnPose { readonly position: Vec3; readonly yaw: number }
export type ObjectId = string;
export type Unsubscribe = () => void;
