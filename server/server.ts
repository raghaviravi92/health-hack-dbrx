import {
  createApp,
  analytics,
  genie,
  lakebase,
  server,
} from "@databricks/appkit";
import { setupReadinessRoutes } from "./routes/readiness-routes";

const lakebasePoolConfig = process.env.PGPASSWORD
  ? { pool: { password: process.env.PGPASSWORD } }
  : {};

const memoryCacheStorage = {
  async get() {
    return null;
  },
  async set() {
    return;
  },
  async delete() {
    return;
  },
  async clear() {
    return;
  },
  async has() {
    return false;
  },
  async size() {
    return 0;
  },
  isPersistent() {
    return false;
  },
  async healthCheck() {
    return true;
  },
  async close() {
    return;
  },
};

createApp({
  cache: { enabled: false, storage: memoryCacheStorage },
  plugins: [analytics(), genie(), lakebase(lakebasePoolConfig), server()],
  async onPluginsReady(appkit) {
    await setupReadinessRoutes(appkit);
  },
}).catch(console.error);
