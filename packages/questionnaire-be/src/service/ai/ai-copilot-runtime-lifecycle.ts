import { Request, Response } from 'express';

const DISCONNECT_BACKGROUND_GRACE_MS = 45_000;

export type CopilotStreamStopReason =
  | 'disconnect'
  | 'cancel'
  | 'timeout'
  | 'disconnect_timeout';

type RuntimeState = {
  clientConnected: boolean;
  backgroundRunning: boolean;
};

type CreateCopilotRuntimeLifecycleParams = {
  req: Request;
  res: Response;
  abortController: AbortController;
  shouldContinueAfterDisconnect: () => boolean;
  hasConversation: () => boolean;
  onEnterBackgroundRunning: () => Promise<void>;
};

export const createCopilotRuntimeLifecycle = ({
  req,
  res,
  abortController,
  shouldContinueAfterDisconnect,
  hasConversation,
  onEnterBackgroundRunning,
}: CreateCopilotRuntimeLifecycleParams) => {
  let stopReason: CopilotStreamStopReason | null = null;
  let disconnectGraceTimeoutId: NodeJS.Timeout | null = null;

  const runtimeState: RuntimeState = {
    clientConnected: true,
    backgroundRunning: false,
  };

  const clearDisconnectGraceTimeout = () => {
    if (!disconnectGraceTimeoutId) return;
    clearTimeout(disconnectGraceTimeoutId);
    disconnectGraceTimeoutId = null;
  };

  const stopStream = (reason: CopilotStreamStopReason) => {
    if (stopReason) return;
    stopReason = reason;
    abortController.abort();
  };

  const enterBackgroundRunningState = async () => {
    if (runtimeState.backgroundRunning || !shouldContinueAfterDisconnect()) {
      return;
    }

    runtimeState.backgroundRunning = true;
    await onEnterBackgroundRunning();
  };

  const scheduleDisconnectGraceTimeout = () => {
    clearDisconnectGraceTimeout();
    disconnectGraceTimeoutId = setTimeout(() => {
      stopStream('disconnect_timeout');
    }, DISCONNECT_BACKGROUND_GRACE_MS);
  };

  const handleDisconnect = () => {
    runtimeState.clientConnected = false;
    if (stopReason) return;

    if (shouldContinueAfterDisconnect()) {
      scheduleDisconnectGraceTimeout();
      if (hasConversation()) {
        void enterBackgroundRunningState();
      }
      return;
    }

    stopStream('disconnect');
  };

  const handleRequestAborted = () => {
    handleDisconnect();
  };

  const handleResponseClosed = () => {
    if (res.writableEnded) return;
    handleDisconnect();
  };

  const attach = () => {
    req.on('aborted', handleRequestAborted);
    res.on('close', handleResponseClosed);
    if (req.aborted || res.destroyed) {
      handleDisconnect();
    }
  };

  const detach = () => {
    clearDisconnectGraceTimeout();
    req.off('aborted', handleRequestAborted);
    res.off('close', handleResponseClosed);
  };

  const resumeBackgroundIfDetached = () => {
    if (!runtimeState.clientConnected || res.destroyed || res.writableEnded) {
      runtimeState.clientConnected = false;
      if (shouldContinueAfterDisconnect()) {
        runtimeState.backgroundRunning = true;
        scheduleDisconnectGraceTimeout();
      }
    }
  };

  return {
    runtimeState,
    stopStream,
    getStopReason: () => stopReason,
    clearDisconnectGraceTimeout,
    attach,
    detach,
    resumeBackgroundIfDetached,
    setBackgroundRunning: (nextValue: boolean) => {
      runtimeState.backgroundRunning = nextValue;
    },
  };
};
