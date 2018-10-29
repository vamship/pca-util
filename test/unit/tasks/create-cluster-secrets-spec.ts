import { default as _chai, expect } from 'chai';
import 'mocha';
import _sinon from 'sinon';

import { ObjectMock, testValues as _testValues } from '@vamship/test-utils';
import _rewire from 'rewire';
import { injectSshSubTaskSuite } from '../../utils/test-suite-helper';

const _taskModule = _rewire('../../../src/tasks/create-cluster-secrets');

describe('[create-cluster-secrets task]', () => {
    function _getTaskDefinition(args: object = {}) {
        const host = _testValues.getString('host');
        const port = _testValues.getNumber(100, 22);
        const username = _testValues.getString('username');
        const privateKey = _testValues.getString('privateKey');
        const password = _testValues.getString('password');

        const hostInfo = Object.assign(
            {
                host,
                port,
                username,
                privateKey,
                password
            },
            args
        );

        return _taskModule.getTask(hostInfo);
    }

    let _listrMock;
    let _sshClientMock;
    // const VM_STARTUP_WAIT_TIME = 180000;

    beforeEach(() => {
        _listrMock = new ObjectMock().addPromiseMock('run');
        _sshClientMock = new ObjectMock().addPromiseMock('run');

        _taskModule.__set__('listr_1', {
            default: _listrMock.ctor
        });
        _taskModule.__set__('ssh_utils_1', {
            SshClient: _sshClientMock.ctor
        });
    });

    describe('[init]', () => {
        it('should export expected properties', () => {
            expect(_taskModule.getTask).to.be.a('function');
        });
    });

    describe('getTask()', () => {
        const expectedTitle =
            'Create core secrets required for deploying apps on the cluster';
        const subTaskList = [
            {
                title: 'Ensure that working directories exist',
                commandCount: 3,
                eatError: false
            },
            {
                title: 'Copy CA certs from master',
                commandCount: 7,
                eatError: false
            },
            {
                title: 'Generate credentials for kubernetes access',
                commandCount: 6,
                eatError: false
            },
            {
                title: 'Generate kubeconfig file using client credentials',
                commandCount: 2,
                eatError: false
            },
            {
                title: 'Generate helm/tiller certificates',
                commandCount: 12,
                eatError: false
            },
            {
                title: 'Copy credentials to master',
                commandCount: 9,
                eatError: false
            }
        ];

        function _getSubTaskRunner(taskIndex: number) {
            return (
                args: object = {},
                ctx: object = {},
                task: object = {}
            ): Promise<undefined> => {
                _listrMock.ctor.resetHistory();
                _getTaskDefinition(args).task();
                return _listrMock.ctor.args[0][0][taskIndex].task(ctx, task);
            };
        }

        it('should return a task definition when invoked', () => {
            const taskDefinition = _getTaskDefinition();

            expect(taskDefinition.title).to.equal(expectedTitle);
            expect(taskDefinition.task).to.be.a('function');
        });

        it('should create and return a Listr object when the task is invoked', () => {
            expect(_listrMock.ctor).to.not.have.been.called;

            const ret = _getTaskDefinition().task();

            expect(_listrMock.ctor).to.have.been.calledOnce;
            expect(ret).to.equal(_listrMock.instance);
        });

        it('should define the expected number of sub tasks with correct titles', () => {
            _getTaskDefinition().task();
            expect(_listrMock.ctor.args[0]).to.have.length(1);

            const subTaskArg = _listrMock.ctor.args[0][0];
            expect(subTaskArg).to.be.an('array');

            const subTaskTitles = subTaskList.map((task) => task.title);
            expect(subTaskArg).to.have.length(subTaskTitles.length);

            subTaskTitles.forEach((title, index) => {
                expect(subTaskArg[index]).to.be.an('object');
                expect(subTaskArg[index].title).to.equal(title);
                expect(subTaskArg[index].task).to.be.a('function');
            });
        });

        subTaskList.forEach(({ title, commandCount, eatError }, index) => {
            describe(`[sub task: ${title}]`, () => {
                const execSubTask = _getSubTaskRunner(index);
                const getSshClientMock = () => _sshClientMock;

                injectSshSubTaskSuite(
                    commandCount,
                    eatError,
                    execSubTask,
                    getSshClientMock
                );
            });
        });
    });
});
