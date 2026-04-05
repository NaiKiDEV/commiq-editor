export type ContainerState =
  | 'running'
  | 'exited'
  | 'paused'
  | 'restarting'
  | 'dead'
  | 'created'
  | 'removing';

export type DockerContainer = {
  ID: string;
  Names: string;
  Image: string;
  Command: string;
  CreatedAt: string;
  RunningFor: string;
  Ports: string;
  State: ContainerState;
  Status: string;
  Size: string;
  Networks: string;
  Labels: string;
  Mounts: string;
};

export type DockerImage = {
  ID: string;
  Repository: string;
  Tag: string;
  Digest: string;
  CreatedAt: string;
  CreatedSince: string;
  Size: string;
  VirtualSize: string;
  Containers: string;
};

export type DockerVolume = {
  Name: string;
  Driver: string;
  Mountpoint: string;
  Labels: string;
  Scope: string;
};

export type DockerNetwork = {
  ID: string;
  Name: string;
  Driver: string;
  Scope: string;
  IPv6: string;
  Internal: string;
  Labels: string;
  CreatedAt: string;
};

export type ComposeProject = {
  Name: string;
  Status: string;
  ConfigFiles: string;
};

export type DockerSection =
  | 'containers'
  | 'images'
  | 'compose'
  | 'volumes'
  | 'networks';
