/**
 * @module root
 */

/**
 * A task definition for a command. This conforms to the task required by
 * [Listr](https://github.com/SamVerschueren/listr).
 */
export interface ITaskDefinition {
    /**
     * The task title.
     */
    title: string;

    /**
     * The task definition in the form of a function.
     */
    task: () => Promise<any> | undefined;
}

/**
 * Definition of an object containing information about a remote host, including
 * parameters required to connect to the remote host.
 */
export interface IRemoteHostInfo {
    /**
     * The hostname/ip address of the remote host.
     */
    host: string;

    /**
     * The username to use when logging in.
     */
    username: string;

    /**
     * The port number on which to connect to the remote host.
     */
    port?: number;

    /**
     * The password to use to either login or to unlock the private key.
     */
    password?: string;

    /**
     * The private key to use when authenticating against the remote host.
     */
    privateKey?: string;
}
