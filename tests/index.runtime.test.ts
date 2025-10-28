import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';

type LoadedModule = Awaited<ReturnType<typeof loadIndexModule>>;

async function loadIndexModule() {
  jest.resetModules();

  const existingSigint = process.listeners('SIGINT');
  const existingSigterm = process.listeners('SIGTERM');

  const mockServer = {
    setRequestHandler: jest.fn(),
    connect: jest.fn(async () => {}),
    close: jest.fn(async () => {}),
  };
  const serverCtor = jest.fn(() => mockServer);

  const mockTransport = {};
  const transportCtor = jest.fn(() => mockTransport);

  jest.doMock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: serverCtor,
  }));

  jest.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: transportCtor,
  }));

  const errorCode = {
    InternalError: 'internal_error',
    MethodNotFound: 'method_not_found',
  };

  class McpError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  jest.doMock('@modelcontextprotocol/sdk/types.js', () => ({
    ListToolsRequestSchema: { id: 'list' },
    CallToolRequestSchema: { id: 'call' },
    ErrorCode: errorCode,
    McpError,
  }));

  const indexModule = await import('../src/index');
  const { ErrorHandler } = await import('../src/errors/handler');
  const { MissionProtocolError } = await import('../src/errors/mission-error');

  const newSigint = process
    .listeners('SIGINT')
    .filter((listener) => !existingSigint.includes(listener));
  const newSigterm = process
    .listeners('SIGTERM')
    .filter((listener) => !existingSigterm.includes(listener));

  const cleanup = () => {
    for (const listener of newSigint) {
      process.removeListener('SIGINT', listener);
    }
    for (const listener of newSigterm) {
      process.removeListener('SIGTERM', listener);
    }
  };

  return {
    indexModule,
    mockServer,
    serverCtor,
    transportCtor,
    ErrorHandler,
    MissionProtocolError,
    newSigint,
    newSigterm,
    cleanup,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

const createMockContext = () =>
  ({
    baseDir: '/tmp/templates',
    defaultModel: 'claude',
    loader: {},
    registryParser: {} as any,
    packCombiner: {} as any,
    listDomainsTool: {} as any,
    createMissionTool: {} as any,
    combinePacksTool: {} as any,
    optimizeTokensTool: {} as any,
    splitMissionTool: {} as any,
    suggestSplitsTool: {} as any,
    tokenCounter: {} as any,
  }) as any;

describe('Mission Protocol entry lifecycle', () => {
  test('initializeServer logs initialization details and returns context', async () => {
    const moduleData = await loadIndexModule();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const context = createMockContext();
    moduleData.indexModule.__test__.setContextBuilder(async () => context);

    try {
      const result = await moduleData.indexModule.__test__.initializeServer();

      expect(result).toBe(context);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Initializing MCP server'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template base directory: /tmp/templates')
      );
    } finally {
      moduleData.cleanup();
      moduleData.indexModule.__test__.resetContextBuilder();
      consoleSpy.mockRestore();
    }
  });

  test('initializeServer wraps failures with mission error', async () => {
    const moduleData = await loadIndexModule();
    const failure = new Error('registry unavailable');
    const wrapped = new moduleData.MissionProtocolError({
      code: 'INTERNAL_UNEXPECTED',
      category: 'internal',
      message: 'failed',
      context: { module: 'server' },
    });

    moduleData.indexModule.__test__.setContextBuilder(async () => {
      throw failure;
    });
    const handleSpy = jest.spyOn(moduleData.ErrorHandler, 'handle').mockReturnValue(wrapped);

    try {
      await expect(moduleData.indexModule.__test__.initializeServer()).rejects.toBe(wrapped);
      expect(handleSpy).toHaveBeenCalledWith(
        failure,
        'server.initialize',
        { module: 'server' },
        expect.objectContaining({ rethrow: false })
      );
    } finally {
      moduleData.cleanup();
      moduleData.indexModule.__test__.resetContextBuilder();
      handleSpy.mockRestore();
    }
  });

  test('registerToolHandlers registers list handler and sanitizes execution errors', async () => {
    const moduleData = await loadIndexModule();
    const { indexModule, mockServer, ErrorHandler } = moduleData;

    const definitions = [{ name: 'demo_tool' }];
    const definitionsSpy = jest
      .spyOn(indexModule, 'getToolDefinitions')
      .mockReturnValue(definitions as any);

    const context = createMockContext();
    const executionError = new Error('boom');

    const execSpy = jest
      .spyOn(indexModule, 'executeMissionProtocolTool')
      .mockRejectedValue(executionError);

    const missionError = new moduleData.MissionProtocolError({
      code: 'INTERNAL_UNEXPECTED',
      category: 'internal',
      message: 'wrapped',
      context: { module: 'server' },
    });
    const handleSpy = jest.spyOn(ErrorHandler, 'handle').mockReturnValue(missionError);
    const publicSpy = jest.spyOn(ErrorHandler, 'toPublicError').mockReturnValue({
      code: 'INTERNAL_UNEXPECTED',
      category: 'internal',
      message: 'Tool execution failed',
      correlationId: 'cid-123',
      retryable: false,
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      indexModule.__test__.registerToolHandlers(context);

      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
      const listHandler = mockServer.setRequestHandler.mock.calls[0][1] as () => any;
      const listResponse = await listHandler();
      expect(Array.isArray(listResponse.tools)).toBe(true);
      expect(listResponse.tools.length).toBeGreaterThan(0);

      const callHandler = mockServer.setRequestHandler.mock.calls[1][1] as (
        request: any
      ) => Promise<unknown>;
      await expect(
        callHandler({
          params: {
            name: 'dangerous_tool',
            arguments: Object.fromEntries(
              Array.from({ length: 12 }, (_, idx) => [`key${idx}`, idx])
            ),
          },
        })
      ).rejects.toMatchObject({
        code: 'internal_error',
        message: expect.stringContaining('correlationId=cid-123'),
      });

      expect(handleSpy).toHaveBeenCalledTimes(1);
      const [errorArg, operationArg, contextArg] = handleSpy.mock.calls[0];
      expect(errorArg).toBeInstanceOf(Error);
      expect((errorArg as Error).message).toContain('Unknown tool: dangerous_tool');
      expect(operationArg).toBe('server.execute_tool');
      expect(contextArg).toMatchObject({
        module: 'server',
        data: expect.objectContaining({
          tool: 'dangerous_tool',
          args: expect.objectContaining({ key0: 0 }),
        }),
      });
    } finally {
      moduleData.cleanup();
      definitionsSpy.mockRestore();
      consoleSpy.mockRestore();
      handleSpy.mockRestore();
      publicSpy.mockRestore();
      execSpy.mockRestore();
    }
  });

  test('registerToolHandlers omits sanitized args when input is not an object', async () => {
    const moduleData = await loadIndexModule();
    const { indexModule, mockServer, ErrorHandler } = moduleData;
    const context = createMockContext();

    const executionError = new Error('explode');
    const missionError = new moduleData.MissionProtocolError({
      code: 'INTERNAL_UNEXPECTED',
      category: 'internal',
      message: 'wrapped',
      context: { module: 'server' },
    });

    const execSpy = jest
      .spyOn(indexModule, 'executeMissionProtocolTool')
      .mockRejectedValue(executionError);

    const handleSpy = jest.spyOn(ErrorHandler, 'handle').mockReturnValue(missionError);
    const publicSpy = jest.spyOn(ErrorHandler, 'toPublicError').mockReturnValue({
      code: missionError.code,
      category: missionError.category,
      message: 'Tool execution failed',
      correlationId: undefined,
      retryable: false,
    });

    try {
      indexModule.__test__.registerToolHandlers(context);
      const callHandler = mockServer.setRequestHandler.mock.calls[1][1] as (
        request: any
      ) => Promise<unknown>;

      await expect(
        callHandler({
          params: {
            name: 'string_args_tool',
            arguments: 'non-object arguments',
          },
        })
      ).rejects.toMatchObject({
        code: 'internal_error',
        message: expect.stringContaining('Tool execution failed'),
      });

      const [, , contextArg] = handleSpy.mock.calls[0];
      expect(contextArg).toBeDefined();
      expect(contextArg?.data).toEqual({ tool: 'string_args_tool' });
    } finally {
      moduleData.cleanup();
      execSpy.mockRestore();
      handleSpy.mockRestore();
      publicSpy.mockRestore();
    }
  });

  test('registerToolHandlers reports when server context is missing', async () => {
    const moduleData = await loadIndexModule();
    const { indexModule, mockServer, ErrorHandler } = moduleData;
    const handleSpy = jest.spyOn(ErrorHandler, 'handle');

    try {
      indexModule.__test__.registerToolHandlers(null as unknown as any);
      const callHandler = mockServer.setRequestHandler.mock.calls[1][1] as (
        request: any
      ) => Promise<unknown>;

      await expect(
        callHandler({ params: { name: 'get_available_domains', arguments: {} } })
      ).rejects.toBeInstanceOf(Error);

      expect(handleSpy).toHaveBeenCalled();
      const [innerError] = handleSpy.mock.calls[0];
      expect(innerError).toBeInstanceOf(Error);
      expect((innerError as Error).message).toBe('Server context not initialized');
    } finally {
      moduleData.cleanup();
      handleSpy.mockRestore();
    }
  });

  test('main connects server and logs startup details', async () => {
    const moduleData = await loadIndexModule();
    const { indexModule, mockServer, transportCtor } = moduleData;
    const context = createMockContext();
    indexModule.__test__.setContextBuilder(async () => context);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await indexModule.__test__.main();

      expect(mockServer.setRequestHandler).toHaveBeenCalled();
      expect(mockServer.connect).toHaveBeenCalled();
      expect(transportCtor).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mission Protocol MCP server running on stdio')
      );
    } finally {
      moduleData.cleanup();
      indexModule.__test__.resetContextBuilder();
      consoleSpy.mockRestore();
    }
  });

  test('main handles startup failures via ErrorHandler and exits', async () => {
    const moduleData = await loadIndexModule();
    const { indexModule, ErrorHandler } = moduleData;
    const failure = new Error('init failure');

    const missionError = new moduleData.MissionProtocolError({
      code: 'INTERNAL_UNEXPECTED',
      category: 'internal',
      message: 'startup failed',
      context: { module: 'server' },
    });
    indexModule.__test__.setContextBuilder(async () => {
      throw failure;
    });

    const handleSpy = jest.spyOn(ErrorHandler, 'handle').mockReturnValue(missionError);
    const publicSpy = jest.spyOn(ErrorHandler, 'toPublicError').mockReturnValue({
      code: 'INTERNAL_UNEXPECTED',
      category: 'internal',
      message: 'Mission Protocol server startup failed.',
      correlationId: 'cid-xyz',
      retryable: false,
    });

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await indexModule.__test__.main();

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Server startup failed (correlationId=cid-xyz)')
      );
    } finally {
      moduleData.cleanup();
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
      indexModule.__test__.resetContextBuilder();
      handleSpy.mockRestore();
      publicSpy.mockRestore();
    }
  });

  test('SIGINT handler attempts graceful shutdown and exits', async () => {
    const moduleData = await loadIndexModule();
    const { mockServer, newSigint } = moduleData;

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const handler = newSigint[newSigint.length - 1];
      expect(handler).toBeDefined();
      await expect(handler?.({} as any)).rejects.toThrow('exit:0');
      expect(mockServer.close).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGINT, shutting down gracefully')
      );
    } finally {
      moduleData.cleanup();
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  test('SIGTERM handler attempts graceful shutdown and exits', async () => {
    const moduleData = await loadIndexModule();
    const { mockServer, newSigterm } = moduleData;

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const handler = newSigterm[newSigterm.length - 1];
      expect(handler).toBeDefined();
      await expect(handler?.({} as any)).rejects.toThrow('exit:0');
      expect(mockServer.close).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGTERM, shutting down gracefully')
      );
    } finally {
      moduleData.cleanup();
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
