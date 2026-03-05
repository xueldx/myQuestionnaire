import { existsSync, readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

const configFileNameObj = {
  development: 'dev',
  docker: 'docker',
};

const env = process.env.NODE_ENV === 'docker' ? 'docker' : 'development';

const configDirCandidates = [
  join(process.cwd(), 'src/config'),
  join(process.cwd(), 'packages/questionnaire-be/src/config'),
  join(__dirname, '../config'),
];

const resolveConfigPath = (fileName: string) => {
  for (const configDir of configDirCandidates) {
    const configPath = join(configDir, fileName);
    if (existsSync(configPath)) {
      return configPath;
    }
  }

  return join(__dirname, `../config/${fileName}`);
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const deepMerge = <T>(baseValue: T, overrideValue: unknown): T => {
  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return (overrideValue ?? baseValue) as T;
  }

  const merged: Record<string, any> = { ...baseValue };
  Object.entries(overrideValue).forEach(([key, value]) => {
    const currentValue = merged[key];
    merged[key] =
      isPlainObject(currentValue) && isPlainObject(value)
        ? deepMerge(currentValue, value)
        : value;
  });

  return merged as T;
};

const loadYamlConfig = (filePath: string) =>
  load(readFileSync(filePath, 'utf8')) as Record<string, any>;

const pickExistingConfigPath = (...fileNames: string[]) => {
  for (const fileName of fileNames) {
    const configPath = resolveConfigPath(fileName);
    if (existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
};

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const getStringEnv = (name: string) => {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const encodeCredential = (value: string) => encodeURIComponent(value);

const buildMongoUri = (fallbackUri: string) => {
  const explicitUri = getStringEnv('MONGO_URI');
  if (explicitUri) return explicitUri;

  const host = getStringEnv('MONGO_HOST');
  if (!host) return fallbackUri;

  const port = parseNumber(process.env.MONGO_PORT, 27017);
  const dbName = getStringEnv('MONGO_DB_NAME') || 'questionnaire_mongo_db';
  const username = getStringEnv('MONGO_USERNAME');
  const password = getStringEnv('MONGO_PASSWORD');
  const authSource =
    getStringEnv('MONGO_AUTH_SOURCE') || (username ? 'admin' : '');
  const credentials = username
    ? `${encodeCredential(username)}${password ? `:${encodeCredential(password)}` : ''}@`
    : '';
  const authQuery = authSource
    ? `?authSource=${encodeCredential(authSource)}`
    : '';

  return `mongodb://${credentials}${host}:${port}/${dbName}${authQuery}`;
};

const buildRedisUri = (fallbackUri: string) => {
  const explicitUri = getStringEnv('REDIS_URI');
  if (explicitUri) return explicitUri;

  const host = getStringEnv('REDIS_HOST');
  if (!host) return fallbackUri;

  const port = parseNumber(process.env.REDIS_PORT, 6379);
  return `redis://${host}:${port}`;
};

const applyEnvironmentOverrides = (baseConfig: Record<string, any>) => {
  const config = deepMerge(baseConfig, {});

  config.app = config.app || {};
  config.app.domain = getStringEnv('APP_DOMAIN') || config.app.domain;
  config.app.port = parseNumber(process.env.APP_PORT, config.app.port || 8879);
  config.app.prefix = getStringEnv('APP_PREFIX') || config.app.prefix;
  config.app.ai = config.app.ai || {};
  config.app.ai.copilotContextStrategyDefault =
    getStringEnv('COPILOT_CONTEXT_STRATEGY_DEFAULT') ||
    config.app.ai.copilotContextStrategyDefault ||
    'baseline_v1';
  config.app.jwt = config.app.jwt || {};
  config.app.jwt.secret = getStringEnv('JWT_SECRET') || config.app.jwt.secret;
  config.app.jwt.expiresIn =
    getStringEnv('JWT_EXPIRES_IN') || config.app.jwt.expiresIn;

  config.db = config.db || {};
  config.db.mysql = config.db.mysql || {};
  config.db.mysql.host = getStringEnv('MYSQL_HOST') || config.db.mysql.host;
  config.db.mysql.port = parseNumber(
    process.env.MYSQL_PORT,
    config.db.mysql.port || 3306,
  );
  config.db.mysql.username =
    getStringEnv('MYSQL_USERNAME') || config.db.mysql.username;
  config.db.mysql.password =
    getStringEnv('MYSQL_PASSWORD') || config.db.mysql.password;
  config.db.mysql.database =
    getStringEnv('MYSQL_DATABASE') || config.db.mysql.database;
  config.db.mysql.synchronize = parseBoolean(
    process.env.MYSQL_SYNCHRONIZE,
    config.db.mysql.synchronize,
  );

  config.db.mongo = config.db.mongo || {};
  config.db.mongo.uri = buildMongoUri(config.db.mongo.uri);

  config.db.redis = config.db.redis || {};
  config.db.redis.uri = buildRedisUri(config.db.redis.uri);

  config.mailer = config.mailer || {};
  config.mailer.user = getStringEnv('MAILER_USER') || config.mailer.user;
  config.mailer.pass = getStringEnv('MAILER_PASS') || config.mailer.pass;
  config.mailer.host = getStringEnv('MAILER_HOST') || config.mailer.host;
  config.mailer.port = parseNumber(
    process.env.MAILER_PORT,
    config.mailer.port || 465,
  );

  config.client = config.client || {};
  config.client.internalApiSecret =
    getStringEnv('INTERNAL_API_SECRET') ||
    getStringEnv('CLIENT_INTERNAL_API_SECRET') ||
    config.client.internalApiSecret;

  config.openai = config.openai || {};
  const modelEnvMap: Record<
    string,
    { model: string; apiKey: string; baseURL: string }
  > = {
    'modelscope-qwen3-235b': {
      model: 'MODELSCOPE_QWEN3_MODEL',
      apiKey: 'MODELSCOPE_QWEN3_API_KEY',
      baseURL: 'MODELSCOPE_QWEN3_BASE_URL',
    },
    'modelscope-qwen3-plus': {
      model: 'MODELSCOPE_QWEN3_PLUS_MODEL',
      apiKey: 'MODELSCOPE_QWEN3_PLUS_API_KEY',
      baseURL: 'MODELSCOPE_QWEN3_PLUS_BASE_URL',
    },
    'minimax-m2.5': {
      model: 'MINIMAX_M2_5_MODEL',
      apiKey: 'MINIMAX_M2_5_API_KEY',
      baseURL: 'MINIMAX_M2_5_BASE_URL',
    },
    'modelscope-glm-5': {
      model: 'MODELSCOPE_GLM5_MODEL',
      apiKey: 'MODELSCOPE_GLM5_API_KEY',
      baseURL: 'MODELSCOPE_GLM5_BASE_URL',
    },
    'modelscope-kimi-k2.5': {
      model: 'MODELSCOPE_KIMIK2_MODEL',
      apiKey: 'MODELSCOPE_KIMIK2_API_KEY',
      baseURL: 'MODELSCOPE_KIMIK2_BASE_URL',
    },
  };

  Object.entries(modelEnvMap).forEach(([key, envNames]) => {
    config.openai[key] = config.openai[key] || {};
    config.openai[key].model =
      getStringEnv(envNames.model) || config.openai[key].model;
    config.openai[key].apiKey =
      getStringEnv(envNames.apiKey) || config.openai[key].apiKey;
    config.openai[key].baseURL =
      getStringEnv(envNames.baseURL) || config.openai[key].baseURL;
  });

  return config;
};

const collectPlaceholderWarnings = (currentConfig: Record<string, any>) => {
  const watchedEntries = [
    ['app.jwt.secret', currentConfig?.app?.jwt?.secret],
    ['db.mysql.password', currentConfig?.db?.mysql?.password],
    ['db.mongo.uri', currentConfig?.db?.mongo?.uri],
    ['mailer.user', currentConfig?.mailer?.user],
    ['mailer.pass', currentConfig?.mailer?.pass],
    ['client.internalApiSecret', currentConfig?.client?.internalApiSecret],
    [
      'openai.modelscope-qwen3-235b.apiKey',
      currentConfig?.openai?.['modelscope-qwen3-235b']?.apiKey,
    ],
    [
      'openai.modelscope-qwen3-plus.apiKey',
      currentConfig?.openai?.['modelscope-qwen3-plus']?.apiKey,
    ],
    [
      'openai.minimax-m2.5.apiKey',
      currentConfig?.openai?.['minimax-m2.5']?.apiKey,
    ],
    [
      'openai.modelscope-glm-5.apiKey',
      currentConfig?.openai?.['modelscope-glm-5']?.apiKey,
    ],
    [
      'openai.modelscope-kimi-k2.5.apiKey',
      currentConfig?.openai?.['modelscope-kimi-k2.5']?.apiKey,
    ],
  ];

  const placeholderMarkers = [
    'change_me',
    'your_',
    'example.com',
    'your_model_id_here',
  ];

  return watchedEntries
    .filter(([, value]) => typeof value === 'string')
    .filter(([, value]) =>
      placeholderMarkers.some((marker) => value.includes(marker)),
    )
    .map(([key]) => key);
};

const configBaseName = configFileNameObj[env];
const sharedConfigPath = pickExistingConfigPath(
  `${configBaseName}.yml`,
  `${configBaseName}.example.yml`,
);
const localConfigPath = pickExistingConfigPath(`${configBaseName}.local.yml`);

if (!sharedConfigPath && !localConfigPath) {
  throw new Error(
    `未找到 ${configBaseName} 配置文件，请至少提供 ${configBaseName}.example.yml`,
  );
}

const sharedConfig = sharedConfigPath ? loadYamlConfig(sharedConfigPath) : {};
const localConfig = localConfigPath ? loadYamlConfig(localConfigPath) : null;
const mergedConfig = localConfig
  ? deepMerge(sharedConfig, localConfig)
  : sharedConfig;
const config = applyEnvironmentOverrides(mergedConfig);

const loadedConfigFiles = [sharedConfigPath, localConfigPath]
  .filter(Boolean)
  .join(', ');
console.log(`[config] loaded ${loadedConfigFiles}`);

const placeholderWarnings = collectPlaceholderWarnings(config);
if (placeholderWarnings.length > 0) {
  console.warn(
    `[config] 检测到占位配置，请尽快补全: ${placeholderWarnings.join(', ')}`,
  );
}

export default () => {
  return config;
};
