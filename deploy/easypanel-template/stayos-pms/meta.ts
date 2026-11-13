/**
 * Tipo Input (espelho do schema em meta.yaml).
 * No repositório easypanel-io/templates, este ficheiro é gerado por `npm run build-templates`.
 */
export type Input = {
  githubOwner: string;
  githubRepo: string;
  githubRef: string;
  useInternalPostgres: boolean;
  externalDatabaseUrl: string;
  prismaMigrateOnStart: boolean;
  exposeApiDomain: boolean;
  frontendServiceName: string;
  backendServiceName: string;
  workerServiceName: string;
  databaseServiceName: string;
  redisServiceName: string;
  postgresImage: string;
};
