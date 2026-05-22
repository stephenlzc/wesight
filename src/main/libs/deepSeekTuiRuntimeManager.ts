import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import crypto from 'crypto';
import net from 'net';
import os from 'os';

import { ExternalAgentConfigSource } from '../../shared/cowork/constants';

export interface DeepSeekTuiRuntimeOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  configSource: typeof ExternalAgentConfigSource[keyof typeof ExternalAgentConfigSource];
}

export interface DeepSeekTuiRuntimeConnection {
  baseUrl: string;
  token: string;
  cwd: string;
  configSource: typeof ExternalAgentConfigSource[keyof typeof ExternalAgentConfigSource];
  port: number;
}

interface ActiveRuntime {
  child: ChildProcessWithoutNullStreams;
  connection: DeepSeekTuiRuntimeConnection;
  key: string;
  stderrTail: string;
}

const START_TIMEOUT_MS = 30_000;
const HEALTH_INTERVAL_MS = 350;
const STDERR_TAIL_MAX_CHARS = 16_000;

const envKey = (env: Record<string, string | undefined>): string => {
  const keys = [
    'DEEPSEEK_PROVIDER',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'DEEPSEEK_MODEL',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_MODEL',
    'DEEPSEEK_CONFIG_PATH',
  ];
  return keys.map((key) => `${key}=${env[key] ?? ''}`).join('\n');
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const findFreePort = (): Promise<number> => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => {
      if (address && typeof address === 'object') {
        resolve(address.port);
      } else {
        reject(new Error('Failed to allocate a local port for DeepSeek-TUI.'));
      }
    });
  });
});

const appendTail = (previous: string, next: string): string => {
  const combined = `${previous}${next}`;
  return combined.length > STDERR_TAIL_MAX_CHARS
    ? combined.slice(-STDERR_TAIL_MAX_CHARS)
    : combined;
};

export class DeepSeekTuiRuntimeManager {
  private activeRuntime: ActiveRuntime | null = null;

  async ensureRunning(options: DeepSeekTuiRuntimeOptions): Promise<DeepSeekTuiRuntimeConnection> {
    const key = [
      options.cwd,
      options.configSource,
      envKey(options.env),
    ].join('\n---\n');
    if (this.activeRuntime?.key === key && await this.healthCheck(this.activeRuntime.connection)) {
      return this.activeRuntime.connection;
    }

    this.stop();
    const port = await findFreePort();
    const token = crypto.randomBytes(24).toString('hex');
    const connection: DeepSeekTuiRuntimeConnection = {
      baseUrl: `http://127.0.0.1:${port}`,
      token,
      cwd: options.cwd,
      configSource: options.configSource,
      port,
    };
    const args = [
      '--workspace',
      options.cwd,
      '--skip-onboarding',
    ];
    if (options.configSource === ExternalAgentConfigSource.WesightModel) {
      args.push('--no-project-config');
    }
    args.push(
      'serve',
      '--http',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--auth-token',
      token,
    );

    const child = spawn('deepseek-tui', args, {
      cwd: options.cwd || os.homedir(),
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: process.platform === 'win32',
    });

    const runtime: ActiveRuntime = {
      child,
      connection,
      key,
      stderrTail: '',
    };
    this.activeRuntime = runtime;

    child.stderr.on('data', (chunk: Buffer) => {
      runtime.stderrTail = appendTail(runtime.stderrTail, chunk.toString('utf8'));
    });
    child.stdout.on('data', () => {
      // DeepSeek-TUI may write startup banners; health checks are the source of truth.
    });
    child.on('exit', () => {
      if (this.activeRuntime?.child === child) {
        this.activeRuntime = null;
      }
    });

    await this.waitUntilHealthy(runtime);
    console.log('[DeepSeekTuiRuntime] runtime started on a local HTTP port');
    return connection;
  }

  stop(): void {
    if (!this.activeRuntime) return;
    const { child } = this.activeRuntime;
    this.activeRuntime = null;
    if (!child.killed) {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 2_000).unref();
    }
  }

  async healthCheck(connection: DeepSeekTuiRuntimeConnection): Promise<boolean> {
    try {
      const response = await fetch(`${connection.baseUrl}/health`, {
        headers: {
          Authorization: `Bearer ${connection.token}`,
          'x-deepseek-runtime-token': connection.token,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async waitUntilHealthy(runtime: ActiveRuntime): Promise<void> {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.activeRuntime !== runtime) {
        throw new Error('DeepSeek-TUI runtime was stopped before it became ready.');
      }
      if (runtime.child.exitCode !== null) {
        throw new Error(this.formatStartupError(runtime));
      }
      if (await this.healthCheck(runtime.connection)) {
        return;
      }
      await delay(HEALTH_INTERVAL_MS);
    }
    runtime.child.kill('SIGTERM');
    throw new Error(this.formatStartupError(runtime));
  }

  private formatStartupError(runtime: ActiveRuntime): string {
    const detail = runtime.stderrTail.trim();
    return [
      'DeepSeek-TUI runtime failed to start.',
      detail ? `Process stderr:\n${detail}` : '',
    ].filter(Boolean).join('\n\n');
  }
}
