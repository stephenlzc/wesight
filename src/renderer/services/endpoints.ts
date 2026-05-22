/**
 * 集中管理所有业务 API 端点。
 * 后续新增的业务接口也应在此文件中配置。
 */

import { configService } from './config';

const isTestMode = () => {
  return configService.getConfig().app?.testMode === true;
};

const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/freestylefly/wesight/releases/latest';
const WESIGHT_API_BASE_URL = 'https://api.wesight.ai';

// 自动更新
export const getUpdateCheckUrl = () => isTestMode()
  ? GITHUB_LATEST_RELEASE_URL
  : GITHUB_LATEST_RELEASE_URL;

// 手动检查更新
export const getManualUpdateCheckUrl = () => isTestMode()
  ? GITHUB_LATEST_RELEASE_URL
  : GITHUB_LATEST_RELEASE_URL;

export const getFallbackDownloadUrl = () => isTestMode()
  ? 'https://wesight.ai/'
  : 'https://wesight.ai/';

// Skill 商店
export const getSkillStoreUrl = () => isTestMode()
  ? `${WESIGHT_API_BASE_URL}/api/skills/store`
  : `${WESIGHT_API_BASE_URL}/api/skills/store`;

// Portal 页面
const PORTAL_BASE_TEST = 'https://wesight.ai';
const PORTAL_BASE_PROD = 'https://wesight.ai';

const getPortalBase = () => isTestMode() ? PORTAL_BASE_TEST : PORTAL_BASE_PROD;

export const getPortalPricingUrl = () => `${getPortalBase()}/pricing`;
export const getPortalProfileUrl = () => `${getPortalBase()}/profile`;
