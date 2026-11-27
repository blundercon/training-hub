/** Build-time configuration. None of these values are secrets: they ship in the page. */
export const config = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY as string | undefined,
  appId: import.meta.env.VITE_GOOGLE_APP_ID as string | undefined,
  /** The only OAuth scope the app ever asks for. */
  scope: 'https://www.googleapis.com/auth/drive.file',
  version: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev',
};

/** Where Google sends the user back after a full-page sign-in. Must be listed in the OAuth client. */
export function redirectUri(): string {
  return location.origin + import.meta.env.BASE_URL;
}
