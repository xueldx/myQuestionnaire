import { existsSync, readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

const configFileNameObj = {
  development: 'dev',
  docker: 'docker',
};

const env = process.env.NODE_ENV === 'docker' ? 'docker' : 'development';

// 兼容 nest watch 在不同运行目录/编译目录下的配置文件定位
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

const defaultConfigPath = resolveConfigPath(`${configFileNameObj[env]}.yml`);

// 开发环境优先读取本地调试配置，避免影响团队共享配置
const localDevConfigPath = resolveConfigPath('dev.local.yml');
const runtimeConfigPath =
  env === 'development' && existsSync(localDevConfigPath)
    ? localDevConfigPath
    : defaultConfigPath;

const config = load(readFileSync(runtimeConfigPath));

// 濡傛灉鏄痙ocker鐜锛屽垯浣跨敤docker瀹瑰櫒浼犻€掔殑鐜鍙橀噺閰嶇疆
if (env === configFileNameObj.docker) {
  config.db.mysql.host = process.env.MYSQL_HOST;
  config.db.redis.uri = `redis://${process.env.REDIS_HOST}:6379`;
  config.db.mongo.uri = `mongodb://admin:12345678@${process.env.MONGO_HOST}:27017/questionnaire_mongo_db?authSource=admin`;
}

export default () => {
  return config;
};
