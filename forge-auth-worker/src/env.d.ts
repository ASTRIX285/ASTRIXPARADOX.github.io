interface Env {
  ENVIRONMENT: string;
  APP_ORIGINS: string;
  OAUTH_REDIRECT_URI: string;
  DEFAULT_RETURN_URL: string;
  AUTH_RECORDS: DurableObjectNamespace;
  MANIFEST_DATA?: Fetcher;
  BUNGIE_API_KEY: string;
  BUNGIE_CLIENT_ID: string;
  BUNGIE_CLIENT_SECRET: string;
}
