import type {
    EditorAirport,
    EditorAuthoredObject,
    EditorDistrict,
    EditorEntity,
    EditorGroupId,
    EditorRoad,
    EditorTerrainEdit,
    EditorTerrainRegion
} from '../../editor/core/types.js';

export function isAirport(obj: unknown): obj is EditorAirport;
export function isRoad(obj: unknown): obj is EditorRoad;
export function isDistrict(obj: unknown): obj is EditorDistrict;
export function isTerrainEdit(obj: unknown): obj is EditorTerrainEdit;
export function isTerrainRegion(obj: unknown): obj is EditorTerrainRegion;
export function isAuthoredObject(obj: unknown): obj is EditorAuthoredObject;
export function getLayerGroupId(obj: unknown): EditorGroupId;
export function objectLabel(obj: EditorEntity | unknown, index?: number, fallback?: string): string;
