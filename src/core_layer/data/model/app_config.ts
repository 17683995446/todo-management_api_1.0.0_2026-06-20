export interface AppConfig {
  app: {
    name: string;
    version: string;
    debug: boolean;
  };
  server: {
    host: string;
    port: number;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
  };
  logging: {
    level: string;
    format: string;
  };
  api: {
    timeout: number;
    rate_limit: number;
  };
}
