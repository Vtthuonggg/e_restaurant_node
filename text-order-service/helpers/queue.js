import dotenv from "dotenv";
dotenv.config();

export const redisConnection = {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_QUEUE_DB) || 0,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
};