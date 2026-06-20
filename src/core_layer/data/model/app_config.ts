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
  /**
   * 数据库配置（可选，当前仅使用 SQLite，此字段保留供未来扩展）
   * 实际数据库路径通过 DB_PATH 环境变量配置
   */
  database?: {
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
