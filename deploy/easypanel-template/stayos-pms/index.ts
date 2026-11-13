import {
  Output,
  randomPassword,
  randomString,
  Services,
} from "~templates-utils";
import { Input } from "./meta";

function databaseUrl(
  input: Input,
  postgresPassword: string,
): string {
  if (!input.useInternalPostgres && input.externalDatabaseUrl?.trim()) {
    return input.externalDatabaseUrl.trim();
  }
  return [
    "postgresql://postgres:",
    postgresPassword,
    "@$(PROJECT_NAME)_",
    input.databaseServiceName,
    ":5432/$(PROJECT_NAME)",
  ].join("");
}

function redisUrl(redisPassword: string, redisServiceName: string): string {
  return `redis://default:${redisPassword}@$(PROJECT_NAME)_${redisServiceName}:6379`;
}

function coreBackendEnv(
  input: Input,
  postgresPassword: string,
  redisPassword: string,
  jwtSecret: string,
  internalApiToken: string,
  socketAuthToken: string,
): string {
  return [
    "NODE_ENV=production",
    "PORT=3000",
    `DATABASE_URL=${databaseUrl(input, postgresPassword)}`,
    `PRISMA_MIGRATE_ON_START=${input.prismaMigrateOnStart ? "true" : "false"}`,
    `REDIS_URL=${redisUrl(redisPassword, input.redisServiceName)}`,
    `JWT_SECRET=${jwtSecret}`,
    "JWT_ACCESS_TTL=15m",
    "JWT_REFRESH_TTL_DAYS=7",
    `INTERNAL_API_TOKEN=${internalApiToken}`,
    `SOCKET_AUTH_TOKEN=${socketAuthToken}`,
    "PUBLIC_APP_URL=https://$(PRIMARY_DOMAIN)",
    "SITE_URL=https://$(PRIMARY_DOMAIN)",
    "SUPABASE_URL=",
    "SUPABASE_ANON_KEY=",
    "PASSWORD_RESET_DEBUG=false",
  ].join("\n");
}

export function generate(input: Input): Output {
  const services: Services = [];

  const postgresPassword = randomPassword();
  const redisPassword = randomPassword();
  const jwtSecret = randomString(48);
  const internalApiToken = randomString(32);
  const socketAuthToken = randomString(32);

  const backendEnv = coreBackendEnv(
    input,
    postgresPassword,
    redisPassword,
    jwtSecret,
    internalApiToken,
    socketAuthToken,
  );

  const backendUpstream = `http://$(PROJECT_NAME)_${input.backendServiceName}:3000`;

  if (input.useInternalPostgres) {
    services.push({
      type: "postgres",
      data: {
        serviceName: input.databaseServiceName,
        image: input.postgresImage || "postgres:16-alpine",
        password: postgresPassword,
      },
    });
  }

  services.push({
    type: "redis",
    data: {
      serviceName: input.redisServiceName,
      image: "redis:7",
      password: redisPassword,
    },
  });

  services.push({
    type: "app",
    data: {
      serviceName: input.backendServiceName,
      env: backendEnv,
      source: {
        type: "github",
        owner: input.githubOwner,
        repo: input.githubRepo,
        ref: input.githubRef,
        path: "/backend",
        autoDeploy: true,
      },
      build: {
        type: "dockerfile",
        file: "Dockerfile",
      },
      ...(input.exposeApiDomain
        ? {
            domains: [
              {
                host: "$(EASYPANEL_DOMAIN)",
                port: 3000,
                path: "/",
              },
            ],
          }
        : {}),
      mounts: [
        {
          type: "volume",
          name: "storage",
          mountPath: "/app/storage",
        },
      ],
    },
  });

  services.push({
    type: "app",
    data: {
      serviceName: input.workerServiceName,
      env: backendEnv,
      source: {
        type: "github",
        owner: input.githubOwner,
        repo: input.githubRepo,
        ref: input.githubRef,
        path: "/backend",
        autoDeploy: true,
      },
      build: {
        type: "dockerfile",
        file: "Dockerfile",
      },
      deploy: {
        command: "node dist/worker.js",
      },
      mounts: [
        {
          type: "bind",
          hostPath: `/etc/easypanel/projects/$(PROJECT_NAME)/${input.backendServiceName}/volumes/storage`,
          mountPath: "/app/storage",
        },
      ],
    },
  });

  services.push({
    type: "app",
    data: {
      serviceName: input.frontendServiceName,
      env: [
        "VITE_PMS_API_URL=https://$(PRIMARY_DOMAIN)",
        "VITE_APP_URL=https://$(PRIMARY_DOMAIN)",
        "VITE_SUPABASE_URL=",
        "VITE_SUPABASE_PUBLISHABLE_KEY=",
        `BACKEND_UPSTREAM=${backendUpstream}`,
      ].join("\n"),
      source: {
        type: "github",
        owner: input.githubOwner,
        repo: input.githubRepo,
        ref: input.githubRef,
        path: "/",
        autoDeploy: true,
      },
      build: {
        type: "dockerfile",
        file: "Dockerfile",
      },
      domains: [
        {
          host: "$(EASYPANEL_DOMAIN)",
          port: 80,
          path: "/",
        },
      ],
    },
  });

  return { services };
}
