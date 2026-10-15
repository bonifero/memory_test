export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? "./data/results.db",
  adminUser: process.env.ADMIN_USER ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin"
};
