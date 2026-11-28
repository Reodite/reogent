import mongoose from "mongoose";
import { MAX_TIMER_MS, positiveIntegerEnv } from "./resource-limits";

let connection: Promise<typeof mongoose> | undefined;

/** Connects once to the configured MongoDB deployment. */
export function connectDatabase(): Promise<typeof mongoose> {
  if (!connection) {
    const useExternalMongo = process.env.USE_EXTERNAL_MONGODB === "true";
    const uri = useExternalMongo
      ? process.env.MONGODB_URI
      : `mongodb://localhost:${process.env.MONGODB_PORT ?? "27017"}/reodite?replicaSet=rs0&directConnection=true`;
    if (!uri) throw new Error("MONGODB_URI env var is required when USE_EXTERNAL_MONGODB=true");
    connection = mongoose.connect(uri, {
      maxPoolSize: positiveIntegerEnv("MONGODB_MAX_POOL_SIZE", 10),
      serverSelectionTimeoutMS: positiveIntegerEnv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", 10_000, MAX_TIMER_MS),
    });
    connection.catch(() => {
      connection = undefined;
    });
  }
  return connection;
}

export async function closeDatabase(): Promise<void> {
  if (!connection) return;
  await mongoose.disconnect();
  connection = undefined;
}
