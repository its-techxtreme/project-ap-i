import { config } from '../config'

import { AiMetadataProvider } from './AiMetadataProvider'
import { MockMetadataProvider } from './MockMetadataProvider'
import type { MetadataProvider } from './types'

export function createMetadataProvider(): MetadataProvider {
  if (config.NODE_ENV === 'test' && !config.INTEGRATION_TESTS_ENABLED) {
    return new MockMetadataProvider()
  }
  return new AiMetadataProvider()
}

export { AiMetadataProvider, DEFAULT_AI_MODEL, isAiProviderConfigured } from './AiMetadataProvider'
export { MockMetadataProvider } from './MockMetadataProvider'
export { buildMetadataPrompt } from './prompts'
export { getFallbackMetadata } from './fallbacks'
export { parseMetadataJson } from './parseMetadataJson'
export type { MetadataInput, MetadataOutput, MetadataProvider } from './types'
