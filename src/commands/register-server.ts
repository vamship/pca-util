/**
 * @module root.commands.configureHost
 */
import Listr from 'listr';
import { getTask as _getCreateClusterSecretsTask } from '../tasks/create-cluster-secrets';
import { IRemoteHostInfo } from '../types';

export const command = 'register-server';
export const describe = 'Register server with cloud';
export const builder = {
    host: {
        alias: 'h',
        describe: 'The hostname/ip address of the remote host',
        type: 'string',
        demand: true
    },
    username: {
        alias: 'u',
        describe: 'The username to use to authenticate against the remote host',
        type: 'string',
        demand: true
    },
    port: {
        alias: 'o',
        describe: 'The port on which to connect to the host',
        type: 'number',
        default: 22
    },
    password: {
        alias: 'p',
        describe: [
            'The password to use to authenticate against the remote host.',
            'If a private key is specified, then the password will be used',
            'to unlock the private key'
        ].join(' '),
        type: 'string',
        default: undefined
    },
    'private-key': {
        alias: 'k',
        describe: 'The path to the ssh private key',
        type: 'string',
        default: undefined
    },
    'cloud-endpoint': {
        alias: 'c',
        describe: [
            'The endpoint in the cloud that the server will contact',
            'for licensing and software update information'
        ].join(' '),
        type: 'string',
        demand: true
    },
    'server-id': {
        alias: 's',
        describe: 'The id to assign to the server',
        type: 'string',
        demand: true
    },
    'server-secret': {
        alias: 'e',
        describe:
            'A unique secret that the server can use to identify itself to the cloud',
        type: 'string',
        demand: true
    }
};
export const handler = (argv) => {
    const { host, username, port, password, privateKey } = argv;
    const hostInfo: IRemoteHostInfo = {
        host,
        username,
        port,
        password,
        privateKey
    };

    return new Listr([_getCreateClusterSecretsTask(hostInfo)]).run();
};
