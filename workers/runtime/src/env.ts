export interface HyperdriveBinding {
  connectionString: string;
}

export interface ServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface WorkerEnv {
  HYPERDRIVE?: HyperdriveBinding;
  DATABASE_URL?: string;
}

export type WorkerBindings<
  Services extends string = never,
  Secrets extends string = never,
> = WorkerEnv & Record<Services, ServiceBinding> & Record<Secrets, string>;
