/**
 * @module root.commands.configureHost
 */
import Listr from 'listr';
import { getTask as _getSetupTemplateEnvTask } from '../tasks/configure-dhcp';
import { IRemoteHostInfo } from '../types';

export const command = 'create-templates';
export const describe = 'Create VM templates for kubernetes nodes and bastion';
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

    return new Listr([_getSetupTemplateEnvTask(hostInfo)]).run();
};
