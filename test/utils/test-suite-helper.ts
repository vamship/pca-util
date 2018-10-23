import { default as _chai, expect } from 'chai';
import 'mocha';

import { ObjectMock, testValues as _testValues } from '@vamship/test-utils';

/**
 * Injects a suite of test to test the execution of ssh based sub tasks.
 *
 * @param commandCount The number of ssh commands to execute on the remote
 *        host.
 * @param eatError Determines if the task should ignore any ssh execution errors
 * @param execSubTask A callback function that can executes the sub task and
 *        returns the resulting promise.
 * @param getSshClientMock A ca;;nacl function that returns an instance of the
 *        ssh client mock object.
 */
export const injectSshSubTaskSuite = (
    commandCount: number,
    eatError: boolean,
    execSubTask: (args?: object, ctx?: object, task?: object) => Promise<any>,
    getSshClientMock: () => ObjectMock
) => {
    it('should return a promise when invoked', () => {
        const ret = execSubTask();

        expect(ret).to.be.an('object');
        expect(ret.then).to.be.a('function');
    });

    it('should initialize an ssh client with the correct parameters', () => {
        const sshClientMock = getSshClientMock();
        const host = _testValues.getString('host');
        const port = _testValues.getNumber(100, 22);
        const username = _testValues.getString('username');
        const privateKey = _testValues.getString('privateKey');
        const password = _testValues.getString('password');

        sshClientMock.ctor.resetHistory();
        expect(sshClientMock.ctor).to.not.have.been.called;

        execSubTask({
            host,
            port,
            username,
            password,
            privateKey
        });

        expect(sshClientMock.ctor).to.have.been.calledOnce;
        expect(sshClientMock.ctor).to.have.been.calledWithNew;
        expect(sshClientMock.ctor.args[0]).to.have.length(1);

        const clientOptions = sshClientMock.ctor.args[0][0];
        expect(clientOptions).to.be.an('object');
        expect(clientOptions.host).to.equal(host);
        expect(clientOptions.username).to.equal(username);
        expect(clientOptions.port).to.equal(port);
        expect(clientOptions.password).to.equal(password);
        expect(clientOptions.privateKey).to.equal(privateKey);
    });

    it('should run the expected number of commands over ssh', () => {
        const sshClientMock = getSshClientMock();
        const runMethod = sshClientMock.mocks.run;

        expect(runMethod.stub).to.not.have.been.called;

        execSubTask();

        expect(runMethod.stub).to.have.been.calledOnce;
        expect(runMethod.stub.args[0]).to.have.length(1);

        const commands = runMethod.stub.args[0][0];
        expect(commands).to.be.an('array');
        expect(commands).to.have.length(commandCount);
    });

    if (!eatError) {
        it('should reject the promise if command execution fails', () => {
            const sshClientMock = getSshClientMock();
            const runMethod = sshClientMock.mocks.run;

            const ret = execSubTask();
            runMethod.resolve({
                commandCount,
                successCount: 0,
                failureCount: commandCount
            });

            return expect(ret).to.be.rejected;
        });
    } else {
        it('should resolve the promise even if command execution fails', () => {
            const sshClientMock = getSshClientMock();
            const runMethod = sshClientMock.mocks.run;

            const ret = execSubTask();
            runMethod.resolve({
                commandCount,
                successCount: 0,
                failureCount: commandCount
            });

            return expect(ret).to.be.fulfilled;
        });
    }

    it('should resolve the promise if command execution succeeds', () => {
        const sshClientMock = getSshClientMock();
        const runMethod = sshClientMock.mocks.run;

        const ret = execSubTask();
        runMethod.resolve({
            commandCount,
            successCount: commandCount,
            failureCount: 0
        });

        return expect(ret).to.be.fulfilled;
    });
};
