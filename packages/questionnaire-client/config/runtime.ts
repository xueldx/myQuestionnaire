const getEnv = (name: string, fallback = "") => {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const parseNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const encodeCredential = (value: string) => encodeURIComponent(value);

export const getMongoUri = () => {
  const explicitUri = getEnv("MONGO_URI");
  if (explicitUri) return explicitUri;

  const host = getEnv("MONGO_HOST", "localhost");
  const port = parseNumber(getEnv("MONGO_PORT", "27017"), 27017);
  const dbName = getMongoDbName();
  const username = getEnv("MONGO_USERNAME");
  const password = getEnv("MONGO_PASSWORD");
  const authSource = getEnv("MONGO_AUTH_SOURCE") || (username ? "admin" : "");
  const credentials = username
    ? `${encodeCredential(username)}${password ? `:${encodeCredential(password)}` : ""}@`
    : "";
  const authQuery = authSource ? `?authSource=${encodeCredential(authSource)}` : "";

  return `mongodb://${credentials}${host}:${port}/${dbName}${authQuery}`;
};

export const getMongoDbName = () => getEnv("MONGO_DB_NAME", "questionnaire_mongo_db");

export const getBackendApiBaseUrl = () =>
  getEnv("BACKEND_API_BASE_URL", "http://localhost:8879/api").replace(/\/$/, "");

export const getInternalApiSecret = () => getEnv("INTERNAL_API_SECRET");
