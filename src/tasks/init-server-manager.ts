/**
 * @module root.tasks.initServerManager
 */
import _loggerProvider from '@vamship/logger';
import { SshClient } from '@vamship/ssh-utils';
import Listr from 'listr';
import { IServerInfo, ITaskDefinition } from '../types';

const createServiceAccountsCommands = [
    '# ---------- Create service accounts and assign permissions to them ----------',
    [
        "ssh k8s-master <<'END_SCRIPT'",

        '# ---------- Echo commands ----------',
        'set -x',

        '# ---------- Create service accounts ----------',
        [
            "kubectl apply -f - <<'EOF'",
            'apiVersion: v1',
            'kind: ServiceAccount',
            'metadata:',
            '  name: svm-helm-account',
            '  namespace: kube-system',
            '  labels:',
            '    app: "server-manager"',
            '---',
            'apiVersion: v1',
            'kind: ServiceAccount',
            'metadata:',
            '  name: svm-default-account',
            '  namespace: kube-system',
            '  labels:',
            '    app: "server-manager"',
            '---',
            'apiVersion: rbac.authorization.k8s.io/v1beta1',
            'kind: ClusterRoleBinding',
            'metadata:',
            '  name: svm-admin-binding',
            '  namespace: kube-system',
            '  labels:',
            '    app: "server-manager"',
            'roleRef:',
            '  apiGroup: rbac.authorization.k8s.io',
            '  kind: ClusterRole',
            '  name: cluster-admin',
            'subjects:',
            '  - kind: ServiceAccount',
            '    name: svm-default-account',
            '    namespace: kube-system',
            '  - kind: ServiceAccount',
            '    name: svm-helm-account',
            '    namespace: kube-system',
            'EOF'
        ].join('\n'),
        'END_SCRIPT'
    ].join('\n')
];

const launchServerManagerInitializerCommands = [
    '# ---------- Create service accounts and assign permissions to them ----------',
    [
        "ssh k8s-master <<'END_SCRIPT'",

        '# ---------- Echo commands ----------',
        'set -x',

        [
            "kubectl apply -f - <<'EOF'",
            'apiVersion: batch/v1',
            'kind: Job',
            'metadata:',
            '  name: server-initializer',
            '  namespace: kube-system',
            '  labels:',
            '    app: "server-manager"',
            '    module: "server-initializer"',
            'spec:',
            '  backoffLimit: 1',
            '  ttlSecondsAfterFinished: 3600',
            '  template:',
            '    spec:',
            '      serviceAccountName: svm-default-account',
            '      restartPolicy: Never',
            '      containers:',
            '      - name: initializer',
            '        image: vamship/helm:1.0.0',
            '        volumeMounts:',
            '          - name: tiller-certificate',
            '            mountPath: /etc/server-manager/tiller-certificate',
            '          - name: helm-ca-certificate',
            '            mountPath: /etc/server-manager/helm-ca-certificate',
            '        env:',
            '        - name: KUBERNETES_SERVICE_PORT',
            '          value: "6443"',
            '        - name: KUBERNETES_SERVICE_HOST',
            '          value: "10.0.0.64"',
            '        - name: SERVER_ID',
            '          valueFrom:',
            '            secretKeyRef:',
            '              name: svm-server-identity',
            '              key: serverId',
            '        - name: SERVER_KEY',
            '          valueFrom:',
            '            secretKeyRef:',
            '              name: svm-server-identity',
            '              key: serverKey',
            '        command: [ "helm" ]',
            [
                '        args: [',
                [
                    '"init"',
                    '"--tiller-tls"',
                    '"--tiller-tls-verify"',
                    '"--service-account=svm-helm-account"',
                    '"--tiller-tls-cert=/etc/server-manager/tiller-certificate/tls.crt"',
                    '"--tiller-tls-key=/etc/server-manager/tiller-certificate/tls.key"',
                    '"--tls-ca-cert=/etc/server-manager/helm-ca-certificate/tls.crt"',
                    "\"--override='spec.template.spec.containers[0].command'='{/tiller,--storage=secret}'\""
                ].join(','),
                ']'
            ].join(' '),
            '      volumes:',
            '        - name: tiller-certificate',
            '          secret:',
            '            secretName: svm-tiller-certificate',
            '        - name: helm-ca-certificate',
            '          secret:',
            '            secretName: svm-helm-ca-certificate',
            'EOF'
        ].join('\n'),
        'END_SCRIPT'
    ].join('\n')
];

/**
 * Returns a task that can be used to create instances for the kubernetes
 * cluster. This task creates both master and regular nodes. A preliminary check
 * is performed to see if the master node already exists, and if it does, all
 * further processing is skipped.
 *
 * @param hostInfo Informtation about the remote host against which the task
 *        will be executed.
 *
 * @return ITaskDefinition A task definition that can be used to execute the
 *         task.
 */
export const getTask = (hostInfo: IServerInfo): ITaskDefinition => {
    return {
        title: 'Initialize and launch server management agent',
        task: () => {
            const logger = _loggerProvider.getLogger('configure-k8s-cluster');
            return new Listr([
                {
                    title: 'Create service accounts on cluster',
                    task: () => {
                        logger.trace('Create service accounts on cluster');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(createServiceAccountsCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error creating service accounts on cluster'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(
                                    'Service accounts created on cluster'
                                );
                            });
                    }
                },
                {
                    title: 'Launch server manager initializer',
                    task: () => {
                        logger.trace('Launch server manager initializer');
                        const sshClient = new SshClient(hostInfo);
                        return sshClient
                            .run(launchServerManagerInitializerCommands)
                            .then((results) => {
                                logger.trace(results);
                                if (results.failureCount > 0) {
                                    const err = new Error(
                                        'Error launching server manager initializer'
                                    );
                                    logger.error(err);
                                    throw err;
                                }
                                logger.debug(
                                    'Server manager initializer launched'
                                );
                            });
                    }
                }
            ]);
        }
    };
};
