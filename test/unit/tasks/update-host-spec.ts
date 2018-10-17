import { default as _chai, expect } from 'chai';
import 'mocha';
import _sinon from 'sinon';

import { ObjectMock, testValues as _testValues } from '@vamship/test-utils';
import _rewire from 'rewire';
import { injectSshSubTaskSuite } from '../../utils/test-suite-helper';

const _taskModule = _rewire('../../../src/tasks/update-host');

describe('[update-host task]', () => {
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
    let _waitOnMock;
    const WAIT_ON_DELAY = 5000;
    const WAIT_ON_INTERVAL = 1000;
    const WAIT_ON_TIMEOUT = 180000;

    beforeEach(() => {
        _waitOnMock = new ObjectMock().addPromiseMock('waitOn');
        _listrMock = new ObjectMock().addPromiseMock('run');
        _sshClientMock = new ObjectMock().addPromiseMock('run');

        _taskModule.__set__('listr_1', {
            default: _listrMock.ctor
        });
        _taskModule.__set__('wait_on_1', {
            default: _waitOnMock.instance.waitOn
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
        const expectedTitle = 'Update host system';
        const subTaskList = [
            {
                title: 'Update apt source list',
                commandCount: 2,
                eatError: false
            },
            {
                title: 'Download proxmox gpg key',
                commandCount: 1,
                eatError: false
            },
            {
                title: 'Upgrade host system',
                commandCount: 1,
                eatError: false
            },
            {
                title: 'Request system reboot',
                commandCount: 1,
                eatError: true
            },
            {
                title: 'Wait for system restart',
                commandCount: -1,
                eatError: false
            }
        ];

        function _getSubTaskRunner(taskIndex: number) {
            return (args: object = {}): Promise<undefined> => {
                _listrMock.ctor.resetHistory();
                _getTaskDefinition(args).task();
                return _listrMock.ctor.args[0][0][taskIndex].task();
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

        subTaskList.forEach(({ title, eatError, commandCount }, index) => {
            describe(`[sub task: ${title}]`, () => {
                const execSubTask = _getSubTaskRunner(index);

                if (index !== 4) {
                    // Tests for all but the wait for restart sub task
                    injectSshSubTaskSuite(
                        commandCount,
                        eatError,
                        execSubTask,
                        () => _sshClientMock
                    );
                } else {
                    // Tests for only the wait for restart sub task.
                    it('should return a promise when invoked', () => {
                        const ret = execSubTask();

                        expect(ret).to.be.an('object');
                        expect(ret.then).to.be.a('function');
                    });

                    it('should check to see if the remote host is reachable', () => {
                        const waitOnMethod = _waitOnMock.mocks.waitOn;
                        expect(waitOnMethod.stub).to.not.have.been.called;

                        const host = _testValues.getString('host');
                        const port = _testValues.getNumber(100, 22);

                        execSubTask({
                            host,
                            port
                        });

                        expect(waitOnMethod.stub).to.have.been.calledOnce;
                        expect(waitOnMethod.stub.args[0]).to.have.length(1);

                        const options = waitOnMethod.stub.args[0][0];
                        expect(options).to.deep.equal({
                            resources: [`tcp:${host}:${port}`],
                            delay: WAIT_ON_DELAY,
                            interval: WAIT_ON_INTERVAL,
                            timeout: WAIT_ON_TIMEOUT
                        });
                    });

                    it('should reject the promise if the host reachable check fails', () => {
                        const waitOnMethod = _waitOnMock.mocks.waitOn;
                        const error = new Error('something went wrong');

                        const ret = execSubTask();
                        waitOnMethod.reject(error);

                        return expect(ret).to.be.rejectedWith(error);
                    });

                    it('should resolve the promise if the host reachable check succeeds', () => {
                        const waitOnMethod = _waitOnMock.mocks.waitOn;

                        const ret = execSubTask();
                        waitOnMethod.resolve();

                        return expect(ret).to.be.fulfilled;
                    });
                }
            });
        });
        // describe(`[sub task: ${subTaskList[4].title}]`, () => {});
    });
});
