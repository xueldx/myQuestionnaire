# 配置初始化说明

## 目标

仓库内只保留安全模板，不提交任何真实密钥、账号、密码或个人本地配置。

## 需要复制的模板

```bash
cp .env.example .env
cp packages/questionnaire-fe/.env.example packages/questionnaire-fe/.env.local
cp packages/questionnaire-client/.env.example packages/questionnaire-client/.env.local
cp packages/questionnaire-be/src/config/dev.example.yml packages/questionnaire-be/src/config/dev.local.yml
```

## 文件职责

- `.env.example`：根目录共享模板，给 Docker Compose、镜像推送脚本、容器部署使用
- `.env`：你的本地真实配置，不提交
- `packages/questionnaire-fe/.env.example`：管理端模板
- `packages/questionnaire-fe/.env.local`：管理端本地配置，不提交
- `packages/questionnaire-client/.env.example`：填写端模板
- `packages/questionnaire-client/.env.local`：填写端本地配置，不提交
- `packages/questionnaire-be/src/config/dev.example.yml`：后端开发模板
- `packages/questionnaire-be/src/config/dev.local.yml`：后端开发真实配置，不提交
- `packages/questionnaire-be/src/config/docker.example.yml`：后端容器模板

## 必填字段

### 根目录 `.env`

- `MYSQL_PASSWORD`
- `MONGO_PASSWORD`
- `JWT_SECRET`
- `INTERNAL_API_SECRET`
- `MAILER_USER`
- `MAILER_PASS`
- `MODELSCOPE_*_API_KEY`

如果你需要推送镜像到阿里云，还需要：

- `ALIYUN_USERNAME`
- `ALIYUN_PASSWORD`
- `ALIYUN_REGISTRY_URL`

### 后端 `dev.local.yml`

- `app.jwt.secret`
- `db.mysql.password`
- `db.mongo.uri`
- `mailer.user`
- `mailer.pass`
- `openai.*.apiKey`
- `client.internalApiSecret`

### 填写端 `packages/questionnaire-client/.env.local`

- `BACKEND_API_BASE_URL`
- `INTERNAL_API_SECRET`
- `MONGO_*`

## AI Key 配置建议

项目当前把 AI 配置集中放在后端。推荐优先在以下位置配置：

1. `packages/questionnaire-be/src/config/dev.local.yml`
2. 容器 / CI 环境变量
3. 根目录 `.env` 供 Docker Compose 注入

如果你使用魔搭社区 API Inference，可参考官方文档：
[API推理介绍 · 文档中心](https://www.modelscope.cn/docs/model-service/API-Inference/intro)

## 说明

- 后端配置加载优先读取 `*.local.yml`，不存在时回退到仓库里的 `*.example.yml`
- Docker Compose 与部署 compose 现在统一改为环境变量替换
- 填写端不再把内部 secret 暴露给浏览器，而是由 Next API 在服务端调用后端内部接口
