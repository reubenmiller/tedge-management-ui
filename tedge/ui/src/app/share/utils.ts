import { MeasurementType } from './property.model';

export const TTL_INDEX_NAME = 'datetime_ttl';
export const C8Y_CLOUD_ENDPOINT = 'c8yCloud';
export const INVENTORY_ENDPOINT = '/inventory/managedObjects';
export const LOGIN_ENDPOINT = '/tenant/currentTenant';
export const INVENTORY_BRIDGED_ENDPOINT = '/api/bridgedInventory';

// needs files access to tedge
export const TEDGE_CONFIGURATION_ENDPOINT = '/api/tedge/configuration';
export const TEDGE_GENERIC_REQUEST_ENDPOINT = '/api/tedge/cmd';
export const TEDGE_GENERIC_TYPES_ENDPOINT = '/api/tedge/type';
export const TEDGE_SERVICE_ENDPOINT = '/api/tedge/services';

// doesn't needs files access to tedge, separate configuration file

// served from MONGO
export const BACKEND_CONFIGURATION_ENDPOINT = '/api/backend/configuration';
export const BACKEND_MEASUREMENT_ENDPOINT = '/api/backend/analytics/measurement';
export const BACKEND_MEASUREMENT_TYPES_ENDPOINT = '/api/backend/analytics/types';
export const BACKEND_STORAGE_STATISTIC_ENDPOINT = '/api/backend/storage/statistic';
export const BACKEND_STORAGE_TTL_ENDPOINT = '/api/backend/storage/ttl';
export const BACKEND_DOWNLOAD_CERTIFICATE_ENDPOINT = '/api/backend/certificate';

export const STATUS_LOG_HISTORY = 30;

export type TedgeConfigType = 'logTypes' | 'configTypes';
export type TedgeCmdType = 'log_upload' | 'config_snapshot' | 'config_update';

export interface TedgeGenericCmdRequest {
    cmdType:TedgeCmdType,
    payload: any,
    requestID: string
}

export function isSerieSelected(
  device: string,
  type: string,
  serie: string,
  selectedMeasurements: MeasurementType[]
): boolean {
  let result = false;
  if (selectedMeasurements) {
    const mtss = selectedMeasurements.filter(
      (mt) => mt.device == device && mt.type == type
    );
    let mts;
    if (!mtss || mtss.length == 0) {
      result = false;
    } else {
      // update existing measurementType
      mts = mtss[0];
      // find relevant series
      if (!mts.series) {
        result = false;
      } else {
        const sers = mts.series.filter((_serie) => _serie.name == serie);
        if (!sers || sers.length == 0) {
          result = false;
        } else {
          result = sers[0].selected;
        }
      }
    }
  }
  return result;
}

export function uuidCustom(): string {
  const id = Math.random().toString(36).slice(-6);
  return id;
}
