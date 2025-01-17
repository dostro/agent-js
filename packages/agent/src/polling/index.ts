import { Principal } from '@dfinity/principal';
import { Agent, RequestStatusResponseStatus } from '../agent';
import { Certificate } from '../certificate';
import { RequestId } from '../request_id';
import { toHex } from '../utils/buffer';

export * as strategy from './strategy';
export { defaultStrategy } from './strategy';
export type PollStrategy = (
  canisterId: Principal,
  requestId: RequestId,
  status: RequestStatusResponseStatus,
) => Promise<void>;
export type PollStrategyFactory = () => PollStrategy;

/**
 * Polls the IC to check the status of the given request then
 * returns the response bytes once the request has been processed.
 * @param agent The agent to use to poll read_state.
 * @param canisterId The effective canister ID.
 * @param requestId The Request ID to poll status for.
 * @param strategy A polling strategy.
 */
export async function pollForResponse(
  agent: Agent,
  canisterId: Principal,
  requestId: RequestId,
  strategy: PollStrategy,
): Promise<ArrayBuffer> {
  const path = [new TextEncoder().encode('request_status'), requestId];
  const state = await agent.readState(canisterId, { paths: [path] });
  const cert = new Certificate(state, agent);
  const verified = await cert.verify();
  if (!verified) {
    throw new Error('Fail to verify certificate');
  }
  const maybeBuf = cert.lookup([...path, new TextEncoder().encode('status')]);
  let status;
  if (typeof maybeBuf === 'undefined') {
    // Missing requestId means we need to wait
    status = RequestStatusResponseStatus.Unknown;
  } else {
    status = new TextDecoder().decode(maybeBuf);
  }

  switch (status) {
    case RequestStatusResponseStatus.Replied: {
      return cert.lookup([...path, 'reply'])!;
    }

    case RequestStatusResponseStatus.Received:
    case RequestStatusResponseStatus.Unknown:
    case RequestStatusResponseStatus.Processing:
      // Execute the polling strategy, then retry.
      await strategy(canisterId, requestId, status);
      return pollForResponse(agent, canisterId, requestId, strategy);

    case RequestStatusResponseStatus.Rejected: {
      const rejectCode = new Uint8Array(cert.lookup([...path, 'reject_code'])!)[0];
      const rejectMessage = new TextDecoder().decode(cert.lookup([...path, 'reject_message'])!);
      throw new Error(
        `Call was rejected:\n` +
          `  Request ID: ${toHex(requestId)}\n` +
          `  Reject code: ${rejectCode}\n` +
          `  Reject text: ${rejectMessage}\n`,
      );
    }

    case RequestStatusResponseStatus.Done:
      // This is _technically_ not an error, but we still didn't see the `Replied` status so
      // we don't know the result and cannot decode it.
      throw new Error(
        `Call was marked as done but we never saw the reply:\n` +
          `  Request ID: ${toHex(requestId)}\n`,
      );
  }
  throw new Error('unreachable');
}
