import { getAccessToken, invalidateToken } from './auth';
import { createHttp } from './http';
import { createSheetsApi } from './sheets';

export const http = createHttp({ fetch: (...a) => fetch(...a), getToken: getAccessToken, onUnauthorized: invalidateToken });
export const sheets = createSheetsApi(http);
