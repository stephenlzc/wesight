import { beforeEach, expect, test, vi } from 'vitest';

import { checkForAppUpdate } from './appUpdate';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('window', {
    electron: {
      platform: 'win32',
      arch: 'x64',
      api: {
        fetch: vi.fn(),
      },
    },
  });
});

test('checkForAppUpdate treats missing GitHub latest release as no update', async () => {
  const fetchMock = window.electron.api.fetch as ReturnType<typeof vi.fn>;
  fetchMock.mockResolvedValue({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    headers: {},
    data: { message: 'Not Found' },
  });

  await expect(checkForAppUpdate('2026.6.1-preview.1')).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({
    expectedStatuses: [404],
  }));
});

test('checkForAppUpdate selects the WeSight macOS asset for the current architecture', async () => {
  vi.stubGlobal('window', {
    electron: {
      platform: 'darwin',
      arch: 'arm64',
      api: {
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: {},
          data: {
            tag_name: 'v2026.6.2',
            name: 'WeSight 2026.6.2',
            published_at: '2026-06-02T00:00:00Z',
            body: 'Release notes',
            assets: [
              {
                name: 'Youdao-Claw-2026.6.2-arm64.dmg',
                browser_download_url: 'https://example.com/youdao-claw.dmg',
              },
              {
                name: 'latest-mac.yml',
                browser_download_url: 'https://example.com/latest-mac.yml',
              },
              {
                name: 'WeSight-2026.6.2-arm64.dmg',
                browser_download_url: 'https://example.com/wesight-arm64.dmg',
              },
            ],
          },
        }),
      },
    },
  });

  await expect(checkForAppUpdate('2026.6.1')).resolves.toMatchObject({
    latestVersion: '2026.6.2',
    url: 'https://example.com/wesight-arm64.dmg',
  });
});

test('checkForAppUpdate ignores releases without a WeSight installer asset', async () => {
  vi.stubGlobal('window', {
    electron: {
      platform: 'darwin',
      arch: 'arm64',
      api: {
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: {},
          data: {
            tag_name: 'v2026.6.2',
            name: 'WeSight 2026.6.2',
            assets: [
              {
                name: 'Youdao-Claw-2026.6.2-arm64.dmg',
                browser_download_url: 'https://example.com/youdao-claw.dmg',
              },
              {
                name: 'WeSight-2026.6.2-arm64.dmg.blockmap',
                browser_download_url: 'https://example.com/wesight-arm64.dmg.blockmap',
              },
            ],
          },
        }),
      },
    },
  });

  await expect(checkForAppUpdate('2026.6.1')).resolves.toBeNull();
});
